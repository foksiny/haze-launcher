// ============================================================
// Haze Launcher — Logger
// Structured logging with file rotation
// ============================================================

import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync, WriteStream } from 'fs'
import { join } from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
}

const RESET = '\x1b[0m'
const MAX_LOG_FILES = 10

class Logger {
  private logDir: string = ''
  private stream: WriteStream | null = null
  private level: LogLevel = 'info'
  private initialized = false

  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  initialize(dataDir: string, level: LogLevel = 'info'): void {
    this.logDir = join(dataDir, 'logs')
    this.level = level

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }

    this.rotateLogFiles()

    const date = new Date().toISOString().split('T')[0]
    const logFile = join(this.logDir, `launcher-${date}.log`)
    this.stream = createWriteStream(logFile, { flags: 'a' })
    this.initialized = true

    this.info('Logger', `Logging initialized at ${logFile}`)
  }

  private rotateLogFiles(): void {
    try {
      const files = readdirSync(this.logDir)
        .filter((f) => f.startsWith('launcher-') && f.endsWith('.log'))
        .sort()
        .reverse()

      while (files.length >= MAX_LOG_FILES) {
        const old = files.pop()
        if (old) {
          try {
            unlinkSync(join(this.logDir, old))
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    if (this.levels[level] < this.levels[this.level]) return

    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${context}]`
    const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : ''
    const line = `${prefix} ${message}${dataStr}`

    // Console output with colors
    const color = LOG_COLORS[level]
    console.log(`${color}${prefix}${RESET} ${message}${dataStr}`)

    // File output without colors
    if (this.stream) {
      this.stream.write(line + '\n')
    }
  }

  debug(context: string, message: string, data?: unknown): void {
    this.log('debug', context, message, data)
  }

  info(context: string, message: string, data?: unknown): void {
    this.log('info', context, message, data)
  }

  warn(context: string, message: string, data?: unknown): void {
    this.log('warn', context, message, data)
  }

  error(context: string, message: string, data?: unknown): void {
    this.log('error', context, message, data)
  }

  close(): void {
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
  }
}

// Singleton
export const logger = new Logger()
