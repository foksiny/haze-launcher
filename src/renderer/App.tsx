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

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('home')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

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
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        <TitleBar />
        {renderPage()}
        <StatusBar />
      </main>
    </div>
  )
}
