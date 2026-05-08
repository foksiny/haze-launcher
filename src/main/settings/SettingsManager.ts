// ============================================================
// Haze Launcher — Settings Manager
// Global + per-instance settings with JSON persistence
// ============================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import os from 'os'
import { logger } from '../logging/Logger'
import { DEFAULT_GLOBAL_SETTINGS } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/types'

export class SettingsManager {
  private dataDir: string
  private settingsPath: string
  private settings: GlobalSettings

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.settingsPath = join(dataDir, 'settings.json')
    this.settings = this.loadSettings()
  }

  /**
   * Get all settings.
   */
  getSettings(): GlobalSettings {
    return { ...this.settings }
  }

  /**
   * Update settings (partial update).
   */
  updateSettings(updates: Partial<GlobalSettings>): GlobalSettings {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()
    logger.info('SettingsManager', 'Settings updated', updates)
    return this.settings
  }

  /**
   * Get a specific setting value.
   */
  get<K extends keyof GlobalSettings>(key: K): GlobalSettings[K] {
    return this.settings[key]
  }

  /**
   * Get system RAM info (total, free, recommended max).
   */
  getSystemRamInfo(): { total: number; free: number; recommended: number } {
    const total = Math.floor(os.totalmem() / (1024 * 1024)) // MB
    const free = Math.floor(os.freemem() / (1024 * 1024))
    const recommended = Math.floor(total * 0.7)
    return { total, free, recommended }
  }

  /**
   * Get data directory.
   */
  getDataDir(): string {
    return this.settings.dataDirectory || this.dataDir
  }

  /**
   * Reset settings to defaults.
   */
  resetSettings(): GlobalSettings {
    this.settings = { ...DEFAULT_GLOBAL_SETTINGS, dataDirectory: this.dataDir }
    this.saveSettings()
    return this.settings
  }

  private loadSettings(): GlobalSettings {
    if (existsSync(this.settingsPath)) {
      try {
        const data = JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
        return { ...DEFAULT_GLOBAL_SETTINGS, ...data, dataDirectory: data.dataDirectory || this.dataDir }
      } catch {
        logger.warn('SettingsManager', 'Failed to load settings, using defaults')
      }
    }

    return { ...DEFAULT_GLOBAL_SETTINGS, dataDirectory: this.dataDir }
  }

  private saveSettings(): void {
    mkdirSync(this.dataDir, { recursive: true })
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2))
  }
}
