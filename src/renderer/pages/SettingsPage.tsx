import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [javaInstalls, setJavaInstalls] = useState<any[]>([])
  const [sysInfo, setSysInfo] = useState<any>(null)
  const [tab, setTab] = useState('general')

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getJavaInstallations().then(setJavaInstalls)
    window.api.getSystemInfo().then(setSysInfo)
  }, [])

  const update = async (key: string, value: any) => {
    const updated = await window.api.updateSettings({ [key]: value })
    setSettings(updated)
  }

  if (!settings) return <div className="page-container"><div className="skeleton" style={{ height: 400 }} /></div>

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {['general','java','downloads','defaults'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card" style={{ padding: 24 }}>
          <div className="form-row">
            <div><div className="form-row-label">Theme</div><div className="form-row-desc">Choose launcher appearance</div></div>
            <select value={settings.theme} onChange={e => update('theme', e.target.value)} style={{ width: 140 }}>
              <option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option>
            </select>
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Launcher Behavior</div><div className="form-row-desc">When game starts</div></div>
            <select value={settings.launcherBehavior} onChange={e => update('launcherBehavior', e.target.value)} style={{ width: 160 }}>
              <option value="minimize">Minimize</option><option value="close">Close</option><option value="keep">Keep Open</option>
            </select>
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Discord Rich Presence</div></div>
            <div className={`toggle ${settings.discordRpcEnabled ? 'active' : ''}`} onClick={() => update('discordRpcEnabled', !settings.discordRpcEnabled)} />
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Launcher Theme</div><div className="form-row-desc">Switch between light and dark aesthetics</div></div>
            <select className="input" style={{ width: 120 }} value={settings.theme} onChange={e => update('theme', e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Use CurseForge API</div><div className="form-row-desc">Enable/disable CurseForge mod search</div></div>
            <div className={`toggle ${settings.useCurseForge ? 'active' : ''}`} onClick={() => update('useCurseForge', !settings.useCurseForge)} />
          </div>
          <div className="form-row">
            <div><div className="form-row-label">CurseForge API Key</div><div className="form-row-desc">Required for CurseForge mod search</div></div>
            <input className="input" style={{ width: 240 }} type="password" value={settings.curseforgeApiKey} onChange={e => update('curseforgeApiKey', e.target.value)} placeholder="Enter API key" />
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Data Directory</div><div className="form-row-desc">{settings.dataDirectory}</div></div>
            <button className="btn btn-secondary btn-sm" onClick={async () => { const r = await window.api.showOpenDialog({ properties: ['openDirectory'] }); if (!r.canceled && r.filePaths[0]) update('dataDirectory', r.filePaths[0]) }}>Change</button>
          </div>
        </div>
      )}

      {tab === 'java' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Java Installations</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={async () => setJavaInstalls(await window.api.detectJava())}>Detect</button>
              <button className="btn btn-primary btn-sm" onClick={() => window.api.downloadJava(21)}>Download Java 21</button>
            </div>
          </div>
          {javaInstalls.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No Java detected. Click "Detect" or download.</div>
          ) : javaInstalls.map((j: any) => (
            <div key={j.id} className="form-row">
              <div>
                <div className="form-row-label">Java {j.majorVersion} — {j.vendor}</div>
                <div className="form-row-desc">{j.path}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge badge-success">{j.arch}</span>
                {j.isManaged && <span className="badge badge-accent">Managed</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'downloads' && (
        <div className="card" style={{ padding: 24 }}>
          <div className="form-row">
            <div><div className="form-row-label">Concurrent Downloads</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={1} max={32} value={settings.downloadConcurrency} onChange={e => update('downloadConcurrency', Number(e.target.value))} style={{ width: 160 }} />
              <span style={{ fontSize: 14, fontWeight: 600, width: 30 }}>{settings.downloadConcurrency}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'defaults' && (
        <div className="card" style={{ padding: 24 }}>
          <div className="form-row">
            <div><div className="form-row-label">Default Max RAM</div><div className="form-row-desc">{sysInfo ? `System: ${sysInfo.totalRam} MB` : ''}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={512} max={sysInfo?.totalRam || 16384} step={256} value={settings.defaultMaxRam} onChange={e => update('defaultMaxRam', Number(e.target.value))} style={{ width: 200 }} />
              <span style={{ fontSize: 14, fontWeight: 600, width: 70 }}>{settings.defaultMaxRam} MB</span>
            </div>
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Default JVM Preset</div></div>
            <select value={settings.defaultJvmPreset} onChange={e => update('defaultJvmPreset', e.target.value)} style={{ width: 160 }}>
              <option value="default">Default</option><option value="g1gc">G1GC Optimized</option>
              <option value="zgc">ZGC</option><option value="aikars">Aikar's Flags</option>
              <option value="lowend">Low-End PC</option><option value="custom">Custom</option>
            </select>
          </div>
          <div className="form-row">
            <div><div className="form-row-label">Window Resolution</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="number" style={{ width: 80 }} value={settings.defaultWindowWidth} onChange={e => update('defaultWindowWidth', Number(e.target.value))} />
              <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>×</span>
              <input className="input" type="number" style={{ width: 80 }} value={settings.defaultWindowHeight} onChange={e => update('defaultWindowHeight', Number(e.target.value))} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
