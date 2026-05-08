import React from 'react'
import type { PageId } from '../App'

const icons: Record<PageId, React.ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  instances: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="9" height="9" rx="2"/><rect x="13" y="2" width="9" height="9" rx="2"/><rect x="2" y="13" width="9" height="9" rx="2"/><rect x="13" y="13" width="9" height="9" rx="2"/></svg>,
  accounts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  mods: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
}

const labels: Record<PageId, string> = {
  home: 'Home',
  instances: 'Instances',
  accounts: 'Accounts',
  mods: 'Mods',
  settings: 'Settings',
}

interface SidebarProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const topItems: PageId[] = ['home', 'instances', 'accounts', 'mods']

  return (
    <nav className="sidebar">
      {topItems.map((id) => (
        <button
          key={id}
          className={`sidebar-item ${activePage === id ? 'active' : ''}`}
          onClick={() => onNavigate(id)}
          data-tooltip={labels[id]}
          id={`nav-${id}`}
        >
          {icons[id]}
        </button>
      ))}
      <div className="sidebar-spacer" />
      <button
        className={`sidebar-item ${activePage === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
        data-tooltip="Settings"
        id="nav-settings"
      >
        {icons.settings}
      </button>
    </nav>
  )
}
