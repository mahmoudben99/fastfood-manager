import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { KeyRound, LogOut, Power } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { Button, Card, Input, Toggle, toast } from '../../../components/ui'
import { InfoNote } from '../SettingsFeedback'
import { digitsOnly, useTouchKeyboard } from '../useTouchKeyboard'

/** Settings > Security: start with Windows, admin password, and logout (danger zone). */
export function SecuritySection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const kb = useTouchKeyboard()
  const setSetupComplete = useAppStore((s) => s.setSetupComplete)
  const setActivated = useAppStore((s) => s.setActivated)

  const [autoLaunch, setAutoLaunch] = useState(true)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passError, setPassError] = useState('')
  // Informational note after a SUCCESSFUL change (e.g. owner dashboard needs 8+ chars) — not an error.
  const [passNotice, setPassNotice] = useState('')
  const [changing, setChanging] = useState(false)
  const [logoutPassword, setLogoutPassword] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    window.api.settings.getAutoLaunch().then(setAutoLaunch).catch(() => {})
  }, [])

  const handleAutoLaunch = async (enabled: boolean) => {
    setAutoLaunch(enabled)
    await window.api.settings.setAutoLaunch(enabled)
    await window.api.settings.set('auto_launch', enabled ? 'true' : 'false')
    toast.success(t('settings.saved'))
  }

  const changePassword = async () => {
    setPassError('')
    setPassNotice('')
    if (newPass.length < 4) return setPassError(t('setup.password.tooShort'))
    if (newPass !== confirmPass) return setPassError(t('setup.password.mismatch'))
    setChanging(true)
    try {
      const valid = await window.api.settings.verifyPassword(currentPass)
      if (!valid) return setPassError(t('settings.currentPasswordIncorrect'))
      // Stores the admin password AND provisions the remote owner-dashboard credential.
      const result = await window.api.settings.setAdminPassword(newPass)
      if (!result.ok) return setPassError(t('setup.password.tooShort'))
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
      // The password WAS saved: the owner-dashboard hint is information, not an error.
      setPassNotice(
        result.ownerDashboard === 'too_short' ? t('settings.ownerDashboardCredentialTooShort') : t('settings.passwordChanged')
      )
      toast.success(t('settings.passwordChanged'))
    } finally {
      setChanging(false)
    }
  }

  const handleLogout = async () => {
    if (!logoutPassword.trim()) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      const valid = await window.api.settings.verifyPassword(logoutPassword)
      if (!valid) {
        setLogoutError(t('nav.wrongPassword'))
        return
      }
      // Logout clears only entitlement/setup state. Operational data remains in SQLite.
      const result = await window.api.settings.logout()
      if (!result?.success) throw new Error(result?.error || 'Logout failed')
      setSetupComplete(false)
      setActivated(false)
      navigate('/activate')
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setLoggingOut(false)
    }
  }

  const pw = { type: 'numeric' as const, transform: digitsOnly }

  return (
    <div>
      <div className="space-y-6">
        <Card title={t('settings.startupSettings')} icon={<Power />}>
          <Toggle
            checked={autoLaunch}
            onChange={(v) => { void handleAutoLaunch(v) }}
            label={t('settings.autoLaunch')}
          />
        </Card>

        <Card title={t('settings.changePassword')} icon={<KeyRound />}>
          <div className="max-w-md space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              dir="ltr"
              label={t('settings.currentPassword')}
              {...kb.bind('currentPass', currentPass, setCurrentPass, pw)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="password"
                inputMode="numeric"
                dir="ltr"
                label={t('settings.newPassword')}
                {...kb.bind('newPass', newPass, setNewPass, pw)}
              />
              <Input
                type="password"
                inputMode="numeric"
                dir="ltr"
                label={t('settings.confirmPassword')}
                error={passError}
                {...kb.bind('confirmPass', confirmPass, setConfirmPass, pw)}
              />
            </div>
            <Button
              size="lg"
              onClick={() => { void changePassword() }}
              loading={changing}
              disabled={!currentPass || !newPass || !confirmPass}
            >
              {t('settings.changePassword')}
            </Button>
            {passNotice && <InfoNote tone="info">{passNotice}</InfoNote>}
          </div>
        </Card>

        <section className="rounded-2xl border border-danger/40 bg-surface shadow-e1" aria-labelledby="logout-title">
          <div className="flex items-center gap-3 border-b border-line px-5 pt-4 pb-3">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-danger-soft text-danger-ink flex items-center justify-center">
              <LogOut className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h3 id="logout-title" className="text-base font-semibold text-danger-ink">
                {t('nav.logout')}
              </h3>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <InfoNote tone="warning">{t('nav.logoutWarning')}</InfoNote>
            <div className="flex max-w-xl flex-wrap items-start gap-3">
              <div className="min-w-56 flex-1">
                <Input
                  type="password"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="••••••••"
                  aria-label={t('settings.currentPassword')}
                  error={logoutError}
                  onKeyDown={kb.isTouch ? undefined : (e) => e.key === 'Enter' && handleLogout()}
                  {...kb.bind('logoutPassword', logoutPassword, (v) => { setLogoutPassword(v); setLogoutError('') }, pw)}
                />
              </div>
              <Button
                variant="danger"
                size="lg"
                icon={<LogOut className="h-5 w-5" />}
                onClick={() => { void handleLogout() }}
                loading={loggingOut}
                disabled={!logoutPassword.trim()}
              >
                {t('nav.logout')}
              </Button>
            </div>
          </div>
        </section>
      </div>
      {kb.keyboard()}
    </div>
  )
}
