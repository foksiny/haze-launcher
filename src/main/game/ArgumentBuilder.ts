// ============================================================
// Haze Launcher — Argument Builder
// Constructs JVM and game arguments from version JSON
// ============================================================

import { getCurrentPlatform, getCurrentArch } from '../../shared/constants'
import { evaluateRules, getClasspathSeparator } from '../../shared/utils'
import type { VersionJson, ArgumentRule } from '../../shared/types'

export interface ArgumentContext {
  // Auth
  authPlayerName: string
  authUuid: string
  authAccessToken: string
  userType: string

  // Paths
  gameDir: string
  assetsDir: string
  assetIndex: string
  nativesDir: string
  libraryDir: string
  classpath: string

  // Version
  versionName: string
  versionType: string

  // Window
  resolutionWidth: number
  resolutionHeight: number
  hasCustomResolution: boolean

  // Server connect
  quickPlayHost?: string
  quickPlayPort?: number

  // JVM
  launcherName: string
  launcherVersion: string
}

/**
 * Build JVM arguments from version JSON and context.
 */
export function buildJvmArguments(
  versionJson: VersionJson,
  context: ArgumentContext,
  customJvmArgs: string,
  minRam: number,
  maxRam: number,
  javaMajorVersion: number,
  authlibInjectorPath?: string
): string[] {
  const args: string[] = []

  // RAM allocation
  args.push(`-Xms${minRam}M`)
  args.push(`-Xmx${maxRam}M`)

  // Custom JVM args (from preset or user)
  if (customJvmArgs) {
    args.push(...customJvmArgs.split(/\s+/).filter(Boolean))
  }

  // Authlib injector (for Ely.by)
  if (authlibInjectorPath) {
    args.push(`-javaagent:${authlibInjectorPath}=https://authlib-injector.ely.by/`)
  }

  // Arguments from version JSON
  if (versionJson.arguments?.jvm) {
    args.push(...resolveArguments(versionJson.arguments.jvm, context))
  } else {
    // Legacy versions don't have JVM arguments in JSON; use defaults
    args.push(`-Djava.library.path=${context.nativesDir}`)
  }

  // Ensure natives path is always set for modloader versions
  if (versionJson.inheritsFrom) {
    const hasLibraryPath = args.some((a) => a.startsWith('-Djava.library.path='))
    if (!hasLibraryPath) {
      args.push(`-Djava.library.path=${context.nativesDir}`)
    }
  }

  // Always ensure classpath is set (needed for both legacy and modern versions)
  const cpIdx = args.findIndex((a) => a === '-cp' || a === '-classpath')
  if (cpIdx === -1) {
    args.push('-cp')
    args.push(context.classpath)
  } else {
    // If -cp exists but classpath is empty, replace it
    if (!args[cpIdx + 1]) {
      args[cpIdx + 1] = context.classpath
    }
  }

  // Logging config
  if (versionJson.logging?.client) {
    const logArg = versionJson.logging.client.argument
    if (logArg) {
      const logFile = versionJson.logging.client.file
      // The logging argument typically has a ${path} placeholder
      args.push(logArg.replace('${path}', `${context.gameDir}/log4j2.xml`))
    }
  }

  // Final filter: Remove arguments incompatible with the target Java version
  return filterJvmArgs(args, javaMajorVersion)
}

/**
 * Filter out JVM arguments that are incompatible with the target Java version.
 */
function filterJvmArgs(args: string[], javaMajorVersion: number): string[] {
  const filtered: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    let skip = false

    // Java 22+ flags (skip entirely - was removed in stable releases, use --enable-native-access instead)
    if (arg.includes('--sun-misc-unsafe-memory-access')) {
      skip = true
    }

    // Java 17+ flags
    if (arg.startsWith('--enable-native-access')) {
      if (javaMajorVersion < 17) skip = true
    }

    // Java 9+ module flags
    const moduleFlags = [
      '--add-modules',
      '--add-opens',
      '--add-exports',
      '--add-reads',
      '--patch-module',
      '--illegal-access',
    ]

    if (moduleFlags.some((flag) => arg.startsWith(flag))) {
      if (javaMajorVersion < 9) {
        skip = true
        // If the flag doesn't contain '=' and isn't the last element, 
        // the next element is likely the value for this flag.
        if (!arg.includes('=') && i + 1 < args.length) {
          const nextArg = args[i + 1]
          // Simple heuristic: if next arg doesn't start with '-', it's likely a value
          if (!nextArg.startsWith('-')) {
            i++ // Skip the value too
          }
        }
      }
    }

    if (!skip) {
      filtered.push(arg)
    }
  }

  return filtered
}

/**
 * Build game arguments from version JSON and context.
 */
export function buildGameArguments(
  versionJson: VersionJson,
  context: ArgumentContext
): string[] {
  const args: string[] = []

  // For modloaders (Forge/NeoForge) that have inheritsFrom and minecraftArguments,
  // use the legacy format which contains the --tweakClass argument
  const isModloader = !!versionJson.inheritsFrom
  const hasLegacyArgs = !!versionJson.minecraftArguments && isModloader

  if (versionJson.arguments?.game && !hasLegacyArgs) {
    // Modern format (1.13+)
    args.push(...resolveArguments(versionJson.arguments.game, context))
  } else if (versionJson.minecraftArguments) {
    // Legacy format (pre-1.13) or modloader with tweak class
    const templateArgs = versionJson.minecraftArguments.split(/\s+/)
    for (const arg of templateArgs) {
      args.push(substituteVariables(arg, context))
    }
  }

  // Quick play / server connect arguments
  if (context.quickPlayHost) {
    // 1.20+ uses --quickPlayMultiplayer
    const port = context.quickPlayPort || 25565
    args.push('--quickPlayMultiplayer', `${context.quickPlayHost}:${port}`)

    // Also add legacy args for older versions
    args.push('--server', context.quickPlayHost)
    args.push('--port', String(port))
  }

  // Filter out empty quick play arguments (Minecraft 26.x rejects multiple quick play options)
  const quickPlayFlags = ['--quickPlayPath', '--quickPlaySingleplayer', '--quickPlayMultiplayer', '--quickPlayRealms']
  const result: string[] = []
  let skipNext = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    // Skip empty strings
    if (arg === '') continue
    if (skipNext) {
      skipNext = false
      continue
    }
    if (quickPlayFlags.includes(arg) && args[i + 1] === '') {
      skipNext = true
      continue
    }
    result.push(arg)
  }
  return result
}

/**
 * Resolve modern argument arrays, handling rules and variable substitution.
 */
function resolveArguments(
  args: (string | ArgumentRule)[],
  context: ArgumentContext
): string[] {
  const resolved: string[] = []

  for (const arg of args) {
    if (typeof arg === 'string') {
      resolved.push(substituteVariables(arg, context))
    } else {
      // Conditional argument with rules
      if (evaluateRulesWithFeatures(arg.rules, context)) {
        if (Array.isArray(arg.value)) {
          for (const v of arg.value) {
            resolved.push(substituteVariables(v, context))
          }
        } else {
          resolved.push(substituteVariables(arg.value, context))
        }
      }
    }
  }

  return resolved
}

/**
 * Evaluate rules including feature checks (e.g., has_custom_resolution).
 */
function evaluateRulesWithFeatures(
  rules: ArgumentRule['rules'],
  context: ArgumentContext
): boolean {
  for (const rule of rules) {
    let matches = true

    // Check OS conditions
    if (rule.os) {
      const platform = getCurrentPlatform()
      const arch = getCurrentArch()
      if (rule.os.name && rule.os.name !== platform) matches = false
      if (rule.os.arch && rule.os.arch !== arch) matches = false
    }

    // Check feature conditions
    if (rule.features) {
      if (rule.features.has_custom_resolution !== undefined) {
        if (rule.features.has_custom_resolution !== context.hasCustomResolution) {
          matches = false
        }
      }
      if (rule.features.is_demo_user !== undefined) {
        // We never run in demo mode
        if (rule.features.is_demo_user) matches = false
      }
      if (rule.features.is_quick_play_multiplayer !== undefined) {
        const hasQuickPlay = !!context.quickPlayHost
        if (rule.features.is_quick_play_multiplayer !== hasQuickPlay) matches = false
      }
    }

    if (rule.action === 'allow' && !matches) return false
    if (rule.action === 'disallow' && matches) return false
  }

  return true
}

/**
 * Substitute ${variable} placeholders in an argument string.
 */
function substituteVariables(template: string, context: ArgumentContext): string {
  const vars: Record<string, string> = {
    '${auth_player_name}': context.authPlayerName,
    '${version_name}': context.versionName,
    '${game_directory}': context.gameDir,
    '${assets_root}': context.assetsDir,
    '${assets_index_name}': context.assetIndex,
    '${auth_uuid}': context.authUuid,
    '${auth_access_token}': context.authAccessToken,
    '${user_type}': context.userType,
    '${version_type}': context.versionType,
    '${natives_directory}': context.nativesDir,
    '${launcher_name}': context.launcherName,
    '${launcher_version}': context.launcherVersion,
    '${classpath}': context.classpath,
    '${resolution_width}': String(context.resolutionWidth),
    '${resolution_height}': String(context.resolutionHeight),
    '${library_directory}': context.libraryDir,
    '${classpath_separator}': getClasspathSeparator(),
    '${auth_session}': `token:${context.authAccessToken}`,
    '${game_assets}': context.assetsDir,
    '${user_properties}': '{}',
    '${clientid}': '',
    '${auth_xuid}': '',
    '${quickPlayPath}': '',
    '${quickPlaySingleplayer}': '',
    '${quickPlayMultiplayer}': context.quickPlayHost
      ? `${context.quickPlayHost}:${context.quickPlayPort || 25565}`
      : '',
    '${quickPlayRealms}': '',
  }

  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value)
  }

  return result
}
