// ============================================================
// Haze Launcher — Constants
// ============================================================

import { type GlobalSettings, type InstanceSettings, type JvmPreset } from './types'

// ─── API URLs ───────────────────────────────────────────────

export const MOJANG_VERSION_MANIFEST =
  'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

export const MOJANG_RESOURCES_URL = 'https://resources.download.minecraft.net'

export const FABRIC_META_URL = 'https://meta.fabricmc.net/v2'
export const QUILT_META_URL = 'https://meta.quiltmc.org/v3'
export const FORGE_MAVEN_URL = 'https://maven.minecraftforge.net'
export const NEOFORGE_MAVEN_URL = 'https://maven.neoforged.net/releases'
export const LITELOADER_URL = 'https://dl.liteloader.com/versions/versions.json'

export const MODRINTH_API_URL = 'https://api.modrinth.com/v2'
export const CURSEFORGE_API_URL = 'https://api.curseforge.com'
export const CURSEFORGE_MINECRAFT_GAME_ID = 432

export const ADOPTIUM_API_URL = 'https://api.adoptium.net/v3'

export const ELYBY_API_URL = 'https://authserver.ely.by'
export const ELYBY_SKINS_URL = 'https://skinsystem.ely.by'
export const AUTHLIB_INJECTOR_URL =
  'https://github.com/yushijinhun/authlib-injector/releases/latest/download/authlib-injector.jar'
export const AUTHLIB_INJECTOR_API = 'https://authlib-injector.yushi.moe'

export const MCLO_GS_API = 'https://api.mclo.gs/1/log'

export const CRAFATAR_URL = 'https://crafatar.com'

// ─── App Metadata ───────────────────────────────────────────

export const APP_NAME = 'Haze'
export const APP_ID = 'haze-launcher'
export const APP_VERSION = '1.0.0'
export const DEFAULT_CURSEFORGE_API_KEY = '$2a$10$FY2I.0aFWof5dKp6pdG14ed2wLGdqs2sXPAvScRU0592oUH3jcwqC'
export const APP_USER_AGENT = `HazeLauncher/${APP_VERSION}`

// ─── JVM Presets ────────────────────────────────────────────

export const JVM_PRESETS: Record<JvmPreset, string> = {
  default: '-Xmx2G -Xms512M',
  g1gc: [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
  ].join(' '),
  zgc: '-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch -XX:+DisableExplicitGC',
  aikars: [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
  ].join(' '),
  lowend: '-XX:+UseSerialGC -XX:+AlwaysPreTouch -XX:+DisableExplicitGC',
  custom: '',
}

// ─── Java Version Mapping ───────────────────────────────────

export const JAVA_VERSION_MAP: { minMcVersion: string; javaVersion: number }[] = [
  { minMcVersion: '1.21', javaVersion: 21 },
  { minMcVersion: '1.17', javaVersion: 17 },
  { minMcVersion: '0.0', javaVersion: 8 },
]

// ─── Default Settings ───────────────────────────────────────

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  language: 'en',
  theme: 'dark',
  accentColor: '#7c5cff',
  launcherBehavior: 'minimize',
  dataDirectory: '',
  checkUpdatesOnStartup: true,
  analyticsEnabled: false,
  javaAutoDetect: true,
  javaAutoDownload: true,
  defaultJavaPath: '',
  downloadConcurrency: 8,
  downloadSpeedLimit: 0,
  defaultMinRam: 512,
  defaultMaxRam: 2048,
  defaultJvmArgs: '',
  defaultJvmPreset: 'default',
  defaultWindowWidth: 854,
  defaultWindowHeight: 480,
  discordRpcEnabled: true,
  curseforgeApiKey: '',
  useCurseForge: true, // New: Toggle CurseForge search
  closeLauncherOnGameStart: false,
  showSnapshotNotifications: true,
}

export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  javaPath: '',
  minRam: 512,
  maxRam: 2048,
  jvmArgs: '',
  jvmPreset: 'default',
  windowWidth: 854,
  windowHeight: 480,
  fullscreen: false,
  autoBackup: false,
  backupInterval: 0,
  maxBackups: 5,
  closeOnLaunch: false,
  showLog: true,
}

// ─── Version Categories (for April Fools, etc.) ─────────────

export const APRIL_FOOLS_VERSIONS = new Set([
  '2.0',
  '15w14a',
  '1.RV-Pre1',
  '3D Shareware v1.34',
  '20w14infinite',
  '22w13oneblockatatime',
  '23w13a_or_b',
  '24w14potato',
])

// ─── Cache TTL ──────────────────────────────────────────────

export const VERSION_MANIFEST_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
export const NEWS_CACHE_TTL = 60 * 60 * 1000 // 1 hour
export const SNAPSHOT_POLL_INTERVAL = 2 * 60 * 60 * 1000 // 2 hours

// ─── Download Settings ──────────────────────────────────────

export const MAX_DOWNLOAD_RETRIES = 3
export const DOWNLOAD_RETRY_DELAY = 1000 // ms (base, exponential)
export const DEFAULT_DOWNLOAD_CONCURRENCY = 8

// ─── Supported Platforms ────────────────────────────────────

export type OsPlatform = 'windows' | 'linux' | 'osx'

export function getCurrentPlatform(): OsPlatform {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'osx'
    default:
      return 'linux'
  }
}

export function getCurrentArch(): string {
  return process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'x86'
}
