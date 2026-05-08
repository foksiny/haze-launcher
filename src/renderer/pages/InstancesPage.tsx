import { useState, useEffect } from 'react'

const statusLabels: Record<string, string> = {
  preparing: 'Preparing',
  downloading: 'Downloading',
  launching: 'Launching',
  running: 'Playing',
  crashed: 'Crashed',
  stopped: '',
}

const statusColors: Record<string, string> = {
  preparing: '#7c5cff',
  downloading: '#7c5cff',
  launching: '#7c5cff',
  running: '#4ade80',
  crashed: '#ef4444',
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingInstance, setEditingInstance] = useState<any>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null)
  const [progress, setProgress] = useState<Record<string, any>>({})
  const [crashLog, setCrashLog] = useState<{ id: string, log: string[] } | null>(null)
  const [gameStates, setGameStates] = useState<Record<string, string>>({})

  const loadInstances = () => {
    window.api.getInstances().then((i: any) => setInstances(i))
  }

  useEffect(() => {
    loadInstances()

    const unsubProgress = window.api.onDownloadProgress((prog: any) => {
      setProgress(prev => ({ ...prev, [prog.instanceId || 'global']: prog }))
    })

    const unsubState = window.api.onGameStateChanged((state: any) => {
      setGameStates(prev => ({ ...prev, [state.instanceId]: state.status }))
      if (state.status === 'crashed') {
        setCrashLog({ id: state.instanceId, log: state.log || [] })
      }
      loadInstances()
    })

    const handleWindowClick = () => setContextMenu(null)
    window.addEventListener('click', handleWindowClick)

    return () => {
      unsubProgress()
      unsubState()
      window.removeEventListener('click', handleWindowClick)
    }
  }, [])

  const handleImportHaze = async () => {
    const imported = await window.api.importHyperInstance()
    if (imported) loadInstances()
  }

  const handleExportHaze = async (id: string) => {
    await window.api.exportHyperInstance(id)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Instances</h1>
          <p className="page-subtitle">Manage and launch your Minecraft versions</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleImportHaze}>Import .haze</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Instance</button>
        </div>
      </div>

      <div className="instance-grid">
        {instances.map((instance: any) => {
          const prog = progress[instance.id]
          const isDownloading = prog && prog.downloadedBytes < prog.totalBytes
          const gameStatus = gameStates[instance.id]
          const statusLabel = gameStatus ? statusLabels[gameStatus] : ''

          return (
            <div 
              key={instance.id} 
              className="instance-card"
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, id: instance.id })
              }}
              onClick={() => handleLaunch(instance.id)}
            >
              {gameStatus && statusLabel && (
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, padding: '4px 8px', borderRadius: 4, background: statusColors[gameStatus] || '#666', color: '#fff', fontSize: 11, fontWeight: 500 }}>
                  {statusLabel}
                </div>
              )}
              {isDownloading && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 14px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 10 }}>
                  <div style={{ fontSize: 11, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Downloading...</span>
                    <span>{Math.round((prog.downloadedBytes / prog.totalBytes) * 100) || 0}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${(prog.downloadedBytes / prog.totalBytes) * 100 || 0}%` }} />
                  </div>
                </div>
              )}
              <div className="instance-card-banner">
                {instance.icon === 'default' ? '🧱' : instance.icon}
              </div>
              <div className="instance-card-body">
                <div className="instance-card-name">{instance.name}</div>
                <div className="instance-card-meta">
                  <span className="instance-card-badge">{instance.minecraftVersion}</span>
                  <span style={{ opacity: 0.6 }}>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {getModloaderIcon(instance.modloader)}
                    {instance.modloader}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="context-menu-item" onClick={() => handleLaunch(contextMenu.id)}>▶ Play</div>
          <div className="context-menu-item" onClick={() => setEditingInstance(instances.find(i => i.id === contextMenu.id))}>⚙ Edit Settings</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => window.api.openInstanceFolder(contextMenu.id)}>📁 Open Instance Folder</div>
          <div className="context-menu-item" onClick={() => window.api.openInstanceConfig(contextMenu.id)}>🛠 Open Config Folder</div>
          <div className="context-menu-item" onClick={() => handleDuplicate(contextMenu.id)}>📋 Duplicate</div>
          <div className="context-menu-item" onClick={() => handleExportHaze(contextMenu.id)}>📤 Export as .haze</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item danger" onClick={() => handleDelete(contextMenu.id)}>🗑 Delete</div>
        </div>
      )}

      {showCreate && <CreateInstanceModal onClose={() => { setShowCreate(false); loadInstances() }} />}
      
      {editingInstance && (
        <EditInstanceModal 
          instance={editingInstance} 
          onClose={() => { setEditingInstance(null); loadInstances() }} 
        />
      )}
      
      {crashLog && (
        <div className="modal-overlay" onClick={() => setCrashLog(null)}>
          <div className="modal" style={{ maxWidth: 800, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title" style={{ color: 'var(--error)' }}>Instance Crashed</h2>
            <p className="page-subtitle" style={{ marginBottom: 16 }}>The game exited unexpectedly. Here is the console output:</p>
            <div style={{ flex: 1, overflowY: 'auto', background: '#000', borderRadius: 6, padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#e0e0e0', whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>
              {crashLog.log.slice(-100).join('\n')}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => {
                navigator.clipboard.writeText(crashLog.log.join('\n'))
              }}>📋 Copy Error</button>
              <button className="btn btn-secondary" onClick={() => setCrashLog(null)}>Close Console</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  async function handleLaunch(id: string) {
    try { 
      await window.api.launchInstance(id) 
    } catch (e: any) { 
      console.error(e)
      alert(`Launch failed: ${e.message}`) 
    }
  }
  async function handleDuplicate(id: string) {
    const name = prompt('New instance name:')
    if (name) { await window.api.duplicateInstance(id, name); loadInstances() }
  }
  async function handleDelete(id: string) {
    if (confirm('Delete this instance? This cannot be undone.')) {
      await window.api.deleteInstance(id); loadInstances()
    }
  }
}

function getModloaderIcon(loader: string) {
  switch (loader.toLowerCase()) {
    case 'fabric': return <span style={{ color: '#dbd3b2' }}>🧵</span>
    case 'quilt': return <span style={{ color: '#f8b4d9' }}>🧶</span>
    case 'forge': return <span style={{ color: '#e0833a' }}>🔥</span>
    case 'neoforge': return <span style={{ color: '#fe3444' }}>🔴</span>
    case 'liteloader': return <span style={{ color: '#fcf8b3' }}>🐔</span>
    default: return <span style={{ opacity: 0.5 }}>🧱</span>
  }
}

function CreateInstanceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [versions, setVersions] = useState<any[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [modloader, setModloader] = useState('vanilla')
  const [modloaderVersions, setModloaderVersions] = useState<any[]>([])
  const [selectedLoaderVer, setSelectedLoaderVer] = useState('')
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [versionSearch, setVersionSearch] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    window.api.getVersionManifest({
      showReleases: true, showSnapshots, showBeta: false, showAlpha: false,
      showAprilFools: false, search: versionSearch,
    }).then((v: any) => {
      setVersions(v)
      if (!selectedVersion && v.length > 0) setSelectedVersion(v[0].id)
    }).catch(console.error)
  }, [showSnapshots, versionSearch])

  useEffect(() => {
    if (modloader !== 'vanilla' && selectedVersion) {
      window.api.getModloaderVersions(modloader, selectedVersion).then((v: any) => {
        setModloaderVersions(v)
        if (v.length > 0) setSelectedLoaderVer(v[0].version)
      }).catch(console.error)
    }
  }, [modloader, selectedVersion])

  const handleCreate = async () => {
    if (!name || !selectedVersion) return
    setCreating(true)
    try {
      await window.api.createInstance({
        name, minecraftVersion: selectedVersion,
        modloader: modloader as any,
        modloaderVersion: modloader !== 'vanilla' ? selectedLoaderVer : '',
      })
      onClose()
    } catch (e) { console.error(e) }
    setCreating(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">New Instance</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Instance Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="My Instance" id="instance-name-input" autoFocus />
          </div>
          
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">MC Version</label>
              <div className="search-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
                <input className="input-search" style={{ borderRadius: 6, paddingLeft: 32 }} placeholder="Search..." value={versionSearch} onChange={e => setVersionSearch(e.target.value)} />
              </div>
              <select className="input" style={{ marginTop: 8 }} value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}>
                {versions.map(v => <option key={v.id} value={v.id}>{v.id} ({v.type})</option>)}
              </select>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={showSnapshots} onChange={e => setShowSnapshots(e.target.checked)} />
                <label>Show Snapshots</label>
              </div>
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Modloader</label>
              <select className="input" value={modloader} onChange={e => setModloader(e.target.value)}>
                <option value="vanilla">Vanilla</option>
                <option value="fabric">Fabric</option>
                <option value="forge">Forge</option>
                <option value="neoforge">NeoForge</option>
                <option value="quilt">Quilt</option>
                <option value="liteloader">LiteLoader</option>
              </select>
              {modloader !== 'vanilla' && (
                <select className="input" style={{ marginTop: 8 }} value={selectedLoaderVer} onChange={e => setSelectedLoaderVer(e.target.value)}>
                  {modloaderVersions.map(v => <option key={v.version} value={v.version}>{v.version}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!name || creating}>
            {creating ? 'Creating...' : 'Create Instance'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditInstanceModal({ instance, onClose }: { instance: any, onClose: () => void }) {
  const [name, setName] = useState(instance.name)
  const [maxRam, setMaxRam] = useState(instance.settings.maxRam)
  const [jvmArgs, setJvmArgs] = useState(instance.settings.jvmArgs)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.updateInstanceMetadata(instance.id, {
        name,
        settings: { ...instance.settings, maxRam, jvmArgs }
      })
      onClose()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Edit Instance: {instance.name}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Instance Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Max RAM (MB)</label>
            <input className="input" type="number" value={maxRam} onChange={e => setMaxRam(Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="input-label">JVM Arguments</label>
            <textarea className="input" style={{ height: 80 }} value={jvmArgs} onChange={e => setJvmArgs(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
