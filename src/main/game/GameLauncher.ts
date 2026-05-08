// ============================================================
// Haze Launcher — Game Launcher
// Pre-launch checks, process spawning, log capture
// ============================================================

import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import { logger } from '../logging/Logger'
import { VersionManager } from '../versions/VersionManager'
import { AssetManager } from '../versions/AssetManager'
import { LibraryManager } from '../versions/LibraryManager'
import { JavaManager } from '../java/JavaManager'
import { DownloadEngine } from '../download/DownloadEngine'
import { buildJvmArguments, buildGameArguments, type ArgumentContext } from './ArgumentBuilder'
import { JVM_PRESETS, APP_NAME, APP_VERSION } from '../../shared/constants'
import { generateOfflineUUID, getClasspathSeparator } from '../../shared/utils'
import type { Instance, Account, VersionJson, JvmPreset } from '../../shared/types'

export interface GameState {
  instanceId: string
  status: 'preparing' | 'downloading' | 'launching' | 'running' | 'crashed' | 'stopped'
  pid?: number
  startTime?: number
  log: string[]
}

export class GameLauncher extends EventEmitter {
  private dataDir: string
  private versionManager: VersionManager
  private assetManager: AssetManager
  private libraryManager: LibraryManager
  private javaManager: JavaManager
  private downloadEngine: DownloadEngine
  private runningGames: Map<string, { process: ChildProcess; state: GameState }> = new Map()

  constructor(
    dataDir: string,
    versionManager: VersionManager,
    assetManager: AssetManager,
    libraryManager: LibraryManager,
    javaManager: JavaManager,
    downloadEngine: DownloadEngine
  ) {
    super()
    this.dataDir = dataDir
    this.versionManager = versionManager
    this.assetManager = assetManager
    this.libraryManager = libraryManager
    this.javaManager = javaManager
    this.downloadEngine = downloadEngine
  }

  /**
   * Launch a Minecraft instance.
   */
  async launch(
    instance: Instance,
    account: Account,
    javaPath: string,
    authlibInjectorPath?: string
  ): Promise<GameState> {
    const instanceDir = join(this.dataDir, 'instances', instance.id)
    const gameDir = join(instanceDir, '.minecraft')
    const nativesDir = join(instanceDir, 'natives')
    const state: GameState = {
      instanceId: instance.id,
      status: 'preparing',
      log: [],
    }

    this.emitState(state)

    try {
      // ─── Step 1: Validate Java ─────────────────────────────
      logger.info('GameLauncher', `Step 1: Validating Java at ${javaPath}`)
      if (!existsSync(javaPath)) {
        throw new Error(`Java executable not found: ${javaPath}`)
      }

      // ─── Step 2: Get and resolve version JSON ──────────────
      logger.info('GameLauncher', `Step 2: Loading version JSON for ${instance.minecraftVersion}`)
      state.status = 'downloading'
      this.emitState(state)

      let versionJson = await this.versionManager.getVersionJson(instance.minecraftVersion)

      // Check for modloader version JSON
      const modloaderVersionId = this.getModloaderVersionId(instance)
      if (modloaderVersionId) {
        try {
          const modloaderJson = await this.versionManager.getVersionJson(modloaderVersionId)
          versionJson = await this.versionManager.resolveInheritance(modloaderJson)
        } catch (err: any) {
          throw new Error(`Failed to load modloader version JSON for ${modloaderVersionId}. The installation may be corrupt. Please recreate this instance.\nDetails: ${err.message || err}`)
        }
      }

      // ─── Step 3: Download game files ───────────────────────
      logger.info('GameLauncher', 'Step 3: Downloading game files...')

      // Forward download progress events
      this.downloadEngine.on('progress', (progress) => {
        this.emit('download-progress', { instanceId: instance.id, ...progress })
      })

      await this.libraryManager.downloadLibraries(versionJson)
      await this.assetManager.downloadAssets(versionJson)

      this.downloadEngine.removeAllListeners('progress')

      // ─── Step 4: Extract natives ───────────────────────────
      logger.info('GameLauncher', 'Step 4: Extracting natives...')
      await this.libraryManager.extractNatives(versionJson, nativesDir)

      // ─── Step 5: Set up virtual assets if needed ───────────
      const assetsDir = await this.assetManager.setupVirtualAssets(versionJson, instanceDir)

      // ─── Step 6: Build classpath ───────────────────────────
      logger.info('GameLauncher', 'Step 5: Building classpath...')
      const classpath = this.libraryManager.buildClasspath(versionJson)

      // ─── Step 7: Build arguments ──────────────────────────
      logger.info('GameLauncher', 'Step 6: Building arguments...')

      // Ensure game directory exists
      mkdirSync(gameDir, { recursive: true })
      mkdirSync(join(gameDir, 'mods'), { recursive: true })
      mkdirSync(join(gameDir, 'resourcepacks'), { recursive: true })
      mkdirSync(join(gameDir, 'shaderpacks'), { recursive: true })
      mkdirSync(join(gameDir, 'saves'), { recursive: true })
      mkdirSync(join(gameDir, 'screenshots'), { recursive: true })

      const assetIndex = versionJson.assetIndex?.id || versionJson.assets || ''

      const context: ArgumentContext = {
        authPlayerName: account.username,
        authUuid: account.uuid.replace(/-/g, ''),
        authAccessToken: account.elybyToken || '0',
        userType: account.type === 'elyby' ? 'mojang' : 'legacy',
        gameDir,
        assetsDir: this.assetManager.getAssetsDir(),
        assetIndex,
        nativesDir,
        libraryDir: join(this.dataDir, 'libraries'),
        classpath,
        versionName: versionJson.id,
        versionType: versionJson.type,
        resolutionWidth: instance.settings.windowWidth,
        resolutionHeight: instance.settings.windowHeight,
        hasCustomResolution: true,
        launcherName: APP_NAME,
        launcherVersion: APP_VERSION,
      }

      // Get JVM preset flags
      const presetFlags = JVM_PRESETS[instance.settings.jvmPreset] || ''
      const customFlags = instance.settings.jvmPreset === 'custom'
        ? instance.settings.jvmArgs
        : presetFlags

      // Detect Java major version
      const javaInfo = await this.javaManager.getJavaInfo(javaPath)
      const javaMajorVersion = javaInfo?.majorVersion || 8

      let jvmArgs = buildJvmArguments(
        versionJson,
        context,
        customFlags,
        instance.settings.minRam,
        instance.settings.maxRam,
        javaMajorVersion,
        authlibInjectorPath
      )

      // ─── Step 7: NeoForge Module Compatibility Fix ─────────
      // In NeoForge 1.21+, the bootstrap requires certain modules (like LWJGL) 
      // to be on the module path to be visible to its internal layers.
      const modulePathIdx = jvmArgs.findIndex((arg) => arg === '-p' || arg === '--module-path')
      if (modulePathIdx !== -1) {
        const separator = getClasspathSeparator()
        const allPaths = context.classpath.split(separator)
        const existingMp = jvmArgs[modulePathIdx + 1] || ''

        // Surgical Merge:
        // 1. Keep the original bootstrap jars from the JSON's -p argument.
        // 2. Add LWJGL jars to the module path so earlydisplay (a module) can see them.
        // 3. Keep everything else on the classpath to avoid "Empty version string" errors
        //    caused by automatic module versioning issues in FML.
        const bootstrapLibs = existingMp.split(separator).map(p => p.trim()).filter(p => !!p)
        const lwjglLibs = allPaths.filter((p) => p.includes('org.lwjgl'))
        
        // Final Module Path
        const mergedMp = Array.from(new Set([...bootstrapLibs, ...lwjglLibs]))
        jvmArgs[modulePathIdx + 1] = mergedMp.join(separator)

        // Update the classpath: Remove only the jars we moved to the module path
        const mpSet = new Set(mergedMp)
        const finalCp = allPaths.filter(p => !mpSet.has(p))
        
        const cpIdx = jvmArgs.findIndex((arg) => arg === '-cp' || arg === '-classpath')
        if (cpIdx !== -1) {
          jvmArgs[cpIdx + 1] = finalCp.join(separator)
        }
      }

      const gameArgs = buildGameArguments(versionJson, context)
      const mainClass = versionJson.mainClass

      logger.info('GameLauncher', `Game arguments: ${gameArgs.join(' ')}`)
      logger.info('GameLauncher', `Main class: ${mainClass}`)

      // ─── Step 8: Launch ────────────────────────────────────
      logger.info('GameLauncher', 'Step 7: Launching game process...')
      state.status = 'launching'
      this.emitState(state)

      const fullArgs = [...jvmArgs, mainClass, ...gameArgs]
      logger.info('GameLauncher', `Launching with Java: ${javaPath}`)
      logger.info('GameLauncher', `Arguments: ${fullArgs.join(' ')}`)

      const gameProcess = spawn(javaPath, fullArgs, {
        cwd: gameDir,
        env: {
          ...process.env,
          APPDATA: instanceDir, // Isolate .minecraft
        },
        detached: false,
      })

      state.status = 'running'
      state.pid = gameProcess.pid
      state.startTime = Date.now()
      this.emitState(state)

      this.runningGames.set(instance.id, { process: gameProcess, state })

      // Capture stdout
      gameProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          state.log.push(line)
          this.emit('game-log', { instanceId: instance.id, line })
          logger.info('GameOutput', line)

          // Detect game ready
          if (line.includes('Setting user:') || line.includes('LWJGL Version')) {
            logger.info('GameLauncher', 'Game window appeared')
          }
        }
      })

      // Capture stderr
      gameProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          state.log.push(`[STDERR] ${line}`)
          this.emit('game-log', { instanceId: instance.id, line: `[STDERR] ${line}` })
          logger.warn('GameOutput', line)
        }
      })

      // Handle process exit
      gameProcess.on('close', (code) => {
        const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0
        state.status = code === 0 ? 'stopped' : 'crashed'
        logger.info('GameLauncher', `Game exited with code ${code} after ${elapsed}s`)
        this.emitState(state)
        
        const finalLog = [...state.log]
        this.runningGames.delete(instance.id)
        this.emit('game-exited', {
          instanceId: instance.id,
          exitCode: code,
          playTime: elapsed,
          crashed: code !== 0,
          log: finalLog
        })
      })

      gameProcess.on('error', (err) => {
        state.status = 'crashed'
        logger.error('GameLauncher', `Game process error: ${err.message}`)
        state.log.push(`[ERROR] ${err.message}`)
        this.emitState(state)
        this.runningGames.delete(instance.id)
      })

      return state
    } catch (err) {
      state.status = 'crashed'
      const message = err instanceof Error ? err.message : String(err)
      state.log.push(`[LAUNCHER ERROR] ${message}`)
      logger.error('GameLauncher', `Launch failed: ${message}`)
      this.emitState(state)
      throw err
    }
  }

  /**
   * Stop a running game instance.
   */
  stopInstance(instanceId: string): void {
    const entry = this.runningGames.get(instanceId)
    if (entry) {
      logger.info('GameLauncher', `Stopping instance ${instanceId} (pid ${entry.state.pid})`)
      entry.process.kill('SIGTERM')
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        try {
          entry.process.kill('SIGKILL')
        } catch {
          // Already dead
        }
      }, 5000)
    }
  }

  /**
   * Get the state of a running game.
   */
  getGameState(instanceId: string): GameState | null {
    return this.runningGames.get(instanceId)?.state || null
  }

  /**
   * Get PIDs of all running games.
   */
  getRunningPids(): Record<string, number> {
    const pids: Record<string, number> = {}
    for (const [id, entry] of this.runningGames.entries()) {
      if (entry.state.pid) pids[id] = entry.state.pid
    }
    return pids
  }

  /**
   * Check if an instance is currently running.
   */
  isRunning(instanceId: string): boolean {
    return this.runningGames.has(instanceId)
  }

  /**
   * Get the game log for a running instance.
   */
  getGameLog(instanceId: string): string[] {
    return this.runningGames.get(instanceId)?.state.log || []
  }

  /**
   * Determine the modloader version ID for version JSON lookup.
   */
  private getModloaderVersionId(instance: Instance): string | null {
    if (instance.modloader === 'vanilla' || !instance.modloaderVersion) return null

    switch (instance.modloader) {
      case 'fabric':
        return `fabric-loader-${instance.modloaderVersion}-${instance.minecraftVersion}`
      case 'quilt':
        return `quilt-loader-${instance.modloaderVersion}-${instance.minecraftVersion}`
      case 'forge':
        return `${instance.minecraftVersion}-forge-${instance.modloaderVersion}`
      case 'neoforge':
        return `neoforge-${instance.modloaderVersion}`
      case 'liteloader':
        return `liteloader-${instance.minecraftVersion}`
      default:
        return null
    }
  }

  private emitState(state: GameState): void {
    this.emit('state-changed', { ...state, log: undefined }) // Don't send full log in state events
  }
}
