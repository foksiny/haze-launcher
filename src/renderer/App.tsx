import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import HomePage from './pages/HomePage'
import InstancesPage from './pages/InstancesPage'
import AccountsPage from './pages/AccountsPage'
import ModBrowserPage from './pages/ModBrowserPage'
import SettingsPage from './pages/SettingsPage'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'

export type PageId = 'home' | 'instances' | 'accounts' | 'mods' | 'settings'

interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('home')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((s: any) => {
      setTheme(s.theme || 'dark')
    })

    // Listen for setting changes
    const unsub = window.api.onSettingsUpdated((s: any) => {
      if (s.theme) setTheme(s.theme)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    // Listen for update notifications
    const unsubUpdate = window.api.onUpdateAvailable((info: UpdateInfo) => {
      setUpdateInfo(info)
      setShowUpdatePrompt(true)
    })

    // Also check on startup (delayed to not block UI)
    setTimeout(() => {
      window.api.checkForUpdates().then((info: UpdateInfo | null) => {
        if (info) {
          setUpdateInfo(info)
          setShowUpdatePrompt(true)
        }
      })
    }, 3000)

    return () => unsubUpdate()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const renderPage = () => {
    switch (activePage) {
      case 'home': return <HomePage onNavigate={setActivePage} />
      case 'instances': return <InstancesPage />
      case 'accounts': return <AccountsPage />
      case 'mods': return <ModBrowserPage />
      case 'settings': return <SettingsPage />
      default: return <HomePage onNavigate={setActivePage} />
    }
  }

  return (
    <div className="app-layout">
      {showUpdatePrompt && updateInfo && (
        <div className="update-banner" style={{
          position: 'fixed', top: 40, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, padding: '12px 20px', background: 'var(--accent)', color: '#fff',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <span>🎉 <strong>Update available:</strong> v{updateInfo.latestVersion} (you have v{updateInfo.currentVersion})</span>
          <button className="btn" style={{ background: '#fff', color: 'var(--accent)', padding: '4px 12px', fontSize: 12 }} 
            onClick={() => window.api.downloadUpdate().then(() => setShowUpdatePrompt(false))}>
            Update Now
          </button>
          <button style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}
            onClick={() => { setShowUpdatePrompt(false); window.api.skipUpdate(updateInfo.latestVersion) }}>
            ✕
          </button>
        </div>
      )}
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        <TitleBar />
        {renderPage()}
        <StatusBar />
      </main>
    </div>
  )
}
