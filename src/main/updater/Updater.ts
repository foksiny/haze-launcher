// ============================================================
// Haze Launcher — Auto Updater
// Checks for updates from GitHub and prompts user to install
// ============================================================

import { ipcMain, BrowserWindow } from 'electron'
import https from 'https'
import { logger } from '../logging/Logger'
import { APP_NAME, APP_VERSION } from '../../shared/constants'
import { IPC_CHANNELS } from '../../shared/types'

const GITHUB_REPO = 'foksiny/haze-launcher'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
}

export class Updater {
  private mainWindow: BrowserWindow | null = null
  private checkInterval: NodeJS.Timeout | null = null

  constructor() {
    this.setupIpcHandlers()
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('updater:check', async () => {
      return this.checkForUpdate()
    })

    ipcMain.handle('updater:download-update', async () => {
      return this.downloadAndInstall()
    })

    ipcMain.handle('updater:skip-version', async (_e, version: string) => {
      this.skipVersion(version)
    })
  }

  async checkForUpdate(): Promise<UpdateInfo | null> {
    try {
      logger.info('Updater', 'Checking for updates...')
      
      const data = await this.fetchJson(GITHUB_API_URL)
      
      // Handle case where repo doesn't exist
      if (data.message === 'Not Found') {
        logger.info('Updater', 'GitHub repository not found, skipping update check')
        return null
      }
      
      const latestVersion = data.tag_name?.replace(/^v/, '') || '0.0.0'
      const currentVersion = APP_VERSION

      logger.info('Updater', `Current: ${currentVersion}, Latest: ${latestVersion}`)

      // Check if update is available (compare semver)
      if (this.isNewerVersion(latestVersion, currentVersion)) {
        const releaseNotes = this.extractReleaseNotes(data.body || '')
        
        const updateInfo: UpdateInfo = {
          currentVersion,
          latestVersion,
          releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
          releaseNotes,
          publishedAt: data.published_at,
        }

        logger.info('Updater', `Update available: ${latestVersion}`)
        return updateInfo
      }

      logger.info('Updater', 'No update available')
      return null
    } catch (err: any) {
      // Don't log error if no releases exist (404 is expected in that case)
      if (!err?.message?.includes('404')) {
        logger.error('Updater', `Failed to check for updates: ${err?.message || err}`, err)
      } else {
        logger.info('Updater', 'No releases available yet')
      }
      return null
    }
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number)
    const currentParts = current.split('.').map(Number)

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const l = latestParts[i] || 0
      const c = currentParts[i] || 0
      if (l > c) return true
      if (l < c) return false
    }
    return false
  }

  private extractReleaseNotes(body: string): string {
    // Extract first 500 chars of release notes
    const notes = body.replace(/## /g, '\n## ').trim()
    return notes.length > 500 ? notes.substring(0, 500) + '...' : notes
  }

  async downloadAndInstall(): Promise<boolean> {
    try {
      logger.info('Updater', 'Starting update download...')
      
      const data = await this.fetchJson(GITHUB_API_URL)
      
      // Find Windows installer
      const windowsAsset = data.assets?.find((a: any) => 
        a.name?.endsWith('.exe') || a.name?.includes('windows')
      )

      if (windowsAsset) {
        logger.info('Updater', `Downloading: ${windowsAsset.name}`)
        // In production, we'd use electron-updater to actually download and install
        // For now, we'll just open the release page
        const { shell } = await import('electron')
        shell.openExternal(windowsAsset.browser_download_url)
        return true
      }

      // Fallback: open release page
      logger.info('Updater', 'No Windows installer found, opening release page')
      const { shell } = await import('electron')
      shell.openExternal(data.html_url)
      return true
    } catch (err) {
      logger.error('Updater', 'Failed to download update', err)
      return false
    }
  }

  private skipVersion(version: string): void {
    logger.info('Updater', `Skipping version: ${version}`)
    // Could store skipped version in settings to not prompt again
  }

  startAutoCheck(intervalMs: number = 3600000): void {
    // Check every hour by default
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }

    // Initial check
    this.checkForUpdate().then(updateInfo => {
      if (updateInfo && this.mainWindow) {
        this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, updateInfo)
      }
    })

    // Periodic check
    this.checkInterval = setInterval(async () => {
      const updateInfo = await this.checkForUpdate()
      if (updateInfo && this.mainWindow) {
        this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, updateInfo)
      }
    }, intervalMs)
  }

  stopAutoCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: { 
          'User-Agent': `${APP_NAME}/${APP_VERSION}`,
          'Accept': 'application/json'
        },
        timeout: 15000,
      }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let data = ''
          res.on('data', (chunk: string) => (data += chunk))
          res.on('end', () => {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`))
          })
          return
        }
        let data = ''
        res.on('data', (chunk: string) => (data += chunk))
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
        })
        res.on('error', reject)
      }).on('error', reject)
    })
  }
}

export const updater = new Updater()