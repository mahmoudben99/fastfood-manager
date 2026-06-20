import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { PasswordGate } from '../ui/PasswordGate'
import { Sidebar } from './Sidebar'

export function AdminLayout() {
  const navigate = useNavigate()
  const { isUnlocked, unlock, checkAutoLock } = useAuthStore()

  // Actually enforce the 10-minute auto-lock: checkAutoLock only re-locks when something
  // calls it, and nothing did. Poll it while the admin area is open (and on mount) so an
  // unlocked session re-locks itself after inactivity instead of staying open forever.
  useEffect(() => {
    checkAutoLock()
    const id = setInterval(checkAutoLock, 30_000)
    return () => clearInterval(id)
  }, [checkAutoLock])

  if (!isUnlocked) {
    return <PasswordGate onUnlock={unlock} onCancel={() => navigate('/orders')} />
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  )
}
