// ============================================================
// Haze Launcher — Asset Manager
// Downloads and manages Minecraft assets (textures, sounds, etc.)
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logging/Logger'
import { DownloadEngine, type DownloadItem } from '../download/DownloadEngine'
import { MOJANG_RESOURCES_URL } from '../../shared/constants'
import type { AssetIndex, VersionJson } from '../../shared/types'

export class AssetManager {
  private dataDir: string
  private assetsDir: string
  private downloadEngine: DownloadEngine

  constructor(dataDir: string, downloadEngine: DownloadEngine) {
    this.dataDir = dataDir
    this.assetsDir = join(dataDir, 'assets')
    this.downloadEngine = downloadEngine

    mkdirSync(join(this.assetsDir, 'indexes'), { recursive: true })
    mkdirSync(join(this.assetsDir, 'objects'), { recursive: true })
  }

  /**
   * Download the asset index and all required assets for a version.
   */
  async downloadAssets(versionJson: VersionJson): Promise<void> {
    if (!versionJson.assetIndex) {
      logger.warn('AssetManager', `No asset index for version ${versionJson.id}`)
      return
    }

    const assetIndex = versionJson.assetIndex
    const indexPath = join(this.assetsDir, 'indexes', `${assetIndex.id}.json`)

    // Download asset index
    if (!existsSync(indexPath) || !this.verifyFile(indexPath, assetIndex.sha1)) {
      logger.info('AssetManager', `Downloading asset index ${assetIndex.id}...`)
      await this.downloadEngine.downloadSingle(assetIndex.url, indexPath, assetIndex.sha1)
    }

    // Parse asset index
    const index: AssetIndex = JSON.parse(readFileSync(indexPath, 'utf-8'))
    const objects = Object.entries(index.objects)

    // Build download list for missing assets
    const downloads: DownloadItem[] = []

    for (const [, obj] of objects) {
      const hashPrefix = obj.hash.substring(0, 2)
      const objectPath = join(this.assetsDir, 'objects', hashPrefix, obj.hash)

      downloads.push({
        url: `${MOJANG_RESOURCES_URL}/${hashPrefix}/${obj.hash}`,
        path: objectPath,
        sha1: obj.hash,
        size: obj.size,
      })
    }

    if (downloads.length > 0) {
      logger.info('AssetManager', `Downloading ${downloads.length} assets...`)
      const failed = await this.downloadEngine.downloadBatch(downloads)
      if (failed.length > 0) {
        logger.error('AssetManager', `Failed to download ${failed.length} assets`)
        throw new Error(`Failed to download ${failed.length} assets`)
      }
    } else {
      logger.info('AssetManager', 'All assets already downloaded')
    }
  }

  /**
   * Set up virtual (legacy) assets directory for old versions.
   * Old versions expect assets in a flat directory structure.
   */
  async setupVirtualAssets(versionJson: VersionJson, instanceDir: string): Promise<string> {
    const assetIndexId = versionJson.assetIndex?.id || versionJson.assets
    if (!assetIndexId) return this.assetsDir

    // Check if this version uses legacy/virtual assets
    const indexPath = join(this.assetsDir, 'indexes', `${assetIndexId}.json`)
    if (!existsSync(indexPath)) return this.assetsDir

    const index: AssetIndex & { virtual?: boolean; map_to_resources?: boolean } = JSON.parse(
      readFileSync(indexPath, 'utf-8')
    )

    if (index.virtual || index.map_to_resources) {
      const virtualDir = join(this.assetsDir, 'virtual', assetIndexId)
      mkdirSync(virtualDir, { recursive: true })

      const fs = await import('fs/promises')
      for (const [name, obj] of Object.entries(index.objects)) {
        const hashPrefix = obj.hash.substring(0, 2)
        const sourcePath = join(this.assetsDir, 'objects', hashPrefix, obj.hash)
        const destPath = join(virtualDir, ...name.split('/'))

        if (!existsSync(destPath) && existsSync(sourcePath)) {
          mkdirSync(join(destPath, '..'), { recursive: true })
          await fs.copyFile(sourcePath, destPath)
        }
      }

      // For map_to_resources, also copy to instance resources dir
      if (index.map_to_resources) {
        const resourcesDir = join(instanceDir, '.minecraft', 'resources')
        mkdirSync(resourcesDir, { recursive: true })

        for (const [name, obj] of Object.entries(index.objects)) {
          const hashPrefix = obj.hash.substring(0, 2)
          const sourcePath = join(this.assetsDir, 'objects', hashPrefix, obj.hash)
          const destPath = join(resourcesDir, ...name.split('/'))

          if (!existsSync(destPath) && existsSync(sourcePath)) {
            mkdirSync(join(destPath, '..'), { recursive: true })
            await fs.copyFile(sourcePath, destPath)
          }
        }
      }

      return virtualDir
    }

    return this.assetsDir
  }

  /**
   * Get the assets directory path.
   */
  getAssetsDir(): string {
    return this.assetsDir
  }

  private verifyFile(path: string, expectedSha1: string): boolean {
    try {
      const { createHash } = require('crypto')
      const data = readFileSync(path)
      const hash = createHash('sha1').update(data).digest('hex')
      return hash === expectedSha1
    } catch {
      return false
    }
  }
}
