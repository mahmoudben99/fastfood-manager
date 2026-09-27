import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ShieldCheck, Clock, Wifi, KeyRound, Info } from 'lucide-react'
import { BrandMark } from '../setup/parts/BrandMark'
import { LanguageSwitcher } from '../setup/parts/LanguageSwitcher'
import { Notice } from '../setup/parts/Notice'
import { MachineIdField } from './MachineIdField'

export function ActivationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setActivated, setActivationType, setTrialStatus, setTrialExpiresAt } = useAppStore()

  const [machineId, setMachineId] = useState('')
  const [serialCode, setSerialCode] = useState('')
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)
  const [trialError, setTrialError] = useState('')

  useEffect(() => {
    window.api.activation.getMachineId().then(setMachineId)
  }, [])

  const formatInput = (value: string) => {
    const clean = value.replace(/[^A-Fa-f0-9-]/g, '').toUpperCase()
    const digits = clean.replace(/-/g, '')
    const parts: string[] = []
    for (let i = 0; i < digits.length && i < 20; i += 5) {
      parts.push(digits.slice(i, i + 5))
    }
    return parts.join('-')
  }

  const handleActivate = async () => {
    setError('')
    setActivating(true)
    try {
      const result = await window.api.activation.activate(serialCode)
      if (result.success) {
        setActivated(true)
        setActivationType('full')
        navigate('/setup')
      } else {
        setError(t('activation.invalidCode'))
      }
    } catch {
      setError(t('activation.invalidCode'))
    } finally {
      setActivating(false)
    }
  }

  const handleStartTrial = async () => {
    setTrialError('')
    setStartingTrial(true)
    try {
      const result = await window.api.trial.start()
      if (result.success) {
        setActivated(true)
        setActivationType('trial')
        setTrialStatus('active')
        if (result.expiresAt) setTrialExpiresAt(new Date(result.expiresAt))
        // Start the trial watcher if not already running (e.g. after factory reset in same session)
        window.api.trial.ensureWatcher()
        navigate('/setup')
      } else if (result.error === 'trial_expired') {
        setTrialError(t('activation.trialExpired', { defaultValue: 'Your free trial has expired. Please purchase a license to continue.' }))
      } else if (result.error === 'trial_paused') {
        setTrialError(t('activation.trialPaused', { defaultValue: 'Your trial has been paused by the administrator.' }))
      } else {
        setTrialError(result.error || t('activation.trialStartFailed', { defaultValue: 'Could not start trial. Please check your internet connection.' }))
      }
    } catch {
      setTrialError(t('activation.trialConnectFailed', { defaultValue: 'Could not connect to server. Please check your internet connection.' }))
    } finally {
      setStartingTrial(false)
    }
  }

  const serialComplete = serialCode.length >= 23
  const busy = activating || startingTrial

  return (
    <div className="h-screen overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <BrandMark />
          <LanguageSwitcher />
        </header>

        <main className="flex flex-1 flex-col justify-center py-6">
          {/* The brand mark + card titles say it all; the page title stays for screen readers. */}
          <h1 className="sr-only">{t('activation.title')}</h1>

          {/* Side by side from 768px (1024 fits two ~470px cards), stacked below. */}
          <div className="grid items-stretch gap-5 md:grid-cols-2">
            {/* ── Card 1: Serial Code (the ONE ember CTA) ── */}
            <section className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-e2">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="min-w-0 text-xl font-bold text-ink">
                  {t('activation.haveLicense', { defaultValue: 'I have a license' })}
                </h2>
              </div>

              <div className="space-y-4">
                <MachineIdField
                  machineId={machineId}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      {t('activation.machineId')}
                      <span role="img" aria-label={t('activation.contact')} title={t('activation.contact')} className="inline-flex text-muted">
                        <Info className="h-4 w-4" />
                      </span>
                    </span>
                  }
                />

                {/* Serial code: always LTR + monospace, auto-grouped XXXXX-XXXXX-XXXXX-XXXXX */}
                <Input
                  label={t('activation.serialCode')}
                  type="text"
                  dir="ltr"
                  inputSize="lg"
                  spellCheck={false}
                  autoComplete="off"
                  value={serialCode}
                  onChange={(e) => setSerialCode(formatInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && serialComplete && !busy) void handleActivate()
                  }}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  maxLength={23}
                  error={error || undefined}
                  className="text-center font-mono uppercase tracking-[0.12em]"
                />
              </div>

              <div className="mt-auto pt-5">
                <Button
                  size="xl"
                  fullWidth
                  onClick={handleActivate}
                  loading={activating}
                  disabled={serialCode.length < 23 || startingTrial}
                  icon={<KeyRound className="h-5 w-5" />}
                >
                  {t('activation.activate')}
                </Button>
              </div>
            </section>

            {/* ── Card 2: Free Trial ── */}
            <section className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-e2">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 rounded-xl bg-info-soft text-info-ink flex items-center justify-center">
                  <Clock className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="min-w-0 text-xl font-bold text-ink">
                  {t('activation.startFreeTrial', { defaultValue: 'Start Free Trial' })}
                </h2>
              </div>

              {/* One line: 7 days · all features · internet required */}
              <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <Wifi className="h-4 w-4 shrink-0 text-info-ink" aria-hidden />
                {t('activation.trialLine')}
              </p>

              {trialError && <Notice tone="danger" className="mt-4">{trialError}</Notice>}

              <div className="mt-auto pt-5">
                <Button
                  variant="secondary"
                  size="xl"
                  fullWidth
                  onClick={handleStartTrial}
                  loading={startingTrial}
                  disabled={activating}
                  icon={<Clock className="h-5 w-5" />}
                >
                  {t('activation.startTrialButton', { defaultValue: 'Start 7-Day Free Trial' })}
                </Button>
              </div>
            </section>
          </div>

          <p className="mt-5 text-center text-sm text-muted">
            {t('activation.needLicense', { defaultValue: 'Need a license? Contact us to purchase.' })}
          </p>
        </main>
      </div>
    </div>
  )
}
