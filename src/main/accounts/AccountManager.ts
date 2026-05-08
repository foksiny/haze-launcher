// ============================================================
// Haze Launcher — Account Manager
// Offline accounts + Ely.by integration
// ============================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import https from 'https'
import { logger } from '../logging/Logger'
import { generateOfflineUUID, generateId } from '../../shared/utils'
import { ELYBY_API_URL, ELYBY_SKINS_URL, CRAFATAR_URL } from '../../shared/constants'
import type { Account, AccountType } from '../../shared/types'

export class AccountManager {
  private dataDir: string
  private accountsDir: string
  private accountsFile: string
  private accounts: Account[] = []
  private activeAccountId: string = ''

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.accountsDir = join(dataDir, 'accounts')
    this.accountsFile = join(this.accountsDir, 'accounts.json')
    mkdirSync(this.accountsDir, { recursive: true })
    this.loadAccounts()
  }

  /**
   * Get all accounts.
   */
  getAllAccounts(): Account[] {
    return [...this.accounts]
  }

  /**
   * Get the active account.
   */
  getActiveAccount(): Account | null {
    return this.accounts.find((a) => a.id === this.activeAccountId) || this.accounts[0] || null
  }

  /**
   * Get an account by ID.
   */
  getAccount(id: string): Account | null {
    return this.accounts.find((a) => a.id === id) || null
  }

  /**
   * Create a new offline account.
   */
  createOfflineAccount(username: string): Account {
    const uuid = generateOfflineUUID(username)

    const account: Account = {
      id: generateId(),
      type: 'offline',
      username,
      uuid,
      skinUrl: `${CRAFATAR_URL}/avatars/${uuid}?overlay`,
      skinModel: this.getSkinModelFromUuid(uuid),
      capeUrl: '',
      elybyToken: '',
      elybyRefreshToken: '',
      createdAt: new Date().toISOString(),
      lastUsed: '',
    }

    this.accounts.push(account)
    if (this.accounts.length === 1) {
      this.activeAccountId = account.id
    }
    this.saveAccounts()

    logger.info('AccountManager', `Created offline account: ${username} (${uuid})`)
    return account
  }

  /**
   * Create/link an Ely.by account.
   */
  async createElyByAccount(username: string, password: string): Promise<Account> {
    // Authenticate with Ely.by
    const authResponse = await this.elybyAuthenticate(username, password)

    const account: Account = {
      id: generateId(),
      type: 'elyby',
      username: authResponse.selectedProfile.name,
      uuid: authResponse.selectedProfile.id,
      skinUrl: `${ELYBY_SKINS_URL}/skins/${authResponse.selectedProfile.name}.png`,
      skinModel: 'classic',
      capeUrl: `${ELYBY_SKINS_URL}/cloaks/${authResponse.selectedProfile.name}.png`,
      elybyToken: authResponse.accessToken,
      elybyRefreshToken: authResponse.clientToken,
      createdAt: new Date().toISOString(),
      lastUsed: '',
    }

    this.accounts.push(account)
    if (this.accounts.length === 1) {
      this.activeAccountId = account.id
    }
    this.saveAccounts()

    logger.info('AccountManager', `Created Ely.by account: ${account.username}`)
    return account
  }

  /**
   * Update an account.
   */
  updateAccount(id: string, updates: Partial<Account>): Account | null {
    const index = this.accounts.findIndex((a) => a.id === id)
    if (index === -1) return null

    // If username changed for offline account, regenerate UUID
    if (updates.username && this.accounts[index].type === 'offline') {
      updates.uuid = generateOfflineUUID(updates.username)
      updates.skinUrl = `${CRAFATAR_URL}/avatars/${updates.uuid}?overlay`
      updates.skinModel = this.getSkinModelFromUuid(updates.uuid)
    }

    this.accounts[index] = { ...this.accounts[index], ...updates }
    this.saveAccounts()
    return this.accounts[index]
  }

  /**
   * Delete an account.
   */
  deleteAccount(id: string): void {
    this.accounts = this.accounts.filter((a) => a.id !== id)
    if (this.activeAccountId === id) {
      this.activeAccountId = this.accounts[0]?.id || ''
    }
    this.saveAccounts()
    logger.info('AccountManager', `Deleted account ${id}`)
  }

  /**
   * Set the active account.
   */
  setActiveAccount(id: string): void {
    if (this.accounts.some((a) => a.id === id)) {
      this.activeAccountId = id
      this.saveAccounts()
    }
  }

  /**
   * Refresh an Ely.by token.
   */
  async refreshElyByToken(accountId: string): Promise<boolean> {
    const account = this.getAccount(accountId)
    if (!account || account.type !== 'elyby') return false

    try {
      const response = await this.fetchJson(`${ELYBY_API_URL}/auth/refresh`, {
        method: 'POST',
        body: JSON.stringify({
          accessToken: account.elybyToken,
          clientToken: account.elybyRefreshToken,
        }),
      })

      account.elybyToken = response.accessToken
      this.saveAccounts()
      return true
    } catch (err) {
      logger.error('AccountManager', `Failed to refresh Ely.by token for ${account.username}`, err)
      return false
    }
  }

  /**
   * Determine skin model (Steve/Alex) from UUID hash.
   * Alex skin is used when (uuid.hashCode() & 1) == 1
   */
  private getSkinModelFromUuid(uuid: string): 'classic' | 'slim' {
    const hex = uuid.replace(/-/g, '')
    // Java's hashCode equivalent for UUID
    const bytes = Buffer.from(hex, 'hex')
    let hash = 0
    for (let i = 0; i < bytes.length; i++) {
      hash = ((hash << 5) - hash + bytes[i]) | 0
    }
    return (hash & 1) === 1 ? 'slim' : 'classic'
  }

  private async elybyAuthenticate(username: string, password: string): Promise<{
    accessToken: string
    clientToken: string
    selectedProfile: { id: string; name: string }
  }> {
    return this.fetchJson(`${ELYBY_API_URL}/auth/authenticate`, {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        clientToken: generateId(),
        requestUser: true,
      }),
    })
  }

  private async fetchJson(url: string, options: { method: string; body?: string }): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      const req = https.request(
        {
          hostname: urlObj.hostname,
          path: urlObj.pathname,
          method: options.method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'HazeLauncher/1.0.0',
          },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk: string) => (data += chunk))
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data)
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(parsed.errorMessage || `HTTP ${res.statusCode}`))
              } else {
                resolve(parsed)
              }
            } catch (e) {
              reject(e)
            }
          })
        }
      )
      req.on('error', reject)
      if (options.body) req.write(options.body)
      req.end()
    })
  }

  private loadAccounts(): void {
    if (existsSync(this.accountsFile)) {
      try {
        const data = JSON.parse(readFileSync(this.accountsFile, 'utf-8'))
        this.accounts = data.accounts || []
        this.activeAccountId = data.activeAccountId || ''
      } catch {
        logger.warn('AccountManager', 'Failed to load accounts')
        this.accounts = []
      }
    }
  }

  private saveAccounts(): void {
    writeFileSync(
      this.accountsFile,
      JSON.stringify(
        {
          accounts: this.accounts,
          activeAccountId: this.activeAccountId,
        },
        null,
        2
      )
    )
  }
}
