// Extend Window interface for preload API
import type { HazeAPI } from '../preload/index'

declare global {
  interface Window {
    api: HazeAPI
  }
}
