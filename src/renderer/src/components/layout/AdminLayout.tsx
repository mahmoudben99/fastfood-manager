import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { PasswordGate } from '../ui/PasswordGate'
import { Sidebar } from './Sidebar'

export function AdminLayout() {
  const navigate = useNavigate()
  const { isUnlocked, unlock } = useAuthStore()

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
