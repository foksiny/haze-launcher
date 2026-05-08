// ============================================================
// Haze Launcher — Process Monitor
// Uses pidusage to track CPU and RAM of running instances
// ============================================================

import pidusage from 'pidusage'
import { logger } from '../logging/Logger'

export interface ProcessStats {
  pid: number
  cpu: number
  memory: number
  elapsed: number
}

export class ProcessMonitor {
  private updateInterval: NodeJS.Timeout | null = null
  private onUpdate: (stats: Record<string, ProcessStats>) => void
  private getRunningPids: () => Record<string, number>

  constructor(
    getRunningPids: () => Record<string, number>,
    onUpdate: (stats: Record<string, ProcessStats>) => void
  ) {
    this.getRunningPids = getRunningPids
    this.onUpdate = onUpdate
  }

  start(intervalMs = 2000): void {
    if (this.updateInterval) return

    this.updateInterval = setInterval(async () => {
      const pids = this.getRunningPids()
      if (Object.keys(pids).length === 0) return

      const stats: Record<string, ProcessStats> = {}

      for (const [instanceId, pid] of Object.entries(pids)) {
        try {
          const stat = await pidusage(pid)
          stats[instanceId] = {
            pid,
            cpu: stat.cpu,
            memory: stat.memory, // in bytes
            elapsed: stat.elapsed, // in ms
          }
        } catch (err) {
          // Process might have died, ignore
        }
      }

      if (Object.keys(stats).length > 0) {
        this.onUpdate(stats)
      }
    }, intervalMs)
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    pidusage.clear()
  }
}
