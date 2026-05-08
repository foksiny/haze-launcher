import { useState, useEffect } from 'react'
import type { PageId } from '../App'

interface HomePageProps {
  onNavigate: (page: PageId) => void
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const [instances, setInstances] = useState<any[]>([])
  const [activeAccount, setActiveAccount] = useState<any>(null)

  useEffect(() => {
    window.api.getInstances().then(setInstances).catch(console.error)
    window.api.getAccounts().then((data: any) => setActiveAccount(data.activeAccount)).catch(console.error)
  }, [])

  const recentInstances = instances.slice(0, 4)

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome to Haze</h1>
          <p className="page-subtitle">
            {activeAccount ? `Playing as ${activeAccount.username}` : 'Create an account to get started'}
          </p>
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
