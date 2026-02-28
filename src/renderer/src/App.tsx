import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import { ActivationPage } from './pages/activation/ActivationPage'
import { TrialLockedPage } from './pages/activation/TrialLockedPage'
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

export default function App() {
  const [loading, setLoading] = useState(true)
  const [lockedReason, setLockedReason] = useState<string | null>(null)
  const [tabletToast, setTabletToast] = useState<string | null>(null)
  const [onlineRestoredToast, setOnlineRestoredToast] = useState(false)

  const {
    activated, setupComplete, loadSettings,
    activationType, trialOfflineSecondsLeft,
    setTrialStatus, setTrialOfflineSecondsLeft
  } = useAppStore()

  useEffect(() => {
    loadSettings().finally(() => setLoading(false))
  }, [loadSettings])

  // Listen for trial events pushed from main process
  useEffect(() => {
    if (!window.api.trial) return

    const unsubLocked = window.api.trial.onLocked((reason) => {
      setLockedReason(reason)
      setTrialStatus(reason === 'offline' ? 'offline-locked' : 'expired')
    })

    const unsubCountdown = window.api.trial.onOfflineCountdown((seconds) => {
      setTrialOfflineSecondsLeft(seconds)
    })

    const unsubCleared = window.api.trial.onOfflineCleared(() => {
      setTrialOfflineSecondsLeft(null)
      setLockedReason((prev) => (prev === 'offline' ? null : prev))
      setOnlineRestoredToast(true)
      setTimeout(() => setOnlineRestoredToast(false), 4000)
    })

    const unsubStatus = window.api.trial.onStatusUpdate((data) => {
      setTrialOfflineSecondsLeft(null)
      if (data.status === 'active') {
        setTrialStatus('active')
        setLockedReason((prev) => (prev === 'offline' ? null : prev))
      } else if (data.status === 'expired' || data.status === 'paused') {
        setLockedReason(data.status)
        setTrialStatus(data.status as 'expired' | 'paused')
      }
    })

    return () => {
      unsubLocked()
      unsubCountdown()
      unsubCleared()
      unsubStatus()
    }
  }, [setTrialStatus, setTrialOfflineSecondsLeft])

  // Instant offline/online detection via browser events — triggers immediate trial check
  useEffect(() => {
    if (!activated || activationType !== 'trial') return

    const handleOffline = () => {
      window.api.trial.checkNow()
    }
    const handleOnline = () => {
      window.api.trial.checkNow()
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [activated, activationType])

  // Listen for orders placed from the tablet
  useEffect(() => {
    if (!window.api.tablet) return
    const unsub = window.api.tablet.onNewOrder((order) => {
      setTabletToast(`🍽 Commande #${order.daily_number} reçue via tablette`)
      setTimeout(() => setTabletToast(null), 5000)
    })
    return unsub
  }, [])

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

      {/* Tablet new-order toast */}
      {tabletToast && (
        <div className="fixed top-4 right-4 z-[999] bg-orange-500 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold animate-bounce">
          {tabletToast}
        </div>
      )}

      {/* Trial offline countdown banner */}
      {activated && activationType === 'trial' && trialOfflineSecondsLeft !== null && !lockedReason && (
        <div className="fixed top-0 left-0 right-0 z-[998] bg-red-500 text-white text-center py-2 text-sm font-semibold shadow-md">
          ⚠️ No internet — app locks in {Math.floor(trialOfflineSecondsLeft / 60)}:{String(trialOfflineSecondsLeft % 60).padStart(2, '0')}
        </div>
      )}

      {/* Internet restored toast */}
      {onlineRestoredToast && (
        <div className="fixed top-4 right-4 z-[999] bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          ✅ Internet connection restored
        </div>
      )}

      {/* Trial lock overlay — renders over everything when trial is locked */}
      {activated && activationType === 'trial' && lockedReason && (
        <TrialLockedPage
          reason={lockedReason}
          offlineSecondsLeft={trialOfflineSecondsLeft}
        />
      )}

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
