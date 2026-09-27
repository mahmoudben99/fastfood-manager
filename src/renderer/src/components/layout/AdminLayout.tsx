import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { PasswordGate } from '../ui/PasswordGate'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const COLLAPSE_KEY = 'ffm.sidebarCollapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AdminLayout() {
  const navigate = useNavigate()
  const { isUnlocked, unlock, checkAutoLock } = useAuthStore()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  // Actually enforce the 10-minute auto-lock: checkAutoLock only re-locks when something
  // calls it, and nothing did. Poll it while the admin area is open (and on mount) so an
  // unlocked session re-locks itself after inactivity instead of staying open forever.
  useEffect(() => {
    checkAutoLock()
    const id = setInterval(checkAutoLock, 30_000)
    return () => clearInterval(id)
  }, [checkAutoLock])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* storage unavailable: keep in memory */
      }
      return next
    })
  }, [])

  if (!isUnlocked) {
    return <PasswordGate onUnlock={unlock} onCancel={() => navigate('/orders')} />
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-canvas p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
