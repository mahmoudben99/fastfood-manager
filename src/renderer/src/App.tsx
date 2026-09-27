import { Suspense, lazy, useEffect, useState } from 'react'
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
import { PromotionsPage } from './pages/promotions/PromotionsPage'
import { AmbianceScreen } from './pages/ambiance/AmbianceScreen'
import { ReceiptEditor } from './pages/settings/ReceiptEditor'
import { UpdateToast } from './components/ui/UpdateToast'
import './pages/kds/kds-i18n'
import { KdsScreen } from './pages/kds/KdsScreen'
import { BoardScreen } from './pages/kds/BoardScreen'
import { KdsSettingsPage } from './pages/kds/KdsSettingsPage'
import { Toaster } from './components/ui/Toast'
import { ApprovalHost } from './components/checkout'

// v4 design-system reference (admin-only, lazy so it never weighs on POS start-up).
const StyleGuide = lazy(() => import('./styleguide/StyleGuide').then((m) => ({ default: m.StyleGuide })))
// v4 admin: cash & shifts, delivery dispatch (lazy: admin-only).
const CashPage = lazy(() => import('./pages/cash/CashPage').then((m) => ({ default: m.CashPage })))
const DeliveryPage = lazy(() => import('./pages/delivery/DeliveryPage').then((m) => ({ default: m.DeliveryPage })))

export default function App() {
  const [loading, setLoading] = useState(true)
  const [lockedReason, setLockedReason] = useState<string | null>(null)
  const [tabletToast, setTabletToast] = useState<string | null>(null)
  const [onlineRestoredToast, setOnlineRestoredToast] = useState(false)

  const {
    activated, setupComplete, loadSettings,
    activationType, trialOfflineSecondsLeft,
    setTrialStatus, setTrialOfflineSecondsLeft, setTrialExpiresAt
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
        if (data.expiresAt) setTrialExpiresAt(new Date(data.expiresAt))
        // An authoritative active response also represents admin resume/extend/reactivate.
        // Keeping a previous 'paused' or 'expired' reason left the full-screen lock mounted until
        // restart even though every later cloud check said the trial was active.
        setLockedReason(null)
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
  }, [setTrialStatus, setTrialOfflineSecondsLeft, setTrialExpiresAt])

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

  // Listen for remote orders via Supabase Realtime
  useEffect(() => {
    if (!window.api.remote) return
    const unsub = window.api.remote.onRemoteOrder((order) => {
      setTabletToast(`📱 Commande #${order.daily_number} reçue (en ligne)`)
      setTimeout(() => setTabletToast(null), 5000)
    })
    return unsub
  }, [])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <div className="w-11 h-11 rounded-full border-4 border-primary-soft-2 border-t-primary animate-spin" />
          <p className="text-muted text-sm font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <UpdateToast />
      <Toaster />
      <ApprovalHost />

      {/* Tablet new-order toast */}
      {tabletToast && (
        <div className="fixed top-4 end-4 z-[999] bg-ember px-5 py-3.5 rounded-2xl shadow-glow text-sm font-bold animate-slide-in-end">
          {tabletToast}
        </div>
      )}

      {/* Trial offline countdown banner */}
      {activated && activationType === 'trial' && trialOfflineSecondsLeft !== null && !lockedReason && (
        <div className="num fixed top-0 inset-x-0 z-[998] bg-danger-strong text-white text-center py-2 text-sm font-semibold shadow-e2">
          ⚠️ No internet — app locks in {Math.floor(trialOfflineSecondsLeft / 60)}:{String(trialOfflineSecondsLeft % 60).padStart(2, '0')}
        </div>
      )}

      {/* Internet restored toast */}
      {onlineRestoredToast && (
        <div className="fixed top-4 end-4 z-[999] bg-success-strong text-white px-5 py-3.5 rounded-2xl shadow-e3 text-sm font-bold animate-slide-in-end">
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
        {/* Kitchen display + customer board: second-screen windows (src/main/kds-window.ts). */}
        <Route path="/kds" element={<KdsScreen />} />
        <Route path="/board" element={<BoardScreen />} />
        <Route
          path="/styleguide"
          element={
            <Suspense fallback={<div className="h-screen bg-canvas" />}>
              <StyleGuide />
            </Suspense>
          }
        />
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
          <Route path="ambiance" element={<AmbianceScreen />} />
          <Route path="kds" element={<KdsSettingsPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="receipt-editor" element={<ReceiptEditor />} />
          <Route path="cash" element={<Suspense fallback={null}><CashPage /></Suspense>} />
          <Route path="delivery" element={<Suspense fallback={null}><DeliveryPage /></Suspense>} />
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
