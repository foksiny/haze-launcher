// ============================================================
// Haze Launcher — Shared Type Definitions
// All interfaces and types used across main, preload, renderer
// ============================================================

// ─── Minecraft Versions ─────────────────────────────────────

export type VersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface VersionManifest {
  latest: {
    release: string
    snapshot: string
  }
  versions: VersionEntry[]
}

export interface VersionEntry {
  id: string
  type: VersionType
  url: string
  time: string
  releaseTime: string
  sha1: string
  complianceLevel: number
}

export interface VersionJson {
  id: string
  type: VersionType
  mainClass: string
  inheritsFrom?: string
  jar?: string
  minecraftArguments?: string
  arguments?: {
    game: (string | ArgumentRule)[]
    jvm: (string | ArgumentRule)[]
  }
  libraries: Library[]
  downloads: {
    client: DownloadArtifact
    server?: DownloadArtifact
    client_mappings?: DownloadArtifact
    server_mappings?: DownloadArtifact
  }
  assetIndex: {
    id: string
    sha1: string
    size: number
    totalSize: number
    url: string
  }
  assets: string
  complianceLevel?: number
  javaVersion?: {
    component: string
    majorVersion: number
  }
  logging?: {
    client: {
      argument: string
      file: {
        id: string
        sha1: string
        size: number
        url: string
      }
      type: string
    }
  }
  releaseTime: string
  time: string
}

export interface ArgumentRule {
  rules: Rule[]
  value: string | string[]
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: {
    name?: string
    version?: string
    arch?: string
  }
  features?: Record<string, boolean>
}

export interface Library {
  name: string
  downloads?: {
    artifact?: DownloadArtifact
    classifiers?: Record<string, DownloadArtifact>
  }
  url?: string
  rules?: Rule[]
  natives?: Record<string, string>
  extract?: {
    exclude?: string[]
  }
}

export interface DownloadArtifact {
  path?: string
  sha1: string
  size: number
  url: string
}

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
}

// ─── Instances ──────────────────────────────────────────────

export type ModloaderType = 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt' | 'liteloader'

export interface Instance {
  id: string
  name: string
  icon: string // path to custom icon or 'default'
  description: string
  group: string
  minecraftVersion: string
  modloader: ModloaderType
  modloaderVersion: string
  createdAt: string
  lastPlayed: string
  totalPlayTime: number // seconds
  settings: InstanceSettings
  linkedAccountId: string
}

export interface InstanceSettings {
  javaPath: string // empty = use global/auto
  minRam: number // MB
  maxRam: number // MB
  jvmArgs: string
  jvmPreset: JvmPreset
  windowWidth: number
  windowHeight: number
  fullscreen: boolean
  autoBackup: boolean
  backupInterval: number // minutes, 0 = every launch
  maxBackups: number
  closeOnLaunch: boolean
  showLog: boolean
}

export type JvmPreset = 'default' | 'g1gc' | 'zgc' | 'aikars' | 'lowend' | 'custom'

// ─── Accounts ───────────────────────────────────────────────

export type AccountType = 'offline' | 'elyby'

export interface Account {
  id: string
  type: AccountType
  username: string
  uuid: string
  skinUrl: string
  skinModel: 'classic' | 'slim'
  capeUrl: string
  elybyToken: string
  elybyRefreshToken: string
  createdAt: string
  lastUsed: string
}

// ─── Mods ───────────────────────────────────────────────────

export type ModSource = 'modrinth' | 'curseforge' | 'manual'
export type ProjectType = 'mod' | 'resourcepack'

export interface InstalledMod {
  id: string
  name: string
  version: string
  fileName: string
  source: ModSource
  sourceId: string // project ID on modrinth/curseforge
  sourceVersionId: string
  enabled: boolean
  iconUrl: string
  description: string
  authors: string[]
  installedAt: string
  dependencies: string[]
}

export interface ModSearchResult {
  id: string
  source: ModSource
  projectType: ProjectType
  name: string
  slug: string
  description: string
  author: string
  iconUrl: string
  downloads: number
  lastUpdated: string
  categories: string[]
  versions: string[]
  loaders: string[]
}

export interface ModVersion {
  id: string
  modId: string
  source: ModSource
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  fileName: string
  fileSize: number
  fileUrl: string
  sha1: string
  sha512: string
  dependencies: ModDependency[]
  datePublished: string
}

export interface ModDependency {
  projectId: string
  dependencyType: 'required' | 'optional' | 'incompatible'
  versionId?: string
  fileName?: string
}

// ─── Downloads ──────────────────────────────────────────────

export interface DownloadTask {
  id: string
  url: string
  path: string
  sha1?: string
  size: number
  progress: number // bytes downloaded
  speed: number // bytes/sec
  status: 'pending' | 'downloading' | 'verifying' | 'completed' | 'failed' | 'retrying'
  error?: string
  retries: number
}

export interface DownloadProgress {
  taskId: string
  totalFiles: number
  completedFiles: number
  totalBytes: number
  downloadedBytes: number
  speed: number // bytes/sec
  currentFile: string
  eta: number // seconds
  status: 'downloading' | 'verifying' | 'completed' | 'failed'
}

// ─── Settings ───────────────────────────────────────────────

export interface GlobalSettings {
  language: string
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  launcherBehavior: 'minimize' | 'close' | 'keep'
  dataDirectory: string
  checkUpdatesOnStartup: boolean
  analyticsEnabled: boolean

  // Java
  javaAutoDetect: boolean
  javaAutoDownload: boolean
  defaultJavaPath: string

  // Downloads
  downloadConcurrency: number
  downloadSpeedLimit: number // KB/s, 0 = unlimited

  // Instance defaults
  defaultMinRam: number
  defaultMaxRam: number
  defaultJvmArgs: string
  defaultJvmPreset: JvmPreset
  defaultWindowWidth: number
  defaultWindowHeight: number

  // Features
  discordRpcEnabled: boolean
  curseforgeApiKey: string
  useCurseForge: boolean
  theme: 'dark' | 'light'
  closeLauncherOnGameStart: boolean
  showSnapshotNotifications: boolean
}

// ─── Java ───────────────────────────────────────────────────

export interface JavaInstallation {
  id: string
  path: string
  version: string
  majorVersion: number
  vendor: string
  arch: string
  isManaged: boolean // downloaded by launcher
  isValid: boolean
}

// ─── Servers ────────────────────────────────────────────────

export interface FavoriteServer {
  id: string
  name: string
  ip: string
  port: number
  iconBase64: string
  addedAt: string
}

export interface ServerStatus {
  online: boolean
  motd: string
  motdHtml: string
  players: { online: number; max: number }
  version: string
  latency: number // ms
  iconBase64: string
}

// ─── Backups ────────────────────────────────────────────────

export interface Backup {
  id: string
  instanceId: string
  fileName: string
  path: string
  size: number
  createdAt: string
}

// ─── News ───────────────────────────────────────────────────

export interface NewsArticle {
  id: string
  title: string
  description: string
  imageUrl: string
  url: string
  source: 'minecraft' | 'modrinth' | 'launcher'
  publishedAt: string
}

// ─── Notifications ──────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  read: boolean
  action?: {
    label: string
    channel: string
    payload?: unknown
  }
}

// ─── Crash Reports ──────────────────────────────────────────

export interface CrashReport {
  instanceId: string
  timestamp: string
  filePath: string
  cause: string
  erroringMod: string
  javaVersion: string
  minecraftVersion: string
  modloader: string
  fullLog: string
  suggestions: string[]
}

// ─── IPC Channels ───────────────────────────────────────────

export const IPC_CHANNELS = {
  // Versions
  GET_VERSION_MANIFEST: 'versions:get-manifest',
  GET_VERSION_JSON: 'versions:get-json',
  DOWNLOAD_VERSION: 'versions:download',

  // Instances
  GET_INSTANCES: 'instances:get-all',
  CREATE_INSTANCE: 'instances:create',
  UPDATE_INSTANCE: 'instances:update',
  DELETE_INSTANCE: 'instances:delete',
  DUPLICATE_INSTANCE: 'instances:duplicate',
  OPEN_INSTANCE_FOLDER: 'instances:open-folder',
  GET_INSTANCE_MODS: 'instances:get-mods',

  // Game
  LAUNCH_INSTANCE: 'game:launch',
  STOP_INSTANCE: 'game:stop',
  GET_GAME_LOG: 'game:get-log',
  GAME_STATUS: 'game:status',

  // Accounts
  GET_ACCOUNTS: 'accounts:get-all',
  CREATE_ACCOUNT: 'accounts:create',
  UPDATE_ACCOUNT: 'accounts:update',
  DELETE_ACCOUNT: 'accounts:delete',
  SET_ACTIVE_ACCOUNT: 'accounts:set-active',
  UPLOAD_SKIN: 'accounts:upload-skin',

  // Mods
  SEARCH_MODS: 'mods:search',
  GET_MOD_VERSIONS: 'mods:get-versions',
  INSTALL_MOD: 'mods:install',
  UNINSTALL_MOD: 'mods:uninstall',
  TOGGLE_MOD: 'mods:toggle',
  CHECK_MOD_UPDATES: 'mods:check-updates',
  UPDATE_MOD: 'mods:update',
  UPDATE_ALL_MODS: 'mods:update-all',
  IS_MOD_INSTALLING: 'mods:is-installing',

  // Modpacks
  SEARCH_MODPACKS: 'modpacks:search',
  INSTALL_MODPACK: 'modpacks:install',

  // Modloaders
  GET_MODLOADER_VERSIONS: 'modloaders:get-versions',
  INSTALL_MODLOADER: 'modloaders:install',

  // Java
  GET_JAVA_INSTALLATIONS: 'java:get-installations',
  DOWNLOAD_JAVA: 'java:download',
  DETECT_JAVA: 'java:detect',

  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',

  // Backups
  CREATE_BACKUP: 'backups:create',
  GET_BACKUPS: 'backups:get-all',
  RESTORE_BACKUP: 'backups:restore',
  DELETE_BACKUP: 'backups:delete',
  EXPORT_BACKUP: 'backups:export',

  // News
  GET_NEWS: 'news:get',

  // Servers
  GET_SERVERS: 'servers:get-all',
  ADD_SERVER: 'servers:add',
  REMOVE_SERVER: 'servers:remove',
  PING_SERVER: 'servers:ping',

  // Screenshots
  GET_SCREENSHOTS: 'screenshots:get',
  DELETE_SCREENSHOT: 'screenshots:delete',
  OPEN_SCREENSHOT: 'screenshots:open',

  // Crash Reports
  GET_CRASH_REPORTS: 'crash:get-reports',
  UPLOAD_CRASH_LOG: 'crash:upload-log',

  // Notifications
  GET_NOTIFICATIONS: 'notifications:get',
  MARK_NOTIFICATION_READ: 'notifications:mark-read',
  CLEAR_NOTIFICATIONS: 'notifications:clear',

  // Resource/Shader Packs
  GET_RESOURCE_PACKS: 'resources:get',
  INSTALL_RESOURCE_PACK: 'resources:install',
  GET_SHADER_PACKS: 'shaders:get',
  INSTALL_SHADER_PACK: 'shaders:install',

  // Import/Export
  IMPORT_INSTANCE: 'import:instance',
  EXPORT_INSTANCE: 'export:instance',

  // System
  GET_SYSTEM_INFO: 'system:info',
  GET_PROCESS_STATS: 'system:process-stats',
  OPEN_EXTERNAL: 'system:open-external',
  SHOW_OPEN_DIALOG: 'system:open-dialog',
  SHOW_SAVE_DIALOG: 'system:save-dialog',

  // Events (main → renderer)
  DOWNLOAD_PROGRESS: 'event:download-progress',
  GAME_LOG: 'event:game-log',
  GAME_STATE_CHANGED: 'event:game-state-changed',
  GAME_STATS: 'event:game-stats',
  GAME_CRASHED: 'event:game-crashed',
  NOTIFICATION: 'event:notification',
  INSTANCE_UPDATED: 'event:instance-updated',
  UPDATE_AVAILABLE: 'event:update-available',
} as const
