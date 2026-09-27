import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { ShieldX, WifiOff, KeyRound, CirclePause, Fingerprint, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { MachineIdField } from './MachineIdField'

interface TrialLockedPageProps {
  reason: 'expired' | 'paused' | 'offline' | string
  offlineSecondsLeft?: number | null
}

/** Offline grace period the main process counts down from (seconds). */
const OFFLINE_GRACE_SECONDS = 120
const URGENT_SECONDS = 30

export function TrialLockedPage({ reason, offlineSecondsLeft }: TrialLockedPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const titleId = useId()
  const { setActivated, setTrialStatus } = useAppStore()
  const [machineId, setMachineId] = useState('')
  const [showMachineId, setShowMachineId] = useState(false)
  const [checking, setChecking] = useState(false)

  const isOffline = reason === 'offline'
  const isPaused = reason === 'paused'
  const counting = isOffline && offlineSecondsLeft != null && offlineSecondsLeft > 0
  const urgent = counting && (offlineSecondsLeft as number) <= URGENT_SECONDS

  const handleShowMachineId = async () => {
    if (!machineId) {
      const id = await window.api.activation.getMachineId()
      setMachineId(id)
    }
    setShowMachineId(true)
  }

  const handleEnterCode = () => {
    setActivated(false)
    setTrialStatus(null)
    navigate('/activate')
  }

  // Same immediate cloud check the browser online/offline events trigger; the App unlocks on the
  // resulting status/offline-cleared event. The spinner just acknowledges the tap.
  const handleCheckNow = () => {
    if (checking) return
    setChecking(true)
    Promise.resolve(window.api.trial.checkNow())
      .catch(() => {})
      .finally(() => setTimeout(() => setChecking(false), 1500))
  }

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Warning while the offline countdown is still running (or paused); danger once locked.
  const tone: 'warning' | 'danger' = counting || isPaused ? 'warning' : 'danger'
  const Icon = isOffline ? WifiOff : isPaused ? CirclePause : ShieldX

  const title = isOffline
    ? counting
      ? t('trialLock.titleNoInternet')
      : t('trialLock.titleOfflineLocked', { defaultValue: 'App Locked — No Internet' })
    : isPaused
      ? t('trialLock.titlePaused', { defaultValue: 'Trial Paused' })
      : t('trialLock.titleExpired', { defaultValue: 'Free Trial Expired' })

  // One short line each (the long v3 sentences stay in the locale files, unused here).
  const subtitle = isOffline
    ? t('trialLock.shortOffline')
    : isPaused
      ? t('trialLock.shortPaused')
      : t('trialLock.shortExpired')

  // Share of the grace period still left (bar drains towards the lock).
  const remaining = counting ? Math.min(1, Math.max(0, (offlineSecondsLeft as number) / OFFLINE_GRACE_SECONDS)) : 0

  // Compact on purpose: the offline state (timer + 3 actions + machine ID) fits 1280x720 and
  // 1024x768 without scrolling; it still scrolls on anything smaller.
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[200] overflow-y-auto bg-canvas animate-fade-in"
    >
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-6 py-6">
        <div className="w-full rounded-3xl border border-line bg-surface p-6 text-center shadow-e3">
          <div
            className={cn(
              'mx-auto mb-3 h-14 w-14 rounded-2xl flex items-center justify-center',
              tone === 'warning' ? 'bg-warning-soft text-warning-ink' : 'bg-danger-soft text-danger-ink'
            )}
          >
            <Icon className="h-7 w-7" aria-hidden />
          </div>

          <h1 id={titleId} className="text-xl font-extrabold leading-tight tracking-tight text-ink rtl:tracking-normal">
            {title}
          </h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{subtitle}</p>

          {/* Offline grace countdown: big timer + draining bar (lock at 0) */}
          {counting && (
            <div
              className="mt-4 rounded-2xl border border-line bg-surface-2 px-4 py-3"
              title={t('trialLock.lockOnZero', { defaultValue: 'App will lock when timer reaches zero' })}
            >
              <p
                dir="ltr"
                aria-live="polite"
                aria-label={t('trialLock.timeLeft')}
                className={cn('num text-kpi', urgent ? 'text-danger-ink' : 'text-warning-ink')}
              >
                {formatCountdown(offlineSecondsLeft as number)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    'h-full w-full rounded-full origin-left rtl:origin-right transition-transform duration-1000 ease-linear',
                    urgent ? 'bg-danger' : 'bg-warning'
                  )}
                  style={{ transform: `scaleX(${remaining})` }}
                />
              </div>
            </div>
          )}

          {/* Actions: ONE ember CTA, secondary actions side by side */}
          <div className="mt-5 space-y-2">
            <Button size="xl" fullWidth onClick={handleEnterCode} icon={<KeyRound className="h-5 w-5" />}>
              {t('trialLock.enterCode', { defaultValue: 'Enter Activation Code' })}
            </Button>

            {(isOffline || !showMachineId) && (
              <div className="flex gap-2">
                {isOffline && (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="flex-1"
                    onClick={handleCheckNow}
                    loading={checking}
                    icon={<RefreshCw className="h-5 w-5" />}
                  >
                    {t('trialLock.checkNow')}
                  </Button>
                )}
                {!showMachineId && (
                  <Button
                    variant={isOffline ? 'secondary' : 'ghost'}
                    size="lg"
                    className="flex-1"
                    onClick={handleShowMachineId}
                    title={t('trialLock.showMachineId', { defaultValue: 'Show Machine ID (for support)' })}
                    icon={<Fingerprint className="h-5 w-5" />}
                  >
                    {t('activation.machineId')}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Machine ID display */}
          {showMachineId && machineId && (
            <div className="mt-4 border-t border-line pt-4 text-start">
              <MachineIdField
                machineId={machineId}
                label={t('trialLock.sendIdHint', { defaultValue: 'Send this ID to support to get an activation code:' })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
