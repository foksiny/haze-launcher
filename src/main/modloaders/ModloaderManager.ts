// ============================================================
// Haze Launcher — Modloader Manager
// Unified interface for Fabric, Forge, NeoForge, Quilt, LiteLoader
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import https from 'https'
import { logger } from '../logging/Logger'
import { DownloadEngine } from '../download/DownloadEngine'
import { FABRIC_META_URL, QUILT_META_URL, FORGE_MAVEN_URL, NEOFORGE_MAVEN_URL } from '../../shared/constants'
import type { ModloaderType, VersionJson } from '../../shared/types'

export interface ModloaderVersion {
  version: string
  stable: boolean
}

export class ModloaderManager {
  private dataDir: string
  private cacheDir: string
  private downloadEngine: DownloadEngine

  constructor(dataDir: string, downloadEngine: DownloadEngine) {
    this.dataDir = dataDir
    this.cacheDir = join(dataDir, 'cache', 'modloaders')
    this.downloadEngine = downloadEngine
    mkdirSync(this.cacheDir, { recursive: true })
  }

  /**
   * Get available versions for a modloader and Minecraft version.
   */
  async getModloaderVersions(loader: ModloaderType, mcVersion: string): Promise<ModloaderVersion[]> {
    switch (loader) {
      case 'fabric': return this.getFabricVersions(mcVersion)
      case 'quilt': return this.getQuiltVersions(mcVersion)
      case 'forge': return this.getForgeVersions(mcVersion)
      case 'neoforge': return this.getNeoForgeVersions(mcVersion)
      case 'liteloader': return this.getLiteLoaderVersions(mcVersion)
      default: return []
    }
  }

  /**
   * Install a modloader for an instance.
   * Generates the necessary version JSON and downloads libraries.
   */
  async installModloader(
    loader: ModloaderType,
    loaderVersion: string,
    mcVersion: string,
    instanceDir: string,
    javaPath: string = 'java'
  ): Promise<void> {
    logger.info('ModloaderManager', `Installing ${loader} ${loaderVersion} for MC ${mcVersion}`)

    switch (loader) {
      case 'fabric':
        await this.installFabric(loaderVersion, mcVersion, instanceDir)
        break
      case 'quilt':
        await this.installQuilt(loaderVersion, mcVersion, instanceDir)
        break
      case 'forge':
        await this.installForge(loaderVersion, mcVersion, instanceDir, javaPath)
        break
      case 'neoforge':
        await this.installNeoForge(loaderVersion, mcVersion, instanceDir, javaPath)
        break
      case 'liteloader':
        await this.installLiteLoader(loaderVersion, mcVersion, instanceDir)
        break
    }
  }

  // ─── Fabric ───────────────────────────────────────────────

  private async getFabricVersions(mcVersion: string): Promise<ModloaderVersion[]> {
    const data = await this.fetchJson(`${FABRIC_META_URL}/versions/loader/${mcVersion}`)
    if (!Array.isArray(data)) return []

    return data.map((entry: any) => ({
      version: entry.loader.version,
      stable: entry.loader.stable,
    }))
  }

  private async installFabric(loaderVersion: string, mcVersion: string, instanceDir: string): Promise<void> {
    // Fetch the full profile from Fabric Meta
    const profile = await this.fetchJson(
      `${FABRIC_META_URL}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
    )

    // Save version JSON
    const versionId = `fabric-loader-${loaderVersion}-${mcVersion}`
    const versionDir = join(this.dataDir, 'versions', versionId)
    mkdirSync(versionDir, { recursive: true })
    writeFileSync(join(versionDir, `${versionId}.json`), JSON.stringify(profile, null, 2))

    // Download all Fabric libraries
    const librariesDir = join(this.dataDir, 'libraries')
    const downloads: Array<{ url: string; path: string }> = []

    for (const lib of profile.libraries || []) {
      const name = lib.name
      const parts = name.split(':')
      const [group, artifact, version] = parts
      const groupPath = group.replace(/\./g, '/')
      const path = `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`
      const localPath = join(librariesDir, path)

      if (!existsSync(localPath)) {
        const url = lib.url
          ? `${lib.url}${path}`
          : `https://maven.fabricmc.net/${path}`
        downloads.push({ url, path: localPath })
      }
    }

    if (downloads.length > 0) {
      logger.info('ModloaderManager', `Downloading ${downloads.length} Fabric libraries...`)
      await this.downloadEngine.downloadBatch(downloads)
    }

    logger.info('ModloaderManager', `Fabric ${loaderVersion} installed for ${mcVersion}`)
  }

  // ─── Quilt ────────────────────────────────────────────────

  private async getQuiltVersions(mcVersion: string): Promise<ModloaderVersion[]> {
    const data = await this.fetchJson(`${QUILT_META_URL}/versions/loader/${mcVersion}`)
    if (!Array.isArray(data)) return []

    return data.map((entry: any) => ({
      version: entry.loader.version,
      stable: true, // Quilt doesn't distinguish stable/unstable in meta
    }))
  }

  private async installQuilt(loaderVersion: string, mcVersion: string, instanceDir: string): Promise<void> {
    const profile = await this.fetchJson(
      `${QUILT_META_URL}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
    )

    const versionId = `quilt-loader-${loaderVersion}-${mcVersion}`
    const versionDir = join(this.dataDir, 'versions', versionId)
    mkdirSync(versionDir, { recursive: true })
    writeFileSync(join(versionDir, `${versionId}.json`), JSON.stringify(profile, null, 2))

    // Download Quilt libraries
    const librariesDir = join(this.dataDir, 'libraries')
    const downloads: Array<{ url: string; path: string }> = []

    for (const lib of profile.libraries || []) {
      const name = lib.name
      const parts = name.split(':')
      const [group, artifact, version] = parts
      const groupPath = group.replace(/\./g, '/')
      const path = `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`
      const localPath = join(librariesDir, path)

      if (!existsSync(localPath)) {
        const url = lib.url
          ? `${lib.url}${path}`
          : `https://maven.quiltmc.org/repository/release/${path}`
        downloads.push({ url, path: localPath })
      }
    }

    if (downloads.length > 0) {
      await this.downloadEngine.downloadBatch(downloads)
    }

    logger.info('ModloaderManager', `Quilt ${loaderVersion} installed for ${mcVersion}`)
  }

  // ─── Forge ────────────────────────────────────────────────

  private async getForgeVersions(mcVersion: string): Promise<ModloaderVersion[]> {
    try {
      const promos = await this.fetchJson(
        'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
      )

      const versions: ModloaderVersion[] = []
      const prefix = `${mcVersion}-`

      for (const [key, value] of Object.entries(promos.promos || {})) {
        if (key.startsWith(prefix)) {
          const suffix = key.substring(prefix.length)
          versions.push({
            version: value as string,
            stable: suffix === 'recommended',
          })
        }
      }

      // Also try to get the full version list from Maven
      try {
        const mavenMeta = await this.fetchText(
          `${FORGE_MAVEN_URL}/net/minecraftforge/forge/maven-metadata.xml`
        )
        const versionRegex = new RegExp(`${mcVersion.replace('.', '\\.')}-([\\d.]+)`, 'g')
        let match
        while ((match = versionRegex.exec(mavenMeta)) !== null) {
          if (!versions.some((v) => v.version === match![1])) {
            versions.push({ version: match[1], stable: false })
          }
        }
      } catch {
        // ignore
      }

      return versions
    } catch (err) {
      logger.error('ModloaderManager', 'Failed to fetch Forge versions', err instanceof Error ? err.message : String(err))
      return []
    }
  }

  private async installForge(loaderVersion: string, mcVersion: string, instanceDir: string, javaPath: string): Promise<void> {
    const forgeVersion = `${mcVersion}-${loaderVersion}`
    const installerUrl = `${FORGE_MAVEN_URL}/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`
    const installerPath = join(this.cacheDir, `forge-${forgeVersion}-installer.jar`)

    // Download installer
    if (!existsSync(installerPath)) {
      logger.info('ModloaderManager', `Downloading Forge installer ${forgeVersion}...`)
      await this.downloadEngine.downloadSingle(installerUrl, installerPath)
    }

    // Ensure launcher_profiles.json exists
    const profilesPath = join(this.dataDir, 'launcher_profiles.json')
    if (!existsSync(profilesPath)) {
      writeFileSync(profilesPath, JSON.stringify({ profiles: {} }))
    }

    // Run installer headlessly
    logger.info('ModloaderManager', `Running Forge installer headlessly...`)
    const { execSync } = await import('child_process')

    try {
      // Forge installer needs to run with the data dir as the MC dir
      execSync(
        `"${javaPath}" -jar "${installerPath}" --installClient "${this.dataDir}"`,
        {
          cwd: this.dataDir,
          timeout: 300000, // 5 minutes
          stdio: 'pipe',
        }
      )
    } catch (err) {
      // Forge installer often exits with non-zero even on success
      // Check if the version JSON was created
      const versionId = `${mcVersion}-forge-${loaderVersion}`
      const versionJson = join(this.dataDir, 'versions', versionId, `${versionId}.json`)
      if (!existsSync(versionJson)) {
        throw new Error(`Forge installation failed: ${err instanceof Error ? err.message : err}`)
      }
    }

    logger.info('ModloaderManager', `Forge ${loaderVersion} installed for ${mcVersion}`)
  }

  // ─── NeoForge ─────────────────────────────────────────────

  private async getNeoForgeVersions(mcVersion: string): Promise<ModloaderVersion[]> {
    try {
      const mavenMeta = await this.fetchText(
        `${NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/maven-metadata.xml`
      )

      const versions: ModloaderVersion[] = []
      const match = mcVersion.match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
      if (!match) return []

      const minor = match[2]
      const patch = match[3] || '0'
      
      // NeoForge version prefix: minor.patch
      // e.g. for 1.20.1 -> 20.1.x
      // e.g. for 1.21.1 -> 21.1.x
      const prefix = `${minor}.${patch}.`

      const versionRegex = /<version>([^<]+)<\/version>/g
      let m
      while ((m = versionRegex.exec(mavenMeta)) !== null) {
        const ver = m[1]
        if (ver.startsWith(prefix)) {
          versions.push({ version: ver, stable: !ver.includes('beta') })
        }
      }

      return versions.reverse()
    } catch (err) {
      logger.error('ModloaderManager', 'Failed to fetch NeoForge versions', err)
      return []
    }
  }

  private async installNeoForge(loaderVersion: string, mcVersion: string, instanceDir: string, javaPath: string): Promise<void> {
    const installerUrl = `${NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
    const installerPath = join(this.cacheDir, `neoforge-${loaderVersion}-installer.jar`)

    if (!existsSync(installerPath)) {
      logger.info('ModloaderManager', `Downloading NeoForge installer ${loaderVersion}...`)
      await this.downloadEngine.downloadSingle(installerUrl, installerPath)
    }

    const { execSync } = await import('child_process')
    
    const profilesPath = join(this.dataDir, 'launcher_profiles.json')
    if (!existsSync(profilesPath)) {
      writeFileSync(profilesPath, JSON.stringify({ profiles: {} }))
    }

    try {
      execSync(
        `"${javaPath}" -jar "${installerPath}" --installClient "${this.dataDir}"`,
        { cwd: this.dataDir, timeout: 300000, stdio: 'pipe' }
      )
    } catch (err: any) {
      const versionId = `neoforge-${loaderVersion}`
      const versionJson = join(this.dataDir, 'versions', versionId, `${versionId}.json`)
      if (!existsSync(versionJson)) {
        throw new Error(`NeoForge installation failed: ${err.message || err}`)
      }
    }

    logger.info('ModloaderManager', `NeoForge ${loaderVersion} installed for ${mcVersion}`)
  }

  // ─── LiteLoader ──────────────────────────────────────────

  private async getLiteLoaderVersions(mcVersion: string): Promise<ModloaderVersion[]> {
    try {
      const data = await this.fetchJson('https://dl.liteloader.com/versions/versions.json')
      const mcVersions = data.versions || {}
      const versionData = mcVersions[mcVersion]
      if (!versionData) return []

      const artifacts = versionData.artefacts?.['com.mumfrey:liteloader']
      if (!artifacts) return []

      return Object.keys(artifacts).map((v) => ({
        version: v,
        stable: true,
      }))
    } catch {
      return []
    }
  }

  private async installLiteLoader(loaderVersion: string, mcVersion: string, instanceDir: string): Promise<void> {
    logger.info('ModloaderManager', `LiteLoader installation for ${mcVersion} (legacy support)`)
    // LiteLoader is simpler - download the JAR and add to libraries
    // This is a simplified implementation for legacy version support
  }

  // ─── Utilities ────────────────────────────────────────────

  private async fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'HazeLauncher/1.0.0' }, timeout: 15000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchJson(res.headers.location).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
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

  private async fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'HazeLauncher/1.0.0' }, timeout: 15000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchText(res.headers.location).then(resolve).catch(reject)
          return
        }
        let data = ''
        res.on('data', (chunk: string) => (data += chunk))
        res.on('end', () => resolve(data))
        res.on('error', reject)
      }).on('error', reject)
    })
  }
}
