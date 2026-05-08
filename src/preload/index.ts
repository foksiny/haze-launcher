// ============================================================
// Haze Launcher — Preload Script
// Exposes typed IPC API to renderer via contextBridge
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'

const api = {
  // ─── System ───────────────────────────────────────────
  getSystemInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_INFO),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  showOpenDialog: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options),
  showSaveDialog: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_SAVE_DIALOG, options),
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),

  // ─── Settings ─────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  updateSettings: (updates: any) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, updates),

  // ─── Versions ─────────────────────────────────────────
  getVersionManifest: (filter?: any) => ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION_MANIFEST, filter),
  getVersionJson: (versionId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION_JSON, versionId),

  // ─── Instances ────────────────────────────────────────
  getInstances: () => ipcRenderer.invoke(IPC_CHANNELS.GET_INSTANCES),
  createInstance: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_INSTANCE, params),
  updateInstance: (instance: any) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTANCE, instance),
  deleteInstance: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_INSTANCE, id),
  duplicateInstance: (id: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.DUPLICATE_INSTANCE, id, name),
  openInstanceFolder: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_INSTANCE_FOLDER, id),
  updateInstanceMetadata: (id: string, updates: any) => ipcRenderer.invoke('instances:update-metadata', id, updates),
  exportHyperInstance: (id: string) => ipcRenderer.invoke('instances:export-haze', id),
  importHyperInstance: () => ipcRenderer.invoke('instances:import-haze'),
  openInstanceConfig: (id: string) => ipcRenderer.invoke('instances:open-config', id),

  // ─── Game ─────────────────────────────────────────────
  launchInstance: (id: string, accountId?: string) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_INSTANCE, id, accountId),
  stopInstance: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.STOP_INSTANCE, id),
  getGameStatus: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_STATUS, id),
  getGameLog: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_GAME_LOG, id),

  // ─── Accounts ─────────────────────────────────────────
  getAccounts: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ACCOUNTS),
  createAccount: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_ACCOUNT, params),
  updateAccount: (id: string, updates: any) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_ACCOUNT, id, updates),
  deleteAccount: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_ACCOUNT, id),
  setActiveAccount: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_ACTIVE_ACCOUNT, id),

  // ─── Mods ─────────────────────────────────────────────
  searchMods: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_MODS, params),
  getModVersions: (id: string, source: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_MOD_VERSIONS, id, source),
  installMod: (modVersion: any, instanceId: string, projectType?: string) => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_MOD, modVersion, instanceId, projectType),
  uninstallMod: (instanceId: string, modId: string) => ipcRenderer.invoke(IPC_CHANNELS.UNINSTALL_MOD, instanceId, modId),
  toggleMod: (instanceId: string, modId: string) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_MOD, instanceId, modId),
  getInstanceMods: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_INSTANCE_MODS, instanceId),
  checkModUpdates: (instanceId: string, mcVersion: string, loader: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_MOD_UPDATES, instanceId, mcVersion, loader),
  updateAllMods: (instanceId: string, mcVersion: string, loader: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_ALL_MODS, instanceId, mcVersion, loader),
  isModInstalling: (instanceId: string, modId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IS_MOD_INSTALLING, instanceId, modId),
  exportModList: (instanceId: string) => ipcRenderer.invoke('mods:export-list', instanceId),
  importModList: (instanceId: string, text: string, mcVersion: string, loader: string) =>
    ipcRenderer.invoke('mods:import-list', instanceId, text, mcVersion, loader),

  // ─── Modloaders ───────────────────────────────────────
  getModloaderVersions: (loader: string, mcVersion: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MODLOADER_VERSIONS, loader, mcVersion),
  installModloader: (loader: string, version: string, mcVersion: string, instanceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSTALL_MODLOADER, loader, version, mcVersion, instanceId),

  // ─── Java ─────────────────────────────────────────────
  getJavaInstallations: () => ipcRenderer.invoke(IPC_CHANNELS.GET_JAVA_INSTALLATIONS),
  detectJava: () => ipcRenderer.invoke(IPC_CHANNELS.DETECT_JAVA),
  downloadJava: (majorVersion: number) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_JAVA, majorVersion),

  // ─── Updater ─────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download-update'),
  skipUpdate: (version: string) => ipcRenderer.invoke('updater:skip-version', version),

  // ─── Notifications ────────────────────────────────────
  getNotifications: () => ipcRenderer.invoke(IPC_CHANNELS.GET_NOTIFICATIONS),

  // ─── Events (from main process) ───────────────────────
  onDownloadProgress: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener) }
  },
  onGameLog: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.GAME_LOG, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.GAME_LOG, listener) }
  },
  onGameStateChanged: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.GAME_STATE_CHANGED, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.GAME_STATE_CHANGED, listener) }
  },
  onGameStats: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.GAME_STATS, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.GAME_STATS, listener) }
  },
  onGameCrashed: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.GAME_CRASHED, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.GAME_CRASHED, listener) }
  },
  onNotification: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION, listener) }
  },
  onSettingsUpdated: (callback: (settings: any) => void) => {
    const listener = (_e: any, settings: any) => callback(settings)
    ipcRenderer.on('settings-updated', listener)
    return () => { ipcRenderer.removeListener('settings-updated', listener) }
  },
  onUpdateAvailable: (callback: (info: any) => void) => {
    const listener = (_e: any, info: any) => callback(info)
    ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_AVAILABLE, listener) }
  },
  onAccountChanged: (callback: (account: any) => void) => {
    const listener = (_e: any, account: any) => callback(account)
    ipcRenderer.on(IPC_CHANNELS.ACCOUNT_CHANGED, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.ACCOUNT_CHANGED, listener) }
  },
  onJavaDownloadProgress: (callback: (progress: any) => void) => {
    const listener = (_e: any, progress: any) => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.JAVA_DOWNLOAD_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.JAVA_DOWNLOAD_PROGRESS, listener) }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type HazeAPI = typeof api
