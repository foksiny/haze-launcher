// ============================================================
// Haze Launcher — Mod Manager
// Search, install, update mods from Modrinth + CurseForge
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, readdirSync } from 'fs'
import { join, basename, extname } from 'path'
import https from 'https'
import { logger } from '../logging/Logger'
import { DownloadEngine } from '../download/DownloadEngine'
import { MODRINTH_API_URL, CURSEFORGE_API_URL, CURSEFORGE_MINECRAFT_GAME_ID, DEFAULT_CURSEFORGE_API_KEY } from '../../shared/constants'
import { generateId } from '../../shared/utils'
import type {
  ModSearchResult,
  ModVersion,
  InstalledMod,
  ModSource,
  ModDependency,
  ModloaderType,
  ProjectType,
} from '../../shared/types'

export interface ModSearchParams {
  query: string
  mcVersion: string
  loader: ModloaderType
  projectType?: ProjectType
  category?: string
  sortBy?: 'relevance' | 'downloads' | 'updated' | 'newest'
  offset?: number
  limit?: number
  source?: 'modrinth' | 'curseforge' | 'both'
}

export class ModManager {
  private dataDir: string
  private downloadEngine: DownloadEngine
  private curseforgeApiKey: string
  private useCurseForge: boolean = true
  private installingMods = new Set<string>()

  constructor(dataDir: string, downloadEngine: DownloadEngine, curseforgeApiKey: string = '') {
    this.dataDir = dataDir
    this.downloadEngine = downloadEngine
    this.curseforgeApiKey = curseforgeApiKey || DEFAULT_CURSEFORGE_API_KEY
  }

  setCurseForgeApiKey(key: string): void {
    this.curseforgeApiKey = key || DEFAULT_CURSEFORGE_API_KEY
  }

  setUseCurseForge(enabled: boolean): void {
    this.useCurseForge = enabled
  }

  isInstalling(instanceId: string, modId: string): boolean {
    return this.installingMods.has(`${instanceId}:${modId}`)
  }

  // ─── Search ───────────────────────────────────────────────

  async searchMods(params: ModSearchParams): Promise<ModSearchResult[]> {
    const results: ModSearchResult[] = []
    const source = params.source || 'both'

    const promises: Promise<void>[] = []

    if (source === 'modrinth' || source === 'both') {
      promises.push(
        this.searchModrinth(params).then((r) => { results.push(...r) }).catch((err) => {
          logger.error('ModManager', 'Modrinth search failed', err)
        })
      )
    }

    if ((source === 'curseforge' || source === 'both') && this.useCurseForge) {
      promises.push(
        this.searchCurseForge(params).then((r) => { results.push(...r) }).catch((err) => {
          logger.error('ModManager', 'CurseForge search failed', err)
        })
      )
    }

    await Promise.all(promises)

    // Deduplicate by name (prefer Modrinth)
    const seen = new Map<string, ModSearchResult>()
    for (const result of results) {
      const key = result.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!seen.has(key)) {
        seen.set(key, result)
      }
    }

    return Array.from(seen.values())
  }

  // ─── Install ──────────────────────────────────────────────

  async installMod(
    modVersion: ModVersion,
    instanceId: string,
    autoInstallDeps: boolean = true,
    projectType?: 'mod' | 'resourcepack'
  ): Promise<InstalledMod> {
    // Detect project type: if explicitly passed, use that; otherwise detect from loaders/file extension
    let detectedProjectType: 'mod' | 'resourcepack' = 'mod'
    if (projectType === 'resourcepack') {
      detectedProjectType = 'resourcepack'
    } else if (modVersion.fileName.endsWith('.zip') && modVersion.loaders.length === 0) {
      detectedProjectType = 'resourcepack'
    } else if (modVersion.loaders.length === 0 && !modVersion.loaders.includes('fabric') && !modVersion.loaders.includes('forge')) {
      detectedProjectType = 'resourcepack'
    }
    const targetFolder = detectedProjectType === 'resourcepack' ? 'resourcepacks' : 'mods'
    const modsDir = join(this.dataDir, 'instances', instanceId, '.minecraft', targetFolder)
    mkdirSync(modsDir, { recursive: true })

    const destPath = join(modsDir, modVersion.fileName)
    const installKey = `${instanceId}:${modVersion.modId}`
    this.installingMods.add(installKey)

    try {
      // Download the mod
      logger.info('ModManager', `Installing ${modVersion.fileName} to instance ${instanceId}`)
      await this.downloadEngine.downloadSingle(modVersion.fileUrl, destPath, modVersion.sha1)
    } finally {
      this.installingMods.delete(installKey)
    }

    // Track the mod
    const installed: InstalledMod = {
      id: generateId(),
      name: modVersion.name,
      version: modVersion.versionNumber,
      fileName: modVersion.fileName,
      source: modVersion.source,
      sourceId: modVersion.modId,
      sourceVersionId: modVersion.id,
      enabled: true,
      iconUrl: '',
      description: '',
      authors: [],
      installedAt: new Date().toISOString(),
      dependencies: modVersion.dependencies
        .filter((d) => d.dependencyType === 'required')
        .map((d) => d.projectId),
    }

    this.addModToTracking(instanceId, installed)

    // Auto-install dependencies
    if (autoInstallDeps) {
      const requiredDeps = modVersion.dependencies.filter((d) => d.dependencyType === 'required')
      const mcVersion = modVersion.gameVersions[0] || ''
      const loader = modVersion.loaders[0] || ''

      for (const dep of requiredDeps) {
        try {
          const depId = dep.projectId

          // Get dependency details
          const depMod = await this.getModDetails(depId, modVersion.source)
          if (!depMod) continue

          // Find compatible version
          const depVersion = await this.getCompatibleVersion(depId, modVersion.source, mcVersion, loader)
          if (!depVersion) continue

          if (!this.isModInstalled(instanceId, depId)) {
            logger.info('ModManager', `Auto-installing dependency: ${depMod.name}`)
            await this.installMod(depVersion, instanceId, false)
          }
        } catch (err) {
          logger.warn('ModManager', `Failed to auto-install dependency: ${dep.projectId}`, err)
        }
      }
    }

    return installed
  }

  // ─── Management ───────────────────────────────────────────

  getInstalledMods(instanceId: string): InstalledMod[] {
    const trackingFile = join(this.dataDir, 'instances', instanceId, 'instance_mods.json')
    if (!existsSync(trackingFile)) return []

    try {
      const data = JSON.parse(readFileSync(trackingFile, 'utf-8'))
      return data.mods || []
    } catch {
      return []
    }
  }

  toggleMod(instanceId: string, modId: string): boolean {
    const mods = this.getInstalledMods(instanceId)
    const mod = mods.find((m) => m.id === modId)
    if (!mod) return false

    const modsDir = join(this.dataDir, 'instances', instanceId, '.minecraft', 'mods')

    if (mod.enabled) {
      // Disable: rename .jar to .jar.disabled
      const src = join(modsDir, mod.fileName)
      const dest = join(modsDir, `${mod.fileName}.disabled`)
      if (existsSync(src)) {
        renameSync(src, dest)
        mod.enabled = false
        mod.fileName = `${mod.fileName}.disabled`
      }
    } else {
      // Enable: rename .jar.disabled to .jar
      const src = join(modsDir, mod.fileName)
      const dest = join(modsDir, mod.fileName.replace('.disabled', ''))
      if (existsSync(src)) {
        renameSync(src, dest)
        mod.enabled = true
        mod.fileName = mod.fileName.replace('.disabled', '')
      }
    }

    this.saveModTracking(instanceId, mods)
    return mod.enabled
  }

  uninstallMod(instanceId: string, modId: string): void {
    const mods = this.getInstalledMods(instanceId)
    const mod = mods.find((m) => m.id === modId)
    if (!mod) return

    const modsDir = join(this.dataDir, 'instances', instanceId, '.minecraft', 'mods')
    const filePath = join(modsDir, mod.fileName)

    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    const updated = mods.filter((m) => m.id !== modId)
    this.saveModTracking(instanceId, updated)
    logger.info('ModManager', `Uninstalled mod ${mod.name} from instance ${instanceId}`)
  }

  async checkForUpdates(instanceId: string, mcVersion: string, loader: string): Promise<Map<string, ModVersion>> {
    const mods = this.getInstalledMods(instanceId)
    const updates = new Map<string, ModVersion>()

    for (const mod of mods) {
      if (mod.source === 'manual') continue

      try {
        const latestVersion = await this.getCompatibleVersion(
          mod.sourceId,
          mod.source as 'modrinth' | 'curseforge',
          mcVersion,
          loader
        )

        if (latestVersion && latestVersion.id !== mod.sourceVersionId) {
          updates.set(mod.id, latestVersion)
        }
      } catch (err) {
        logger.warn('ModManager', `Failed to check updates for ${mod.name}`, err)
      }
    }

    return updates
  }

  async updateMod(instanceId: string, modId: string, newVersion: ModVersion): Promise<void> {
    // Remove old version
    this.uninstallMod(instanceId, modId)
    // Install new version
    await this.installMod(newVersion, instanceId, false)
  }

  async updateAllMods(instanceId: string, mcVersion: string, loader: string): Promise<number> {
    const updates = await this.checkForUpdates(instanceId, mcVersion, loader)
    let count = 0

    for (const [modId, newVersion] of updates) {
      try {
        await this.updateMod(instanceId, modId, newVersion)
        count++
      } catch (err) {
        logger.error('ModManager', `Failed to update mod ${modId}`, err)
      }
    }

    return count
  }

  // ─── Import/Export ────────────────────────────────────────

  exportModList(instanceId: string): string {
    const mods = this.getInstalledMods(instanceId)
    return mods.map(m => `${m.name} | ${m.version} | ${m.source}`).join('\n')
  }

  async importModList(instanceId: string, text: string, mcVersion: string, loader: string): Promise<void> {
    const lines = text.split('\n').filter(l => l.trim())
    logger.info('ModManager', `Importing ${lines.length} mods to instance ${instanceId}`)

    for (const line of lines) {
      try {
        const [name, version, sourceStr] = line.split('|').map(s => s.trim())
        const source = (sourceStr?.toLowerCase() === 'curseforge' ? 'curseforge' : 'modrinth') as 'modrinth' | 'curseforge'

        // Search for the mod
        const searchResults = await this.searchMods({
          query: name,
          mcVersion,
          loader: loader as ModloaderType,
          source,
          limit: 1
        })

        const bestMatch = searchResults[0]
        if (bestMatch) {
          const versions = await this.getModVersions(bestMatch.id, bestMatch.source)
          // Try to find exact version, otherwise compatible one
          const targetVersion = versions.find(v => v.versionNumber === version && v.gameVersions.includes(mcVersion))
            || versions.find(v => v.gameVersions.includes(mcVersion))

          if (targetVersion) {
            await this.installMod(targetVersion, instanceId)
          }
        }
      } catch (err) {
        logger.error('ModManager', `Failed to import mod from line: ${line}`, err)
      }
    }
  }

  // ─── Mod Versions ─────────────────────────────────────────

  async getModVersions(projectId: string, source: ModSource): Promise<ModVersion[]> {
    if (source === 'modrinth') {
      return this.getModrinthVersions(projectId)
    } else if (source === 'curseforge') {
      return this.getCurseForgeVersions(projectId)
    }
    return []
  }

  // ─── Modrinth API ─────────────────────────────────────────

  private async searchModrinth(params: ModSearchParams): Promise<ModSearchResult[]> {
    const facets: string[][] = []
    facets.push([`versions:${params.mcVersion}`])
    if (params.loader !== 'vanilla' && params.projectType !== 'resourcepack') {
      facets.push([`categories:${params.loader}`])
    }
    facets.push([`project_type:${params.projectType || 'mod'}`])
    if (params.category) {
      facets.push([`categories:${params.category}`])
    }

    const sortMap: Record<string, string> = {
      relevance: 'relevance',
      downloads: 'downloads',
      updated: 'updated',
      newest: 'newest',
    }

    const queryParams = new URLSearchParams({
      query: params.query,
      facets: JSON.stringify(facets),
      limit: String(params.limit || 20),
      offset: String(params.offset || 0),
      index: sortMap[params.sortBy || 'relevance'],
    })

    const data = await this.fetchJson(`${MODRINTH_API_URL}/search?${queryParams}`)

    return (data.hits || []).map((hit: any) => ({
      id: hit.project_id,
      source: 'modrinth' as ModSource,
      projectType: hit.project_type as ProjectType,
      name: hit.title,
      slug: hit.slug,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url || '',
      downloads: hit.downloads,
      lastUpdated: hit.date_modified,
      categories: hit.categories || [],
      versions: hit.versions || [],
      loaders: hit.categories?.filter((c: string) =>
        ['fabric', 'forge', 'quilt', 'neoforge', 'liteloader'].includes(c)
      ) || [],
    }))
  }

  private async getModrinthVersions(projectId: string): Promise<ModVersion[]> {
    const data = await this.fetchJson(`${MODRINTH_API_URL}/project/${projectId}/version`)

    return (data || []).map((v: any) => {
      const primaryFile = v.files?.find((f: any) => f.primary) || v.files?.[0]
      return {
        id: v.id,
        modId: projectId,
        source: 'modrinth' as ModSource,
        name: v.name,
        versionNumber: v.version_number,
        gameVersions: v.game_versions || [],
        loaders: v.loaders || [],
        fileName: primaryFile?.filename || '',
        fileSize: primaryFile?.size || 0,
        fileUrl: primaryFile?.url || '',
        sha1: primaryFile?.hashes?.sha1 || '',
        sha512: primaryFile?.hashes?.sha512 || '',
        dependencies: (v.dependencies || []).map((d: any) => ({
          projectId: d.project_id,
          dependencyType: d.dependency_type,
          versionId: d.version_id,
        })),
        datePublished: v.date_published,
      }
    })
  }

  private async getModDetails(projectId: string, source: ModSource): Promise<ModSearchResult | null> {
    if (source === 'modrinth') {
      try {
        const data = await this.fetchJson(`${MODRINTH_API_URL}/project/${projectId}`)
        return {
          id: data.id,
          source: 'modrinth',
          projectType: data.project_type,
          name: data.title,
          slug: data.slug,
          description: data.description,
          author: '',
          iconUrl: data.icon_url || '',
          downloads: data.downloads,
          lastUpdated: data.updated,
          categories: data.categories || [],
          versions: data.versions || [],
          loaders: data.loaders || [],
        }
      } catch {
        return null
      }
    }
    if (source === 'curseforge') {
      try {
        const data = await this.fetchJsonCF(`/v1/mods/${projectId}`)
        return {
          id: String(data.data.id),
          source: 'curseforge',
          projectType: 'mod',
          name: data.data.name,
          slug: data.data.slug,
          description: data.data.summary,
          author: data.data.authors?.[0]?.name || '',
          iconUrl: data.data.logo?.url || '',
          downloads: data.data.downloadCount,
          lastUpdated: data.data.dateModified,
          categories: data.data.categories?.map((c: any) => c.name) || [],
          versions: [],
          loaders: [],
        }
      } catch {
        return null
      }
    }
    return null
  }

  // ─── CurseForge API ──────────────────────────────────────

  private async searchCurseForge(params: ModSearchParams): Promise<ModSearchResult[]> {
    if (!this.curseforgeApiKey) return []

    const loaderMap: Record<string, number> = {
      forge: 1,
      fabric: 4,
      quilt: 5,
      neoforge: 6,
    }

    const sortMap: Record<string, number> = {
      relevance: 1,
      downloads: 6,
      updated: 3,
      newest: 11,
    }

    const queryParams = new URLSearchParams({
      gameId: String(CURSEFORGE_MINECRAFT_GAME_ID),
      searchFilter: params.query,
      gameVersion: params.mcVersion,
      classId: params.projectType === 'resourcepack' ? '12' : '6', 
      sortField: String(sortMap[params.sortBy || 'relevance']),
      sortOrder: 'desc',
      pageSize: String(params.limit || 20),
      index: String(params.offset || 0),
    })

    // Only apply loader filter for mods, not resource packs
    if (params.projectType !== 'resourcepack' && params.loader !== 'vanilla' && loaderMap[params.loader]) {
      queryParams.set('modLoaderType', String(loaderMap[params.loader]))
    }

    const data = await this.fetchJsonCF(`/v1/mods/search?${queryParams}`)

    return (data.data || []).map((mod: any) => ({
      id: String(mod.id),
      source: 'curseforge' as ModSource,
      projectType: params.projectType || 'mod',
      name: mod.name,
      slug: mod.slug,
      description: mod.summary,
      author: mod.authors?.[0]?.name || '',
      iconUrl: mod.logo?.thumbnailUrl || '',
      downloads: mod.downloadCount,
      lastUpdated: mod.dateModified,
      categories: mod.categories?.map((c: any) => c.name) || [],
      versions: mod.latestFilesIndexes?.map((f: any) => f.gameVersion) || [],
      loaders: [],
    }))
  }

  private async getCurseForgeVersions(projectId: string): Promise<ModVersion[]> {
    if (!this.curseforgeApiKey) return []

    const data = await this.fetchJsonCF(`/v1/mods/${projectId}/files?pageSize=50`)

    return (data.data || []).map((f: any) => ({
      id: String(f.id),
      modId: projectId,
      source: 'curseforge' as ModSource,
      name: f.displayName,
      versionNumber: f.displayName,
      gameVersions: f.gameVersions || [],
      loaders: f.gameVersions?.filter((v: string) =>
        ['Fabric', 'Forge', 'Quilt', 'NeoForge'].includes(v)
      ).map((v: string) => v.toLowerCase()) || [],
      fileName: f.fileName,
      fileSize: f.fileLength,
      fileUrl: f.downloadUrl || '',
      sha1: '',
      sha512: '',
      dependencies: (f.dependencies || []).map((d: any) => ({
        projectId: String(d.modId),
        dependencyType: d.relationType === 3 ? 'required' : 'optional',
      })),
      datePublished: f.fileDate,
    }))
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async getCompatibleVersion(
    projectId: string,
    source: 'modrinth' | 'curseforge',
    mcVersion: string,
    loader: string
  ): Promise<ModVersion | null> {
    const versions = await this.getModVersions(projectId, source)
    // First try to find exact match with both MC version and loader
    const exactMatch = versions.find((v) =>
      v.gameVersions.includes(mcVersion) &&
      (loader === '' || v.loaders.length === 0 || v.loaders.some((l) => l.toLowerCase() === loader.toLowerCase()))
    )
    if (exactMatch) return exactMatch
    // Fallback: just match MC version
    return versions.find((v) => v.gameVersions.includes(mcVersion)) || null
  }

  private isModInstalled(instanceId: string, sourceId: string): boolean {
    const mods = this.getInstalledMods(instanceId)
    return mods.some((m) => m.sourceId === sourceId)
  }

  private addModToTracking(instanceId: string, mod: InstalledMod): void {
    const mods = this.getInstalledMods(instanceId)
    mods.push(mod)
    this.saveModTracking(instanceId, mods)
  }

  private saveModTracking(instanceId: string, mods: InstalledMod[]): void {
    const trackingFile = join(this.dataDir, 'instances', instanceId, 'instance_mods.json')
    writeFileSync(trackingFile, JSON.stringify({ mods }, null, 2))
  }

  private async fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: { 'User-Agent': 'HazeLauncher/1.0.0 (foksiny/haze-launcher)' },
        timeout: 15000,
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchJson(res.headers.location).then(resolve).catch(reject)
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

  private async fetchJsonCF(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${CURSEFORGE_API_URL}${path}`)
      https.get(url, {
        headers: {
          'User-Agent': 'HazeLauncher/1.0.0',
          'x-api-key': this.curseforgeApiKey,
          'Accept': 'application/json',
        },
        timeout: 15000,
      }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let data = ''
          res.on('data', (chunk: string) => (data += chunk))
          res.on('end', () => {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`))
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
