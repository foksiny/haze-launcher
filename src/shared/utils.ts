// ============================================================
// Haze Launcher — Shared Utilities
// ============================================================

import { createHash } from 'crypto'
import type { Rule } from './types'
import { getCurrentPlatform, getCurrentArch } from './constants'

/**
 * Generate a deterministic offline UUID from a Minecraft username.
 * Uses the same algorithm as Minecraft: UUID.nameUUIDFromBytes("OfflinePlayer:<username>")
 * This is a v3 UUID (MD5-based, name-based).
 */
export function generateOfflineUUID(username: string): string {
  const data = Buffer.from(`OfflinePlayer:${username}`, 'utf-8')
  const hash = createHash('md5').update(data).digest()

  // Set version to 3 (MD5 name-based)
  hash[6] = (hash[6] & 0x0f) | 0x30
  // Set variant to IETF (10xx)
  hash[8] = (hash[8] & 0x3f) | 0x80

  const hex = hash.toString('hex')
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-')
}

/**
 * Convert a Maven artifact name (group:artifact:version) to a relative file path.
 * Example: "org.lwjgl:lwjgl:3.2.1" -> "org/lwjgl/lwjgl/3.2.1/lwjgl-3.2.1.jar"
 */
export function mavenToPath(name: string): string {
  const parts = name.split(':')
  if (parts.length < 3) return name

  const [group, artifact, version, ...extra] = parts
  const groupPath = group.replace(/\./g, '/')

  let classifier = ''
  let extension = 'jar'

  if (extra.length > 0) {
    // Format could be group:artifact:version:classifier or group:artifact:version:classifier@ext
    const lastPart = extra[extra.length - 1]
    if (lastPart.includes('@')) {
      const [cls, ext] = lastPart.split('@')
      classifier = cls ? `-${cls}` : ''
      extension = ext || 'jar'
    } else {
      classifier = `-${extra.join('-')}`
    }
  }

  return `${groupPath}/${artifact}/${version}/${artifact}-${version}${classifier}.${extension}`
}

/**
 * Evaluate Mojang's rules system to determine if a library/argument applies to the current OS.
 */
export function evaluateRules(rules: Rule[] | undefined): boolean {
  if (!rules || rules.length === 0) return true

  let dominated = false
  let allowed = false

  for (const rule of rules) {
    const matches = ruleMatchesCurrentOS(rule)

    if (rule.action === 'allow') {
      if (matches) allowed = true
      dominated = true
    } else if (rule.action === 'disallow') {
      if (matches) return false
      dominated = true
    }
  }

  // If we had only 'allow' rules and none matched, it's disallowed
  if (dominated && !allowed) {
    // Check if there was at least one 'allow' rule with OS filter
    const hasAllowWithOs = rules.some((r) => r.action === 'allow' && r.os)
    if (hasAllowWithOs) return false
  }

  return true
}

function ruleMatchesCurrentOS(rule: Rule): boolean {
  if (rule.features) {
    // Feature rules (e.g., has_custom_resolution) — default to false for features we don't support
    return false
  }

  if (!rule.os) return true

  const platform = getCurrentPlatform()
  const arch = getCurrentArch()

  if (rule.os.name && rule.os.name !== platform) return false
  if (rule.os.arch && rule.os.arch !== arch) return false
  if (rule.os.version) {
    const osVersion = process.platform === 'win32' ? require('os').release() : ''
    if (!new RegExp(rule.os.version).test(osVersion)) return false
  }

  return true
}

/**
 * Compute SHA1 hash of a buffer.
 */
export function sha1(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex')
}

/**
 * Format bytes into human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Format seconds into human-readable duration.
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * Format ETA in seconds to human-readable.
 */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--'
  return formatDuration(seconds)
}

/**
 * Sanitize an instance name for use as a directory name.
 */
export function sanitizeInstanceName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 64)
}

/**
 * Get the required Java major version for a given Minecraft version string.
 */
export function getRequiredJavaVersion(mcVersion: string): number {
  const match = mcVersion.match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) return 8

  const major = parseInt(match[1])
  const minor = parseInt(match[2])
  const patch = match[3] ? parseInt(match[3]) : 0

  if (major === 1) {
    if (minor >= 21 && patch >= 2) return 22
    if (minor >= 21) return 21
    if (minor >= 17) return 17
    return 8
  }

  if (major >= 26) return 25
  if (major >= 21) return 22
  if (major >= 17) return 17

  return 8
}

/**
 * Compare Minecraft version strings for sorting (newer first).
 */
export function compareVersions(a: string, b: string): number {
  const parseVer = (v: string) => {
    const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
    if (!m) return [0, 0, 0]
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3] || '0')]
  }

  const va = parseVer(a)
  const vb = parseVer(b)

  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return vb[i] - va[i]
  }
  return 0
}

/**
 * Sleep utility for async operations.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Generate a simple unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Safely parse JSON with a fallback.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/**
 * Get the classpath separator for the current platform.
 */
export function getClasspathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':'
}
