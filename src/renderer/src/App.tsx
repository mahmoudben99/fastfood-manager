import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import { ActivationPage } from './pages/activation/ActivationPage'
import { SetupWizard } from './pages/setup/SetupWizard'
import { OrderScreen } from './pages/orders/OrderScreen'
import { AdminLayout } from './components/layout/AdminLayout'
import { MenuManagement } from './pages/menu/MenuManagement'
import { StockManagement } from './pages/stock/StockManagement'
import { WorkerManagement } from './pages/workers/WorkerManagement'
import { OrdersHistory } from './pages/orders-history/OrdersHistory'
import { AnalyticsDashboard } from './pages/analytics/AnalyticsDashboard'
import { ExcelImportExport } from './pages/excel/ExcelImportExport'
import { BackupRestore } from './pages/backup/BackupRestore'
import { SettingsPage } from './pages/settings/SettingsPage'
import { UpdateToast } from './components/ui/UpdateToast'
import { SplashScreen } from './components/SplashScreen'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [showSplash, setShowSplash] = useState(true)
  const { activated, setupComplete, loadSettings } = useAppStore()

  useEffect(() => {
    loadSettings().finally(() => setLoading(false))
  }, [loadSettings])

  // Show splash screen only on first load
  if (showSplash && !loading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <UpdateToast />
      <Routes>
        <Route path="/activate" element={<ActivationPage />} />
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="/orders" element={<OrderScreen />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/menu" replace />} />
          <Route path="menu" element={<MenuManagement />} />
          <Route path="stock" element={<StockManagement />} />
          <Route path="workers" element={<WorkerManagement />} />
          <Route path="orders-history" element={<OrdersHistory />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
          <Route path="excel" element={<ExcelImportExport />} />
          <Route path="backup" element={<BackupRestore />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="*"
          element={
            <Navigate
              to={!activated ? '/activate' : !setupComplete ? '/setup' : '/orders'}
              replace
            />
          }
        />
      </Routes>
    </HashRouter>
  )
}
