// ============================================================
// Haze Launcher — Version Manager
// Fetches, caches, and manages Minecraft version metadata
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logging/Logger'
import { DownloadEngine } from '../download/DownloadEngine'
import {
  MOJANG_VERSION_MANIFEST,
  VERSION_MANIFEST_CACHE_TTL,
  APRIL_FOOLS_VERSIONS,
} from '../../shared/constants'
import type {
  VersionManifest,
  VersionEntry,
  VersionJson,
  VersionType,
} from '../../shared/types'

export interface VersionFilter {
  showReleases: boolean
  showSnapshots: boolean
  showBeta: boolean
  showAlpha: boolean
  showAprilFools: boolean
  search: string
}

export class VersionManager {
  private dataDir: string
  private versionsDir: string
  private cacheDir: string
  private manifest: VersionManifest | null = null
  private manifestCacheTime: number = 0
  private downloadEngine: DownloadEngine

  constructor(dataDir: string, downloadEngine: DownloadEngine) {
    this.dataDir = dataDir
    this.versionsDir = join(dataDir, 'versions')
    this.cacheDir = join(dataDir, 'cache')
    this.downloadEngine = downloadEngine

    mkdirSync(this.versionsDir, { recursive: true })
    mkdirSync(this.cacheDir, { recursive: true })
  }

  /**
   * Get the full version manifest, using cache if fresh enough.
   */
  async getManifest(forceRefresh = false): Promise<VersionManifest> {
    const cacheFile = join(this.cacheDir, 'version_manifest_v2.json')

    // Return cached manifest if still fresh
    if (
      !forceRefresh &&
      this.manifest &&
      Date.now() - this.manifestCacheTime < VERSION_MANIFEST_CACHE_TTL
    ) {
      return this.manifest
    }

    // Try to load from disk cache
    if (!forceRefresh && existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(readFileSync(cacheFile, 'utf-8')) as {
          timestamp: number
          data: VersionManifest
        }
        if (Date.now() - cached.timestamp < VERSION_MANIFEST_CACHE_TTL) {
          this.manifest = cached.data
          this.manifestCacheTime = cached.timestamp
          logger.info('VersionManager', 'Loaded version manifest from disk cache')
          return this.manifest
        }
      } catch {
        // Cache corrupted, re-download
      }
    }

    // Fetch from Mojang
    logger.info('VersionManager', 'Fetching version manifest from Mojang...')
    try {
      const response = await this.fetchJson<VersionManifest>(MOJANG_VERSION_MANIFEST)
      this.manifest = response
      this.manifestCacheTime = Date.now()

      // Write to disk cache
      writeFileSync(
        cacheFile,
        JSON.stringify({ timestamp: this.manifestCacheTime, data: this.manifest })
      )

      logger.info('VersionManager', `Loaded ${response.versions.length} versions from manifest`)
      return this.manifest
    } catch (err) {
      // Fall back to disk cache if available (even if stale)
      if (existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'))
          this.manifest = cached.data
          this.manifestCacheTime = cached.timestamp
          logger.warn('VersionManager', 'Using stale cache after fetch failure')
          return this.manifest as VersionManifest
        } catch {
          // ignore
        }
      }
      throw err
    }
  }

  /**
   * Get filtered version list.
   */
  async getFilteredVersions(filter: VersionFilter): Promise<VersionEntry[]> {
    const manifest = await this.getManifest()
    return manifest.versions.filter((v) => {
      // Category filter
      const isAprilFools = APRIL_FOOLS_VERSIONS.has(v.id)
      if (isAprilFools && !filter.showAprilFools) return false
      if (!isAprilFools) {
        if (v.type === 'release' && !filter.showReleases) return false
        if (v.type === 'snapshot' && !filter.showSnapshots) return false
        if (v.type === 'old_beta' && !filter.showBeta) return false
        if (v.type === 'old_alpha' && !filter.showAlpha) return false
      }

      // Search filter
      if (filter.search) {
        return v.id.toLowerCase().includes(filter.search.toLowerCase())
      }

      return true
    })
  }

  /**
   * Get the version JSON for a specific version.
   * Downloads if not cached locally.
   */
  async getVersionJson(versionId: string): Promise<VersionJson> {
    const versionDir = join(this.versionsDir, versionId)
    const jsonPath = join(versionDir, `${versionId}.json`)

    // Check local cache
    if (existsSync(jsonPath)) {
      try {
        return JSON.parse(readFileSync(jsonPath, 'utf-8'))
      } catch {
        // Corrupted, re-download
      }
    }

    // Find version in manifest
    const manifest = await this.getManifest()
    const entry = manifest.versions.find((v) => v.id === versionId)
    if (!entry) {
      throw new Error(`Version ${versionId} not found in manifest`)
    }

    // Download version JSON
    logger.info('VersionManager', `Downloading version JSON for ${versionId}`)
    mkdirSync(versionDir, { recursive: true })
    await this.downloadEngine.downloadSingle(entry.url, jsonPath, entry.sha1)

    return JSON.parse(readFileSync(jsonPath, 'utf-8'))
  }

  /**
   * Resolve inherited version JSONs (e.g., Forge inheriting from vanilla).
   */
  async resolveInheritance(versionJson: VersionJson): Promise<VersionJson> {
    if (!versionJson.inheritsFrom) return versionJson

    const parent = await this.getVersionJson(versionJson.inheritsFrom)
    const resolved = await this.resolveInheritance(parent)

    // Merge: child overrides parent, but libraries are concatenated
    return {
      ...resolved,
      ...versionJson,
      libraries: [...(versionJson.libraries || []), ...(resolved.libraries || [])],
      arguments: {
        game: [
          ...(resolved.arguments?.game || []),
          ...(versionJson.arguments?.game || []),
        ],
        jvm: [
          ...(resolved.arguments?.jvm || []),
          ...(versionJson.arguments?.jvm || []),
        ],
      },
      // Preserve minecraftArguments from child (Forge 1.12.2 uses legacy format)
      minecraftArguments: versionJson.minecraftArguments || resolved.minecraftArguments,
      // Keep parent's downloads if child doesn't have them
      downloads: versionJson.downloads || resolved.downloads,
      assetIndex: versionJson.assetIndex || resolved.assetIndex,
      assets: versionJson.assets || resolved.assets,
    }
  }

  /**
   * Get the latest release version ID.
   */
  async getLatestRelease(): Promise<string> {
    const manifest = await this.getManifest()
    return manifest.latest.release
  }

  /**
   * Get the latest snapshot version ID.
   */
  async getLatestSnapshot(): Promise<string> {
    const manifest = await this.getManifest()
    return manifest.latest.snapshot
  }

  /**
   * Fetch JSON from a URL.
   */
  private async fetchJson<T>(url: string): Promise<T> {
    const https = await import('https')
    return new Promise((resolve, reject) => {
      https.get(
        url,
        { headers: { 'User-Agent': 'HazeLauncher/1.0.1' }, timeout: 15000 },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.fetchJson<T>(res.headers.location).then(resolve).catch(reject)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`))
            return
          }
          let data = ''
          res.on('data', (chunk: string) => (data += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              reject(e)
            }
          })
          res.on('error', reject)
        }
      ).on('error', reject)
    })
  }
}
