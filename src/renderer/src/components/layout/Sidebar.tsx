import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { useAuthStore } from '../../store/authStore'
import {
  UtensilsCrossed,
  Package,
  Users,
  ClipboardList,
  BarChart3,
  FileSpreadsheet,
  HardDrive,
  Settings,
  ShoppingCart,
  Moon,
  Sun
} from 'lucide-react'

const menuItems = [
  { path: '/admin/menu', icon: UtensilsCrossed, label: 'nav.menu' },
  { path: '/admin/stock', icon: Package, label: 'nav.stock' },
  { path: '/admin/workers', icon: Users, label: 'nav.workers' },
  { path: '/admin/orders-history', icon: ClipboardList, label: 'nav.ordersHistory' },
  { path: '/admin/analytics', icon: BarChart3, label: 'nav.analytics' },
  { path: '/admin/excel', icon: FileSpreadsheet, label: 'nav.excel' },
  { path: '/admin/backup', icon: HardDrive, label: 'nav.backup' },
  { path: '/admin/settings', icon: Settings, label: 'nav.settings' }
]

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { darkMode, toggleDarkMode } = useAppStore()
  const { lock } = useAuthStore()

  return (
    <aside className="w-60 h-full bg-gray-900 text-white flex flex-col shrink-0">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-lg font-bold text-orange-400">{t('nav.admin')}</h1>
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors
                ${
                  isActive
                    ? 'bg-orange-500/20 text-orange-400 border-e-2 border-orange-400'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{t(item.label)}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-gray-800 p-2">
        <button
          onClick={() => { lock(); navigate('/orders') }}
          className="w-full flex items-center gap-3 px-5 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
        >
          <ShoppingCart className="h-5 w-5 shrink-0" />
          <span>{t('nav.backToOrders')}</span>
        </button>
      </div>
    </aside>
  )
}
