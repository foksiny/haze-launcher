import { useState, useEffect } from 'react'
import SkinViewer3D from '../components/SkinViewer3D'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [activeId, setActiveId] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const loadAccounts = async () => {
    try {
      const data = await window.api.getAccounts()
      setAccounts(data.accounts)
      setActiveId(data.activeAccount?.id || '')
    } catch (e) { console.error(e) }
  }

  useEffect(() => { loadAccounts() }, [])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Manage your Minecraft accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} id="add-account-btn">+ Add Account</button>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👤</div>
          <h3 className="empty-state-title">No accounts</h3>
          <p className="empty-state-text">Add an offline account to start playing.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Add Account</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {accounts.map(acc => {
            const skinUrl = acc.skinUrl || `https://crafatar.com/skins/${acc.uuid}`
            return (
              <div key={acc.id} className="card" style={{ display: 'flex', flexDirection: 'column', padding: '16px 20px', position: 'relative' }}>
                
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <SkinViewer3D skinUrl={skinUrl} model={acc.skinModel === 'slim' ? 'slim' : 'default'} width={120} height={200} />
                </div>

                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>{acc.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {acc.type === 'elyby' ? 'Ely.by Account' : 'Offline Account'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
                  {activeId === acc.id ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => { window.api.setActiveAccount(acc.id); setActiveId(acc.id) }}>Set Active</button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(acc.id)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateAccountModal onClose={() => { setShowCreate(false); loadAccounts() }} />}
    </div>
  )

  async function handleDelete(id: string) {
    if (confirm('Delete this account?')) { await window.api.deleteAccount(id); loadAccounts() }
  }
}

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'offline' | 'elyby'>('offline')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!username) return
    setCreating(true); setError('')
    try {
      await window.api.createAccount({ type, username, password: type === 'elyby' ? password : undefined })
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to create account')
    }
    setCreating(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Account</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="tabs">
            <button className={`tab ${type === 'offline' ? 'active' : ''}`} onClick={() => setType('offline')}>Offline</button>
            <button className={`tab ${type === 'elyby' ? 'active' : ''}`} onClick={() => setType('elyby')}>Ely.by</button>
          </div>
          <div className="input-group">
            <label className="input-label">{type === 'elyby' ? 'Email / Username' : 'Username'}</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder={type === 'elyby' ? 'your@email.com' : 'Steve'} id="account-username" autoFocus />
          </div>
          {type === 'elyby' && (
            <div className="input-group">
              <label className="input-label">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your Ely.by password" />
            </div>
          )}
          {type === 'offline' && (
            <div style={{ padding: 12, background: 'rgba(96,165,250,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--info)' }}>
              Offline accounts use a deterministic UUID based on your username. Skin will be Steve or Alex based on UUID.
            </div>
          )}
          {type === 'elyby' && (
            <div style={{ padding: 12, background: 'rgba(124,92,255,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--accent)' }}>
              Ely.by accounts allow custom skins visible to other players on compatible servers. Create an account at <a href="#" onClick={() => window.api.openExternal('https://ely.by')} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>ely.by</a>.
            </div>
          )}
          {error && <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !username} id="create-account-submit">
            {creating ? 'Creating...' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
