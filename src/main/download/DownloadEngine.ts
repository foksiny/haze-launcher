// ============================================================
// Haze Launcher — Download Engine
// Parallel downloads with retry, resume, hash verification
// ============================================================

import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { readFile } from 'fs/promises'
import { dirname } from 'path'
import { createHash } from 'crypto'
import https from 'https'
import http from 'http'
import { EventEmitter } from 'events'
import { logger } from '../logging/Logger'
import { MAX_DOWNLOAD_RETRIES, DOWNLOAD_RETRY_DELAY, APP_USER_AGENT } from '../../shared/constants'
import { sleep } from '../../shared/utils'

export interface DownloadItem {
  url: string
  path: string
  sha1?: string
  size?: number
}

export interface DownloadBatchProgress {
  totalFiles: number
  completedFiles: number
  failedFiles: number
  totalBytes: number
  downloadedBytes: number
  speed: number
  currentFile: string
  eta: number
}

export class DownloadEngine extends EventEmitter {
  private concurrency: number
  private speedLimit: number // bytes/sec, 0 = unlimited
  private aborted = false

  constructor(concurrency: number = 8, speedLimit: number = 0) {
    super()
    this.concurrency = concurrency
    this.speedLimit = speedLimit
  }

  /**
   * Download a batch of files in parallel.
   * Emits 'progress' events with DownloadBatchProgress.
   * Returns list of failed items.
   */
  async downloadBatch(items: DownloadItem[]): Promise<DownloadItem[]> {
    this.aborted = false

    // Filter out already-downloaded files with valid hashes
    const toDownload: DownloadItem[] = []
    for (const item of items) {
      if (await this.isAlreadyDownloaded(item)) {
        // Already exists and hash matches
        continue
      }
      toDownload.push(item)
    }

    if (toDownload.length === 0) {
      this.emit('progress', {
        totalFiles: items.length,
        completedFiles: items.length,
        failedFiles: 0,
        totalBytes: 0,
        downloadedBytes: 0,
        speed: 0,
        currentFile: '',
        eta: 0,
      } satisfies DownloadBatchProgress)
      return []
    }

    const totalBytes = toDownload.reduce((sum, item) => sum + (item.size || 0), 0)
    let downloadedBytes = 0
    let completedFiles = items.length - toDownload.length
    let failedFiles = 0
    const startTime = Date.now()
    const failed: DownloadItem[] = []
    let currentFile = ''

    const emitProgress = () => {
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0 ? downloadedBytes / elapsed : 0
      const remaining = totalBytes - downloadedBytes
      const eta = speed > 0 ? remaining / speed : 0

      this.emit('progress', {
        totalFiles: items.length,
        completedFiles,
        failedFiles,
        totalBytes,
        downloadedBytes,
        speed,
        currentFile,
        eta,
      } satisfies DownloadBatchProgress)
    }

    // Process items in parallel with concurrency limit
    const queue = [...toDownload]
    const workers: Promise<void>[] = []

    for (let i = 0; i < Math.min(this.concurrency, queue.length); i++) {
      workers.push(
        (async () => {
          while (queue.length > 0 && !this.aborted) {
            const item = queue.shift()
            if (!item) break

            currentFile = item.url.split('/').pop() || item.url

            let success = false
            for (let attempt = 0; attempt < MAX_DOWNLOAD_RETRIES; attempt++) {
              try {
                const bytesDownloaded = await this.downloadFile(
                  item,
                  (bytes) => {
                    downloadedBytes += bytes
                    emitProgress()
                  }
                )
                success = true
                break
              } catch (err) {
                logger.warn(
                  'DownloadEngine',
                  `Download failed (attempt ${attempt + 1}/${MAX_DOWNLOAD_RETRIES}): ${item.url}`,
                  err instanceof Error ? err.message : err
                )
                if (attempt < MAX_DOWNLOAD_RETRIES - 1) {
                  await sleep(DOWNLOAD_RETRY_DELAY * Math.pow(2, attempt))
                }
              }
            }

            if (success) {
              completedFiles++
            } else {
              failedFiles++
              failed.push(item)
              logger.error('DownloadEngine', `Failed to download after ${MAX_DOWNLOAD_RETRIES} attempts: ${item.url}`)
            }

            emitProgress()
          }
        })()
      )
    }

    await Promise.all(workers)
    emitProgress()

    return failed
  }

  /**
   * Download a single file with progress callback.
   */
  private downloadFile(item: DownloadItem, onProgress: (byteDelta: number) => void): Promise<number> {
    return new Promise((resolve, reject) => {
      // Ensure directory exists
      const dir = dirname(item.path)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const protocol = item.url.startsWith('https') ? https : http
      const request = protocol.get(
        item.url,
        {
          headers: {
            'User-Agent': APP_USER_AGENT,
          },
          timeout: 30000,
        },
        (response) => {
          // Handle redirects
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            const redirectItem = { ...item, url: response.headers.location }
            this.downloadFile(redirectItem, onProgress).then(resolve).catch(reject)
            return
          }

          if (response.statusCode && response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${item.url}`))
            return
          }

          const fileStream = createWriteStream(item.path)
          let bytesWritten = 0
          const hash = item.sha1 ? createHash('sha1') : null

          response.on('data', (chunk: Buffer) => {
            if (this.aborted) {
              response.destroy()
              fileStream.close()
              return
            }
            bytesWritten += chunk.length
            if (hash) hash.update(chunk)
            onProgress(chunk.length)
          })

          response.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()

            // Verify SHA1 if provided
            if (hash && item.sha1) {
              const computed = hash.digest('hex')
              if (computed !== item.sha1) {
                // Delete corrupted file
                try { unlinkSync(item.path) } catch { /* ignore */ }
                reject(new Error(`SHA1 mismatch for ${item.url}: expected ${item.sha1}, got ${computed}`))
                return
              }
            }

            resolve(bytesWritten)
          })

          fileStream.on('error', (err) => {
            try { unlinkSync(item.path) } catch { /* ignore */ }
            reject(err)
          })
        }
      )

      request.on('error', reject)
      request.on('timeout', () => {
        request.destroy()
        reject(new Error(`Timeout downloading ${item.url}`))
      })
    })
  }

  /**
   * Check if a file already exists and has the correct hash.
   */
  private async isAlreadyDownloaded(item: DownloadItem): Promise<boolean> {
    if (!existsSync(item.path)) return false

    // If size is specified, check it
    if (item.size) {
      try {
        const stat = statSync(item.path)
        if (stat.size !== item.size) return false
      } catch {
        return false
      }
    }

    // If SHA1 is specified, verify it
    if (item.sha1) {
      try {
        const data = await readFile(item.path)
        const hash = createHash('sha1').update(data).digest('hex')
        return hash === item.sha1
      } catch {
        return false
      }
    }

    // File exists but no verification criteria — assume good
    return true
  }

  /**
   * Download a single file (convenience method).
   */
  async downloadSingle(url: string, path: string, sha1?: string): Promise<void> {
    const failed = await this.downloadBatch([{ url, path, sha1 }])
    if (failed.length > 0) {
      throw new Error(`Failed to download: ${url}`)
    }
  }

  /**
   * Abort all pending downloads.
   */
  abort(): void {
    this.aborted = true
  }
}
