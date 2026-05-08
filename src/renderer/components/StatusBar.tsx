import { useState, useEffect } from 'react'

const statusLabels: Record<string, string> = {
  preparing: 'Preparing',
  downloading: 'Downloading',
  launching: 'Launching',
  running: 'Playing',
  crashed: 'Crashed',
  stopped: 'Stopped',
}

const statusColors: Record<string, string> = {
  preparing: 'var(--accent)',
  downloading: 'var(--accent)',
  launching: 'var(--accent)',
  running: 'var(--success)',
  crashed: 'var(--error)',
  stopped: 'var(--text-muted)',
}

export default function StatusBar() {
  const [activeAccount, setActiveAccount] = useState<any>(null)
  const [currentInstance, setCurrentInstance] = useState<any>(null)
  const [gameStatus, setGameStatus] = useState<string>('')

  useEffect(() => {
    // Initial fetch
    window.api.getAccounts().then((data: any) => setActiveAccount(data.activeAccount))
    window.api.getInstances().then((insts: any) => {
      if (insts.length > 0) setCurrentInstance(insts[0])
    })

    // Listen for instance updates or launches
    const unsubState = window.api.onGameStateChanged((state: any) => {
      setGameStatus(state.status)
      if (state.status === 'running' || state.status === 'launching' || state.status === 'downloading' || state.status === 'preparing') {
        window.api.getInstances().then((insts: any) => {
          const found = insts.find((i: any) => i.id === state.instanceId)
          if (found) setCurrentInstance(found)
        })
      }
    })

    return () => {
      unsubState()
    }
  }, [])

  return (
    <div className="status-bar">
      <div className="status-bar-group">
        <div className="status-bar-item">
          <div className={`status-bar-dot ${activeAccount ? '' : 'offline'}`} />
          <span>{activeAccount ? `Account: ${activeAccount.username}` : 'No Account'}</span>
        </div>
        {currentInstance && (
          <div className="status-bar-item">
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            <span>Instance: <strong>{currentInstance.name}</strong> ({currentInstance.minecraftVersion})</span>
          </div>
        )}
        {gameStatus && gameStatus !== 'stopped' && (
          <div className="status-bar-item">
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            <span style={{ color: statusColors[gameStatus] || 'var(--text)' }}>
              {statusLabels[gameStatus] || gameStatus}
            </span>
          </div>
        )}
      </div>
      <div className="status-bar-group">
        <span>Haze Launcher v1.0.0</span>
      </div>
    </div>
  )
}
