import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, CheckCircle2, Clock, Download, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { Badge, Button, Card, Field } from '../../../components/ui'
import { CopyField, InfoNote } from '../SettingsFeedback'
import { ActivateDialog } from './ActivateDialog'

/** Settings > License & updates: app version + update check, license state, machine ID, activation. */
export function AboutSection() {
  const { t } = useTranslation()
  const activationType = useAppStore((s) => s.activationType)
  const trialStatus = useAppStore((s) => s.trialStatus)
  const trialExpiresAt = useAppStore((s) => s.trialExpiresAt)
  const [checking, setChecking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'available' | 'upToDate' | null>(null)
  const [machineId, setMachineId] = useState('')
  const [activateOpen, setActivateOpen] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    window.api.activation.getMachineId().then((mid) => setMachineId(mid || '')).catch(() => {})
    // Tick every second so the trial countdown stays live.
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const checkForUpdates = async () => {
    setChecking(true)
    setUpdateStatus(null)
    try {
      const result = await window.api.updater.check()
      setUpdateStatus(result.hasUpdate ? 'available' : 'upToDate')
    } catch {
      setUpdateStatus('upToDate')
    } finally {
      setChecking(false)
    }
  }

  const trialTimeLeft = (): string => {
    if (!trialExpiresAt) return ''
    const msLeft = trialExpiresAt.getTime() - Date.now()
    if (msLeft <= 0) return t('settings.trialExpiredLabel')
    const days = Math.floor(msLeft / 86_400_000)
    const hours = Math.floor((msLeft % 86_400_000) / 3_600_000)
    const mins = Math.floor((msLeft % 3_600_000) / 60_000)
    const secs = Math.floor((msLeft % 60_000) / 1000)
    if (days > 0) return t('settings.trialRemainingDays', { days, hours, mins, secs })
    if (hours > 0) return t('settings.trialRemainingHours', { hours, mins, secs })
    return t('settings.trialRemainingMins', { mins, secs })
  }

  const trialActive = activationType === 'trial' && (trialStatus === 'active' || trialStatus === 'offline-locked')
  const trialEnded = activationType === 'trial' && (trialStatus === 'expired' || trialStatus === 'paused')

  return (
    <div>
      <div className="space-y-6">
        <Card title={t('settings.updates')} icon={<Download />}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">{t('settings.v4.installedVersion')}</p>
              <p className="num text-2xl font-extrabold text-ink" dir="ltr">
                v{APP_VERSION}
              </p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              icon={<RefreshCw className={checking ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />}
              onClick={() => { void checkForUpdates() }}
              disabled={checking}
            >
              {t('settings.checkUpdates')}
            </Button>
          </div>
          {updateStatus === 'upToDate' && (
            <InfoNote tone="success" className="mt-4" icon={<CheckCircle2 />}>
              {t('settings.upToDate')}
            </InfoNote>
          )}
          {updateStatus === 'available' && (
            <InfoNote tone="info" className="mt-4" icon={<Download />}>
              {t('update.availableTitle')}
            </InfoNote>
          )}
        </Card>

        <Card title={t('settings.license')} icon={<BadgeCheck />}>
          <div className="space-y-5">
            {activationType === 'full' && (
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 shrink-0 rounded-2xl bg-success-soft text-success-ink flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-ink">{t('settings.fullLicenseActivated')}</p>
                  <Badge variant="success" dot>
                    {t('settings.v4.licenseValid')}
                  </Badge>
                </div>
              </div>
            )}
            {trialActive && (
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 shrink-0 rounded-2xl bg-warning-soft text-warning-ink flex items-center justify-center">
                  <Clock className="h-6 w-6" />
                </span>
                <p className="num font-semibold text-ink">{t('settings.freeTrialPrefix', { time: trialTimeLeft() })}</p>
              </div>
            )}
            {trialEnded && (
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 shrink-0 rounded-2xl bg-danger-soft text-danger-ink flex items-center justify-center">
                  <ShieldX className="h-6 w-6" />
                </span>
                <p className="font-semibold text-danger-ink">
                  {trialStatus === 'paused' ? t('settings.trialPaused') : t('settings.trialExpired')}
                </p>
              </div>
            )}

            {machineId && (
              <Field label={t('settings.machineId')}>
                <CopyField value={machineId} copyLabel={t('settings.copyMachineId')} />
              </Field>
            )}

            {activationType !== 'full' && (
              <Button size="lg" icon={<ShieldCheck className="h-5 w-5" />} onClick={() => setActivateOpen(true)}>
                {t('settings.activateSoftware')}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {activateOpen && <ActivateDialog machineId={machineId} onClose={() => setActivateOpen(false)} />}
    </div>
  )
}
