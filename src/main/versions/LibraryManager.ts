// ============================================================
// Haze Launcher — Library Manager
// Downloads libraries, builds classpath, extracts natives
// ============================================================

import { existsSync, mkdirSync, readFileSync, createReadStream } from 'fs'
import { join } from 'path'
import { logger } from '../logging/Logger'
import { DownloadEngine, type DownloadItem } from '../download/DownloadEngine'
import { getCurrentPlatform, getCurrentArch, FORGE_MAVEN_URL } from '../../shared/constants'
import { evaluateRules, mavenToPath, getClasspathSeparator } from '../../shared/utils'
import type { VersionJson, Library, DownloadArtifact } from '../../shared/types'

export class LibraryManager {
  private dataDir: string
  private librariesDir: string
  private downloadEngine: DownloadEngine

  constructor(dataDir: string, downloadEngine: DownloadEngine) {
    this.dataDir = dataDir
    this.librariesDir = join(dataDir, 'libraries')
    this.downloadEngine = downloadEngine

    mkdirSync(this.librariesDir, { recursive: true })
  }

  /**
   * Download all required libraries for a version.
   */
  async downloadLibraries(versionJson: VersionJson): Promise<void> {
    const downloads: DownloadItem[] = []

    for (const lib of versionJson.libraries) {
      // Check platform rules
      if (!evaluateRules(lib.rules)) continue

      // Get the main artifact
      const artifact = this.getLibraryArtifact(lib)
      if (artifact) {
        const localPath = join(this.librariesDir, artifact.path || mavenToPath(lib.name))
        downloads.push({
          url: artifact.url,
          path: localPath,
          sha1: artifact.sha1,
          size: artifact.size,
        })
      }

      // Get native artifacts
      const nativeArtifact = this.getNativeArtifact(lib)
      if (nativeArtifact) {
        const localPath = join(this.librariesDir, nativeArtifact.path || '')
        if (nativeArtifact.path) {
          downloads.push({
            url: nativeArtifact.url,
            path: localPath,
            sha1: nativeArtifact.sha1,
            size: nativeArtifact.size,
          })
        }
      }
    }

    // Download client JAR
    if (versionJson.downloads?.client) {
      const jarId = versionJson.jar || versionJson.id
      const clientJar = join(
        this.dataDir,
        'versions',
        jarId,
        `${jarId}.jar`
      )
      downloads.push({
        url: versionJson.downloads.client.url,
        path: clientJar,
        sha1: versionJson.downloads.client.sha1,
        size: versionJson.downloads.client.size,
      })
    }

    if (downloads.length > 0) {
      logger.info('LibraryManager', `Downloading ${downloads.length} libraries...`)
      const failed = await this.downloadEngine.downloadBatch(downloads)
      if (failed.length > 0) {
        logger.error('LibraryManager', `Failed to download ${failed.length} libraries`)
        throw new Error(`Failed to download ${failed.length} libraries`)
      }
    } else {
      logger.info('LibraryManager', 'All libraries already downloaded')
    }
  }

  /**
   * Build the full classpath string for launching the game.
   */
  buildClasspath(versionJson: VersionJson): string {
    const separator = getClasspathSeparator()
    const paths = new Set<string>()

    for (const lib of versionJson.libraries) {
      if (!evaluateRules(lib.rules)) continue

      // Skip native-only libraries (they don't go on classpath)
      if (lib.natives && !lib.downloads?.artifact) continue

      const artifact = this.getLibraryArtifact(lib)
      if (artifact) {
        const localPath = join(this.librariesDir, artifact.path || mavenToPath(lib.name))
        if (existsSync(localPath)) {
          paths.add(localPath)
        }
      }
    }

    // Add client JAR - use inheritsFrom for modloaders that inherit from vanilla
    const jarId = versionJson.jar || versionJson.inheritsFrom || versionJson.id
    const clientJar = join(this.dataDir, 'versions', jarId, `${jarId}.jar`)
    if (existsSync(clientJar)) {
      paths.add(clientJar)
    }

    // Also add the version JAR itself (for forge/neoforge which repackage the client)
    if (versionJson.id !== jarId) {
      const versionJar = join(this.dataDir, 'versions', versionJson.id, `${versionJson.id}.jar`)
      if (existsSync(versionJar)) {
        paths.add(versionJar)
      }
    }

    return Array.from(paths).join(separator)
  }

  /**
   * Extract native libraries to a temporary directory.
   */
  async extractNatives(versionJson: VersionJson, nativesDir: string): Promise<void> {
    mkdirSync(nativesDir, { recursive: true })
    const AdmZip = (await import('adm-zip')).default

    for (const lib of versionJson.libraries) {
      if (!evaluateRules(lib.rules)) continue

      const nativeArtifact = this.getNativeArtifact(lib)
      if (!nativeArtifact || !nativeArtifact.path) continue

      const nativePath = join(this.librariesDir, nativeArtifact.path)
      if (!existsSync(nativePath)) continue

      try {
        const zip = new AdmZip(nativePath)
        const excludes = lib.extract?.exclude || ['META-INF/']

        for (const entry of zip.getEntries()) {
          const shouldExclude = excludes.some((ex) => entry.entryName.startsWith(ex))
          if (!shouldExclude && !entry.isDirectory) {
            zip.extractEntryTo(entry, nativesDir, false, true)
          }
        }
      } catch (err) {
        logger.error('LibraryManager', `Failed to extract native: ${nativePath}`, err)
      }
    }

    logger.info('LibraryManager', `Extracted natives to ${nativesDir}`)
  }

  /**
   * Get the main artifact download info for a library.
   */
  private getLibraryArtifact(lib: Library): DownloadArtifact | null {
    if (lib.downloads?.artifact) {
      return lib.downloads.artifact
    }

    // Fall back to Maven-style URL construction
    if (lib.name) {
      // Heuristic for old native-only libraries (common in pre-1.13)
      // These libraries only exist as natives jars, so we skip the "main" jar.
      if (lib.natives && (lib.name.includes('-platform') || lib.name.includes('twitch-external'))) {
        return null
      }

      const path = mavenToPath(lib.name)
      const baseUrl = lib.url || 'https://libraries.minecraft.net/'
      return {
        path,
        url: `${baseUrl}${path}`,
        sha1: '',
        size: 0,
      }
    }

    return null
  }

  /**
   * Get the native artifact for the current OS.
   */
  private getNativeArtifact(lib: Library): DownloadArtifact | null {
    if (!lib.natives) return null

    const platform = getCurrentPlatform()
    const arch = getCurrentArch()
    let nativeKey = lib.natives[platform]
    if (!nativeKey) return null

    // Replace ${arch} placeholder
    nativeKey = nativeKey.replace('${arch}', arch === 'x64' ? '64' : '32')

    if (lib.downloads?.classifiers?.[nativeKey]) {
      return lib.downloads.classifiers[nativeKey]
    }

    // Fallback for old format (pre-1.13)
    if (lib.name) {
      const path = mavenToPath(`${lib.name}:${nativeKey}`)
      const baseUrl = lib.url || 'https://libraries.minecraft.net/'
      return {
        path,
        url: `${baseUrl}${path}`,
        sha1: '',
        size: 0,
      }
    }

    return null
  }

  /**
   * Get the libraries directory path.
   */
  getLibrariesDir(): string {
    return this.librariesDir
  }
}
