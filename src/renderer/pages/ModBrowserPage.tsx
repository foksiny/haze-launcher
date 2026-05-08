import { useState, useEffect, useCallback } from 'react'

export default function ModBrowserPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [instances, setInstances] = useState<any[]>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [installedMods, setInstalledMods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [loader, setLoader] = useState('fabric')
  const [mcVersion, setMcVersion] = useState('1.21.4')
  const [projectType, setProjectType] = useState<'mod' | 'resourcepack'>('mod')
  const [searchSource, setSearchSource] = useState<'both' | 'modrinth' | 'curseforge'>('both')
  const [installingStatus, setInstallingStatus] = useState<Record<string, boolean>>({})
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')

  const loadInstalled = useCallback(async (instanceId: string) => {
    if (!instanceId) return
    const mods = await window.api.getInstanceMods(instanceId)
    setInstalledMods(mods)
  }, [])

  useEffect(() => {
    window.api.getInstances().then((i: any) => {
      setInstances(i)
      if (i.length > 0) {
        const first = i[0]
        setSelectedInstance(first.id)
        setMcVersion(first.minecraftVersion)
        setLoader(first.modloader)
        loadInstalled(first.id)
      }
    })
  }, [loadInstalled])

  useEffect(() => {
    if (selectedInstance && tab === 'installed') {
      loadInstalled(selectedInstance)
    }
  }, [selectedInstance, tab, loadInstalled])

  const handleSearch = async () => {
    if (!query) return
    setLoading(true)
    try {
      const mods = await window.api.searchMods({
        query, mcVersion, loader, projectType, source: searchSource, sortBy: 'relevance', limit: 20
      })
      setResults(mods)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleInstall = async (mod: any) => {
    if (!selectedInstance) return
    setInstallingStatus(prev => ({ ...prev, [mod.id]: true }))
    try {
      const versions = await window.api.getModVersions(mod.id, mod.source)
      const v = versions.find((v: any) => v.gameVersions.includes(mcVersion)) || versions[0]
      if (v) {
        await window.api.installMod(v, selectedInstance, mod.projectType)
        loadInstalled(selectedInstance)
      }
    } catch (e) { console.error(e) }
    setInstallingStatus(prev => ({ ...prev, [mod.id]: false }))
  }

  const handleToggle = async (modId: string) => {
    await window.api.toggleMod(selectedInstance, modId)
    loadInstalled(selectedInstance)
  }

  const handleDelete = async (modId: string) => {
    if (confirm('Are you sure you want to delete this mod?')) {
      await window.api.uninstallMod(selectedInstance, modId)
      loadInstalled(selectedInstance)
    }
  }

  const handleExportList = async () => {
    const text = await window.api.exportModList(selectedInstance)
    if (!text) return alert('No mods installed to export!')
    await window.api.copyToClipboard(text)
    alert('Mod list copied to clipboard!')
  }

  const handleImportList = async () => {
    setLoading(true)
    setShowImportModal(false)
    try {
      await window.api.importModList(selectedInstance, importText, mcVersion, loader)
      loadInstalled(selectedInstance)
      alert('Mod list imported successfully!')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const isInstalled = (modSourceId: string) => {
    return installedMods.some(m => m.sourceId === modSourceId)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Content Manager</h1>
          <p className="page-subtitle">Manage mods & resource packs for <strong>{instances.find(i => i.id === selectedInstance)?.name || '...'}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={selectedInstance} onChange={e => {
            const inst = instances.find(i => i.id === e.target.value)
            if (inst) {
              setSelectedInstance(inst.id)
              setMcVersion(inst.minecraftVersion)
              setLoader(inst.modloader)
              loadInstalled(inst.id)
            }
          }} style={{ width: 180 }}>
            {instances.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse</button>
        <button className={`tab ${tab === 'installed' ? 'active' : ''}`} onClick={() => setTab('installed')}>
          Installed ({installedMods.length})
        </button>
      </div>

      {tab === 'browse' ? (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="search-wrapper" style={{ flex: 1 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
              <input className="input-search" placeholder="Search content..."
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            </div>
            <select className="input" style={{ width: 140 }} value={projectType} onChange={e => setProjectType(e.target.value as any)}>
              <option value="mod">Mods</option>
              <option value="resourcepack">Resource Packs</option>
            </select>
            <select className="input" style={{ width: 140 }} value={searchSource} onChange={e => setSearchSource(e.target.value as any)}>
              <option value="both">All Sources</option>
              <option value="modrinth">Modrinth</option>
              <option value="curseforge">CurseForge</option>
              <option value="tlauncher" disabled>TLauncher (No API)</option>
            </select>
            <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72 }} />)}
            {!loading && results.map((mod: any) => {
              const installed = isInstalled(mod.id)
              const installing = installingStatus[mod.id]
              return (
                <div key={`${mod.source}-${mod.id}`} className="mod-item">
                  <div className="mod-item-icon">
                    {mod.iconUrl && <img src={mod.iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div className="mod-item-details">
                    <div className="mod-item-name">
                      {mod.name} 
                      <span className="badge badge-accent">{mod.source}</span>
                      {installed && <span className="badge badge-success">Installed</span>}
                      {installing && <span className="badge badge-warning">Installing...</span>}
                    </div>
                    <div className="mod-item-desc">{mod.description}</div>
                  </div>
                  <div className="mod-item-actions">
                    {installed ? (
                      <button className="btn btn-secondary btn-sm" disabled>Installed</button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleInstall(mod)} disabled={installing}>
                        {installing ? 'Installing...' : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportList}>Export Mod List</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>Import Mod List</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {installedMods.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧩</div>
                <h3 className="empty-state-title">No content installed</h3>
                <p className="empty-state-text">Use the "Browse" tab to find mods and resource packs.</p>
              </div>
            ) : installedMods.map((mod: any) => (
              <div key={mod.id} className="mod-item" style={{ opacity: mod.enabled ? 1 : 0.6 }}>
                <div className="mod-item-icon">
                  {mod.iconUrl ? <img src={mod.iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧩'}
                </div>
                <div className="mod-item-details">
                  <div className="mod-item-name">
                    {mod.name}
                    {!mod.enabled && <span className="badge badge-error">Disabled</span>}
                  </div>
                  <div className="mod-item-desc">Version: {mod.version} | Source: {mod.source}</div>
                </div>
                <div className="mod-item-actions">
                  <button className={`btn btn-sm ${mod.enabled ? 'btn-secondary' : 'btn-success'}`} onClick={() => handleToggle(mod.id)}>
                    {mod.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(mod.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">Import Mod List</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Paste a mod list in the format: <code>Name | Version | Source</code> (one per line).
            </p>
            <textarea className="input" style={{ height: 200, fontFamily: 'monospace' }} 
              placeholder="Example: JEI | 12.0.0 | Modrinth"
              value={importText} onChange={e => setImportText(e.target.value)} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImportList} disabled={!importText.trim() || loading}>
                {loading ? 'Importing...' : 'Start Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
