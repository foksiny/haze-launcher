// ============================================================
// Haze Launcher — Discord Manager
// Integrates @xhayper/discord-rpc for Rich Presence
// ============================================================

import { Client } from '@xhayper/discord-rpc'
import { logger } from '../logging/Logger'
import { APP_NAME } from '../../shared/constants'

// Default Discord Client ID for Haze (Create one in Discord Developer Portal if you haven't)
// You can use a generic ID or allow users to input their own.
const DISCORD_CLIENT_ID = '1191024354321234567' // Replace with your actual Client ID

export class DiscordManager {
  private client: Client
  private enabled: boolean = true
  private connected: boolean = false
  private startTimestamp: Date = new Date()

  constructor() {
    this.client = new Client({ clientId: DISCORD_CLIENT_ID })

    this.client.on('ready', () => {
      logger.info('DiscordManager', `Connected to Discord as ${this.client.user?.username}`)
      this.connected = true
      this.updatePresence('Idle', 'In Launcher')
    })

    this.client.on('disconnected', () => {
      logger.warn('DiscordManager', 'Disconnected from Discord')
      this.connected = false
    })
  }

  /**
   * Connect to Discord.
   */
  async connect(): Promise<void> {
    if (!this.enabled || this.connected) return

    try {
      await this.client.login()
    } catch (err) {
      logger.error('DiscordManager', `Failed to connect to Discord: ${err}`)
    }
  }

  /**
   * Disconnect from Discord.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return

    try {
      await this.client.destroy()
      this.connected = false
      logger.info('DiscordManager', 'Disconnected from Discord intentionally')
    } catch (err) {
      logger.error('DiscordManager', `Error disconnecting from Discord: ${err}`)
    }
  }

  /**
   * Enable or disable Rich Presence.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return

    this.enabled = enabled
    if (enabled) {
      this.connect()
    } else {
      this.disconnect()
    }
  }

  /**
   * Update the Rich Presence status.
   */
  updatePresence(state: string, details?: string, inGame: boolean = false): void {
    if (!this.connected || !this.enabled) return

    try {
      this.client.user?.setActivity({
        state,
        details,
        startTimestamp: inGame ? new Date() : this.startTimestamp,
        largeImageKey: 'icon_large', // Assuming you upload an asset named 'icon_large' to your Discord app
        largeImageText: APP_NAME,
        smallImageKey: inGame ? 'playing' : undefined,
        smallImageText: inGame ? 'Playing Minecraft' : undefined,
      })
    } catch (err) {
      logger.error('DiscordManager', `Failed to update presence: ${err}`)
    }
  }
}
