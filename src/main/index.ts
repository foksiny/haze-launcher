// ============================================================
// Haze Launcher — Main Process Entry Point
// Orchestrates all backend services and IPC
// ============================================================

import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, clipboard } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { logger } from './logging/Logger'
import { DownloadEngine } from './download/DownloadEngine'
import { VersionManager, VersionFilter } from './versions/VersionManager'
import { AssetManager } from './versions/AssetManager'
import { LibraryManager } from './versions/LibraryManager'
import { GameLauncher } from './game/GameLauncher'
import { InstanceManager } from './instances/InstanceManager'
import { SettingsManager } from './settings/SettingsManager'
import { AccountManager } from './accounts/AccountManager'
import { JavaManager } from './java/JavaManager'
import { ModloaderManager } from './modloaders/ModloaderManager'
import { ModManager } from './mods/ModManager'
import { DiscordManager } from './discord/DiscordManager'
import { AuthlibInjectorManager } from './accounts/AuthlibInjectorManager'
import { updater } from './updater/Updater'
import { ProcessMonitor } from './game/ProcessMonitor'
import { APP_NAME } from '../shared/constants'
import { IPC_CHANNELS } from '../shared/types'
import type { Instance } from '../shared/types'
import { getRequiredJavaVersion } from '../shared/utils'

// ─── Data Directory ─────────────────────────────────────────

function getDefaultDataDir(): string {
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming'), 'Haze')
    case 'darwin':
      return join(os.homedir(), 'Library', 'Application Support', 'Haze')
    default:
      return join(os.homedir(), '.config', 'haze')
  }
}

const DATA_DIR = getDefaultDataDir()
mkdirSync(DATA_DIR, { recursive: true })

// ─── Initialize Services ────────────────────────────────────

logger.initialize(DATA_DIR)
logger.info('Main', `${APP_NAME} starting...`)
logger.info('Main', `Data directory: ${DATA_DIR}`)
logger.info('Main', `Platform: ${process.platform} ${process.arch}`)
logger.info('Main', `Electron: ${process.versions.electron}`)

const downloadEngine = new DownloadEngine()
const settingsManager = new SettingsManager(DATA_DIR)
const versionManager = new VersionManager(DATA_DIR, downloadEngine)
const assetManager = new AssetManager(DATA_DIR, downloadEngine)
const libraryManager = new LibraryManager(DATA_DIR, downloadEngine)
const javaManager = new JavaManager(DATA_DIR, downloadEngine)
javaManager.on('downloadProgress', (progress: any) => {
  mainWindow?.webContents.send(IPC_CHANNELS.JAVA_DOWNLOAD_PROGRESS, progress)
})

const gameLauncher = new GameLauncher(DATA_DIR, versionManager, assetManager, libraryManager, javaManager, downloadEngine)
const instanceManager = new InstanceManager(DATA_DIR)
const accountManager = new AccountManager(DATA_DIR)
const modloaderManager = new ModloaderManager(DATA_DIR, downloadEngine)
const modManager = new ModManager(DATA_DIR, downloadEngine, settingsManager.get('curseforgeApiKey'))
const discordManager = new DiscordManager()
const authlibManager = new AuthlibInjectorManager(DATA_DIR, downloadEngine)

let mainWindow: BrowserWindow | null = null

const processMonitor = new ProcessMonitor(
  () => gameLauncher.getRunningPids(),
  (stats) => {
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.GAME_STATS, stats)
    }
  }
)
processMonitor.start(2000)

// ─── Window Creation ────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0d1a',
      symbolColor: '#a0a0c0',
      height: 40,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a1a',
    icon: join(__dirname, '../../resources/icon.png'),
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── App Lifecycle ──────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.haze.launcher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Initialize updater with main window reference
  updater.setMainWindow(mainWindow!)
  if (settingsManager.get('checkUpdatesOnStartup')) {
    updater.startAutoCheck(3600000) // Check every hour
  }

  // Connect Discord RPC
  if (settingsManager.get('discordRpcEnabled')) {
    discordManager.connect()
  }

  // Auto-detect Java on startup
  javaManager.detectSystemJava().catch((err) => {
    logger.warn('Main', 'Failed to auto-detect Java', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.info('Main', 'All windows closed, quitting...')
  logger.close()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ───────────────────────────────────────────

// --- System ---
ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_INFO, () => ({
  platform: process.platform,
  arch: process.arch,
  totalRam: Math.floor(os.totalmem() / (1024 * 1024)),
  freeRam: Math.floor(os.freemem() / (1024 * 1024)),
  cpus: os.cpus().length,
  dataDir: DATA_DIR,
}))

ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_e, url: string) => {
  await shell.openExternal(url)
})

ipcMain.handle('clipboard:write-text', (_e, text: string) => {
  clipboard.writeText(text)
})

ipcMain.handle(IPC_CHANNELS.SHOW_OPEN_DIALOG, async (_e, options: Electron.OpenDialogOptions) => {
  if (!mainWindow) return { canceled: true, filePaths: [] }
  return dialog.showOpenDialog(mainWindow, options)
})

ipcMain.handle(IPC_CHANNELS.SHOW_SAVE_DIALOG, async (_e, options: Electron.SaveDialogOptions) => {
  if (!mainWindow) return { canceled: true, filePath: '' }
  return dialog.showSaveDialog(mainWindow, options)
})

// --- Settings ---
ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => settingsManager.getSettings())

ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (_e, updates) => {
  const settings = settingsManager.updateSettings(updates)
  if (updates.curseforgeApiKey !== undefined) {
    modManager.setCurseForgeApiKey(updates.curseforgeApiKey)
  }
  if (updates.discordRpcEnabled !== undefined) {
    discordManager.setEnabled(updates.discordRpcEnabled)
  }
  if (updates.useCurseForge !== undefined) {
    modManager.setUseCurseForge(updates.useCurseForge)
  }
  mainWindow?.webContents.send('settings-updated', settings)
  return settings
})

// --- Versions ---
ipcMain.handle(IPC_CHANNELS.GET_VERSION_MANIFEST, async (_e, filter?: VersionFilter) => {
  if (filter) {
    return versionManager.getFilteredVersions(filter)
  }
  const manifest = await versionManager.getManifest()
  return manifest.versions
})

ipcMain.handle(IPC_CHANNELS.GET_VERSION_JSON, async (_e, versionId: string) => {
  return versionManager.getVersionJson(versionId)
})

// --- Instances ---
ipcMain.handle(IPC_CHANNELS.GET_INSTANCES, () => instanceManager.getAllInstances())

ipcMain.handle(IPC_CHANNELS.CREATE_INSTANCE, async (_e, params) => {
  const instance = instanceManager.createInstance(params, settingsManager.getSettings())

  // Install modloader if specified
  if (params.modloader && params.modloader !== 'vanilla' && params.modloaderVersion) {
    try {
      const requiredVersion = getRequiredJavaVersion(params.minecraftVersion)
      let javaPath = 'java'
      const javaInstall = await javaManager.getJavaForMinecraft(params.minecraftVersion)
      if (javaInstall) {
        javaPath = javaInstall.path
      } else {
        const downloaded = await javaManager.downloadJava(requiredVersion)
        javaPath = downloaded.path
      }

      await modloaderManager.installModloader(
        params.modloader,
        params.modloaderVersion,
        params.minecraftVersion,
        instanceManager.getInstanceDir(instance.id),
        javaPath
      )
    } catch (err) {
      logger.error('Main', `Failed to install modloader: ${err}`)
    }
  }

  return instance
})

ipcMain.handle(IPC_CHANNELS.UPDATE_INSTANCE, (_e, instance: Instance) => {
  instanceManager.updateInstance(instance)
  return instance
})

ipcMain.handle(IPC_CHANNELS.DELETE_INSTANCE, (_e, id: string) => {
  instanceManager.deleteInstance(id)
})

ipcMain.handle(IPC_CHANNELS.DUPLICATE_INSTANCE, (_e, id: string, newName: string) => {
  return instanceManager.duplicateInstance(id, newName)
})

ipcMain.handle(IPC_CHANNELS.OPEN_INSTANCE_FOLDER, async (_e, id: string) => {
  await instanceManager.openInstanceFolder(id)
})

ipcMain.handle('instances:update-metadata', (_e, id: string, updates: Partial<Instance>) => {
  return instanceManager.updateInstanceMetadata(id, updates)
})

ipcMain.handle('instances:export-haze', async (event, id: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePath } = await dialog.showSaveDialog(win!, {
    title: 'Export HyperInstance',
    defaultPath: `instance-${id}.haze`,
    filters: [{ name: 'Haze HyperInstance', extensions: ['haze'] }]
  })
  if (filePath) {
    await instanceManager.exportHyperInstance(id, filePath)
    return true
  }
  return false
})

ipcMain.handle('instances:import-haze', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePaths } = await dialog.showOpenDialog(win!, {
    title: 'Import HyperInstance',
    filters: [{ name: 'Haze HyperInstance', extensions: ['haze'] }],
    properties: ['openFile']
  })
  if (filePaths.length > 0) {
    return await instanceManager.importHyperInstance(filePaths[0])
  }
  return null
})

ipcMain.handle('instances:open-config', async (_e, id: string) => {
  const configDir = join(instanceManager.getInstanceDir(id), '.minecraft', 'config')
  if (existsSync(configDir)) {
    await shell.openPath(configDir)
  } else {
    await shell.openPath(instanceManager.getInstanceDir(id))
  }
})

// --- Game ---
ipcMain.handle(IPC_CHANNELS.LAUNCH_INSTANCE, async (_e, instanceId: string, accountId?: string) => {
  const instance = instanceManager.getInstance(instanceId)
  if (!instance) throw new Error(`Instance ${instanceId} not found`)

  const account = accountId
    ? accountManager.getAccount(accountId)
    : accountManager.getActiveAccount()
  if (!account) throw new Error('No account selected')

  // Find Java
  let javaPath = instance.settings.javaPath
  if (!javaPath) {
    const javaInstall = await javaManager.getJavaForMinecraft(instance.minecraftVersion)
    if (javaInstall) {
      javaPath = javaInstall.path
    } else {
      // Auto-download Java
      const requiredVersion = getRequiredJavaVersion(instance.minecraftVersion)
      logger.info('Main', `Auto-downloading Java ${requiredVersion}...`)
      const downloaded = await javaManager.downloadJava(requiredVersion)
      javaPath = downloaded.path
    }
  }
  
  // Handle Authlib Injector for Ely.by
  let authlibPath = undefined
  if (account.type === 'elyby') {
    authlibPath = await authlibManager.getInjectorPath()
  }

  // Forward game events to renderer
  const onStateChange = (state: any) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GAME_STATE_CHANGED, state)
    
    // Update Discord RPC
    if (state.status === 'downloading') {
      discordManager.updatePresence('Downloading assets...', `Minecraft ${instance.minecraftVersion}`)
    } else if (state.status === 'launching') {
      discordManager.updatePresence('Launching game...', `Minecraft ${instance.minecraftVersion}`)
    } else if (state.status === 'running') {
      discordManager.updatePresence(
        instance.modloader === 'vanilla' ? 'In-Game' : `In-Game (${instance.modloader})`,
        `Minecraft ${instance.minecraftVersion}`,
        true
      )
    }
  }
  const onLog = (logEntry: any) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GAME_LOG, logEntry)
  }
  const onDownloadProgress = (progress: any) => {
    mainWindow?.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, progress)
  }
  const onGameExited = (data: any) => {
    instanceManager.recordPlayTime(instanceId, data.playTime)
    gameLauncher.removeListener('state-changed', onStateChange)
    gameLauncher.removeListener('game-log', onLog)
    gameLauncher.removeListener('download-progress', onDownloadProgress)

    discordManager.updatePresence('Idle', 'In Launcher')

    if (data.crashed) {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow()
        mainWindow?.webContents.once('did-finish-load', () => {
          mainWindow?.webContents.send(IPC_CHANNELS.GAME_CRASHED, {
            instanceId: data.instanceId,
            log: data.log
          })
        })
      } else {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send(IPC_CHANNELS.GAME_CRASHED, {
          instanceId: data.instanceId,
          log: data.log
        })
      }
    }
  }

  gameLauncher.on('state-changed', onStateChange)
  gameLauncher.on('game-log', onLog)
  gameLauncher.on('download-progress', onDownloadProgress)
  gameLauncher.once('game-exited', onGameExited)

  // Handle launcher behavior on game start
  const behavior = settingsManager.get('launcherBehavior')
  if (instance.settings.closeOnLaunch || behavior === 'close') {
    gameLauncher.once('state-changed', (state) => {
      if (state.status === 'running') {
        mainWindow?.hide()
      }
    })
  } else if (behavior === 'minimize') {
    gameLauncher.once('state-changed', (state) => {
      if (state.status === 'running') {
        mainWindow?.minimize()
      }
    })
  }

  return gameLauncher.launch(instance, account, javaPath, authlibPath)
})

ipcMain.handle(IPC_CHANNELS.STOP_INSTANCE, (_e, instanceId: string) => {
  gameLauncher.stopInstance(instanceId)
})

ipcMain.handle(IPC_CHANNELS.GAME_STATUS, (_e, instanceId: string) => {
  return gameLauncher.getGameState(instanceId)
})

ipcMain.handle(IPC_CHANNELS.GET_GAME_LOG, (_e, instanceId: string) => {
  return gameLauncher.getGameLog(instanceId)
})

// --- Accounts ---
ipcMain.handle(IPC_CHANNELS.GET_ACCOUNTS, () => ({
  accounts: accountManager.getAllAccounts(),
  activeAccount: accountManager.getActiveAccount(),
}))

ipcMain.handle(IPC_CHANNELS.CREATE_ACCOUNT, async (_e, params: { type: string; username: string; password?: string }) => {
  if (params.type === 'elyby' && params.password) {
    return accountManager.createElyByAccount(params.username, params.password)
  }
  return accountManager.createOfflineAccount(params.username)
})

ipcMain.handle(IPC_CHANNELS.UPDATE_ACCOUNT, (_e, id: string, updates: any) => {
  return accountManager.updateAccount(id, updates)
})

ipcMain.handle(IPC_CHANNELS.DELETE_ACCOUNT, (_e, id: string) => {
  accountManager.deleteAccount(id)
})

ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_ACCOUNT, (_e, id: string) => {
  accountManager.setActiveAccount(id)
  const active = accountManager.getActiveAccount()
  mainWindow?.webContents.send(IPC_CHANNELS.ACCOUNT_CHANGED, active)
})

// --- Mods ---
ipcMain.handle(IPC_CHANNELS.SEARCH_MODS, async (_e, params) => {
  return modManager.searchMods(params)
})

ipcMain.handle(IPC_CHANNELS.GET_MOD_VERSIONS, async (_e, projectId: string, source: string) => {
  return modManager.getModVersions(projectId, source as any)
})

ipcMain.handle(IPC_CHANNELS.INSTALL_MOD, async (_e, modVersion, instanceId: string, projectType?: string) => {
  return modManager.installMod(modVersion, instanceId, true, projectType as 'mod' | 'resourcepack')
})

ipcMain.handle(IPC_CHANNELS.UNINSTALL_MOD, (_e, instanceId: string, modId: string) => {
  modManager.uninstallMod(instanceId, modId)
})

ipcMain.handle(IPC_CHANNELS.TOGGLE_MOD, (_e, instanceId: string, modId: string) => {
  return modManager.toggleMod(instanceId, modId)
})

ipcMain.handle(IPC_CHANNELS.GET_INSTANCE_MODS, (_e, instanceId: string) => {
  return modManager.getInstalledMods(instanceId)
})

ipcMain.handle(IPC_CHANNELS.CHECK_MOD_UPDATES, async (_e, instanceId: string, mcVersion: string, loader: string) => {
  const updates = await modManager.checkForUpdates(instanceId, mcVersion, loader)
  return Object.fromEntries(updates)
})

ipcMain.handle(IPC_CHANNELS.UPDATE_ALL_MODS, async (_e, instanceId: string, mcVersion: string, loader: string) => {
  return modManager.updateAllMods(instanceId, mcVersion, loader)
})

ipcMain.handle('mods:is-installing', (_e, instanceId: string, modId: string) => {
  return modManager.isInstalling(instanceId, modId)
})

ipcMain.handle('mods:export-list', (_e, instanceId: string) => {
  return modManager.exportModList(instanceId)
})

ipcMain.handle('mods:import-list', (_e, instanceId: string, text: string, mcVersion: string, loader: string) => {
  return modManager.importModList(instanceId, text, mcVersion, loader)
})

// --- Modloaders ---
ipcMain.handle(IPC_CHANNELS.GET_MODLOADER_VERSIONS, async (_e, loader: string, mcVersion: string) => {
  return modloaderManager.getModloaderVersions(loader as any, mcVersion)
})

ipcMain.handle(IPC_CHANNELS.INSTALL_MODLOADER, async (_e, loader: string, version: string, mcVersion: string, instanceId: string) => {
  const instanceDir = instanceManager.getInstanceDir(instanceId)
  
  const requiredVersion = getRequiredJavaVersion(mcVersion)
  let javaPath = 'java'
  const javaInstall = await javaManager.getJavaForMinecraft(mcVersion)
  if (javaInstall) {
    javaPath = javaInstall.path
  } else {
    const downloaded = await javaManager.downloadJava(requiredVersion)
    javaPath = downloaded.path
  }

  await modloaderManager.installModloader(loader as any, version, mcVersion, instanceDir, javaPath)
})

// --- Java ---
ipcMain.handle(IPC_CHANNELS.GET_JAVA_INSTALLATIONS, () => {
  return javaManager.getInstallations()
})

ipcMain.handle(IPC_CHANNELS.DETECT_JAVA, async () => {
  return javaManager.detectSystemJava()
})

ipcMain.handle(IPC_CHANNELS.DOWNLOAD_JAVA, async (_e, majorVersion: number) => {
  return javaManager.downloadJava(majorVersion)
})

// --- Notifications ---
ipcMain.handle(IPC_CHANNELS.GET_NOTIFICATIONS, () => {
  // TODO: Implement notification storage
  return []
})

logger.info('Main', 'All IPC handlers registered')
