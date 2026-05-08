// ============================================================
// Haze Launcher — Authlib Injector Manager
// Automatically downloads and manages authlib-injector
// ============================================================

import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { logger } from '../logging/Logger'
import { DownloadEngine } from '../download/DownloadEngine'

// The official API endpoint for authlib-injector releases
const AUTHLIB_INJECTOR_API = 'https://authlib-injector.yushi.moe/artifact/latest.json'

export class AuthlibInjectorManager {
  private dataDir: string
  private injectorDir: string
  private downloadEngine: DownloadEngine
  private injectorPath: string

  constructor(dataDir: string, downloadEngine: DownloadEngine) {
    this.dataDir = dataDir
    this.injectorDir = join(dataDir, 'authlib')
    this.downloadEngine = downloadEngine
    this.injectorPath = join(this.injectorDir, 'authlib-injector.jar')
    mkdirSync(this.injectorDir, { recursive: true })
  }

  /**
   * Ensure authlib-injector is downloaded and up-to-date.
   * Returns the absolute path to the jar.
   */
  async getInjectorPath(): Promise<string> {
    if (existsSync(this.injectorPath)) {
      // In a production app, we would check for updates in the background.
      // For now, if it exists, we use it to save time on launch.
      return this.injectorPath
    }

    try {
      logger.info('AuthlibInjector', 'Fetching latest authlib-injector metadata...')
      
      const https = await import('https')
      const metadata: any = await new Promise((resolve, reject) => {
        https.get(AUTHLIB_INJECTOR_API, { headers: { 'User-Agent': 'HazeLauncher/1.0.0' } }, (res) => {
          let data = ''
          res.on('data', (chunk) => data += chunk)
          res.on('end', () => resolve(JSON.parse(data)))
          res.on('error', reject)
        }).on('error', reject)
      })

      const downloadUrl = metadata.download_url
      if (!downloadUrl) throw new Error('No download URL in metadata')

      logger.info('AuthlibInjector', `Downloading authlib-injector ${metadata.version}...`)
      await this.downloadEngine.downloadSingle(downloadUrl, this.injectorPath)
      
      return this.injectorPath
    } catch (err) {
      logger.error('AuthlibInjector', `Failed to download authlib-injector: ${err}`)
      if (existsSync(this.injectorPath)) {
        return this.injectorPath // Use cached version if offline
      }
      throw err
    }
  }
}
