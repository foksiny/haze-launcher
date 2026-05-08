import { useState, useEffect } from 'react'
import type { PageId } from '../App'

interface HomePageProps {
  onNavigate: (page: PageId) => void
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const [instances, setInstances] = useState<any[]>([])
  const [activeAccount, setActiveAccount] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [javaDownload, setJavaDownload] = useState<{version: number, progress: number} | null>(null)

  useEffect(() => {
    window.api.getInstances().then(setInstances).catch(console.error)
    window.api.getAccounts().then((data: any) => {
      setActiveAccount(data.activeAccount)
      setAccounts(data.accounts || [])
    }).catch(console.error)
  }, [])

  useEffect(() => {
    const unsub = window.api.onJavaDownloadProgress((progress: any) => {
      const pct = progress.totalBytes > 0 ? (progress.downloadedBytes / progress.totalBytes) * 100 : 0
      setJavaDownload({ version: progress.version, progress: pct })
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!showAccountDropdown) return
    const handleClick = () => setShowAccountDropdown(false)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [showAccountDropdown])

  const recentInstances = instances.slice(0, 4)

  return (
    <div className="page-container">
      {javaDownload && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', background: 'var(--bg-secondary)',
          borderRadius: 8, border: '1px solid var(--accent)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
              ⬇ Downloading Java {javaDownload.version}...
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {javaDownload.progress.toFixed(1)}%
            </span>
          </div>
          <div style={{
            height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', width: `${javaDownload.progress}%`,
              background: 'var(--accent)', transition: 'width 0.3s'
            }} />
          </div>
        </div>
      )}
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome to Haze</h1>
          <p className="page-subtitle">
            {activeAccount ? `Playing as ${activeAccount.username}` : 'Create an account to get started'}
          </p>
        </div>
        <div style={{ position: 'relative' }}>
          <button 
            className="btn btn-secondary"
            onClick={(e) => { e.stopPropagation(); setShowAccountDropdown(!showAccountDropdown) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>👤</span>
            <span>{activeAccount?.username || 'Select Account'}</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </button>
          {showAccountDropdown && (
            <div className="dropdown-menu" onClick={(e) => e.stopPropagation()} style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8, minWidth: 200, zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {accounts.length === 0 ? (
                <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
                  No accounts yet
                </div>
              ) : (
                accounts.map((acc: any) => (
                  <div
                    key={acc.id}
                    className="dropdown-item"
                    onClick={async () => {
                      await window.api.setActiveAccount(acc.id)
                      setActiveAccount(acc)
                      setShowAccountDropdown(false)
                    }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderRadius: 4,
                      background: activeAccount?.id === acc.id ? 'var(--accent)' : 'transparent',
                      color: activeAccount?.id === acc.id ? '#fff' : 'var(--text)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <span>{acc.username}</span>
                    {activeAccount?.id === acc.id && <span>✓</span>}
                  </div>
                ))
              )}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div
                className="dropdown-item"
                onClick={() => { setShowAccountDropdown(false); onNavigate('accounts') }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderRadius: 4,
                  color: 'var(--accent)', fontSize: 13
                }}
              >
                + Add Account
              </div>
            </div>
          )}
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎮</div>
          <h3 className="empty-state-title">No instances yet</h3>
          <p className="empty-state-text">
            Create your first Minecraft instance to start playing. Choose any version, add mods, and customize your experience.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => onNavigate('instances')} id="create-first-instance">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Instance
          </button>
        </div>
      ) : (
        <>
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Recent Instances</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('instances')}>View All</button>
            </div>
            <div className="instance-grid">
              {recentInstances.map((inst) => (
                <div key={inst.id} className="instance-card" onClick={() => handleLaunch(inst.id)}>
                  <div className="instance-card-banner">⛏️</div>
                  <div className="instance-card-body">
                    <div className="instance-card-name">{inst.name}</div>
                    <div className="instance-card-meta">
                      <span className="instance-card-badge">{inst.minecraftVersion}</span>
                      {inst.modloader !== 'vanilla' && (
                        <span className="instance-card-badge">{inst.modloader}</span>
                      )}
                    </div>
                  </div>
                  <div className="instance-card-actions">
                    <button className="btn btn-play btn-sm" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); handleLaunch(inst.id) }}>
                      ▶ Play
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Quick Actions</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => onNavigate('instances')}>
                📦 New Instance
              </button>
              <button className="btn btn-secondary" onClick={() => onNavigate('mods')}>
                🧩 Browse Mods
              </button>
              <button className="btn btn-secondary" onClick={() => onNavigate('accounts')}>
                👤 Manage Accounts
              </button>
              <button className="btn btn-secondary" onClick={() => onNavigate('settings')}>
                ⚙️ Settings
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )

  async function handleLaunch(instanceId: string) {
    if (!activeAccount) {
      onNavigate('accounts')
      return
    }
    try {
      await window.api.launchInstance(instanceId)
    } catch (err) {
      console.error('Launch failed:', err)
    }
  }
}
