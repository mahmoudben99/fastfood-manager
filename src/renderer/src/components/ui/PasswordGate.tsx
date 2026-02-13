import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, KeyRound, Copy, Check, ArrowLeft } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'

interface PasswordGateProps {
  onUnlock: () => void
  onCancel: () => void
}

type Step = 'password' | 'forgot' | 'newPassword'

export function PasswordGate({ onUnlock, onCancel }: PasswordGateProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [machineId, setMachineId] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [copied, setCopied] = useState(false)

  // New password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const valid = await window.api.settings.verifyPassword(password)
      if (valid) {
        onUnlock()
      } else {
        setError(t('setup.password.mismatch'))
        setPassword('')
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    const id = await window.api.activation.getMachineId()
    setMachineId(id)
    setStep('forgot')
    setError('')
    setUnlockCode('')
  }

  const handleCopyMachineId = async () => {
    await navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleValidateUnlockCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const valid = await window.api.activation.validateUnlockCode(unlockCode.trim())
      if (valid) {
        setStep('newPassword')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
      } else {
        setError(t('forgotPassword.invalidCode'))
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 4) {
      setError(t('setup.password.tooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('setup.password.mismatch'))
      return
    }

    setLoading(true)
    try {
      const result = await window.api.activation.resetPassword(unlockCode.trim(), newPassword)
      if (result.success) {
        onUnlock()
      } else {
        setError(result.error || t('common.error'))
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('password')
    setError('')
    setPassword('')
    setUnlockCode('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4">
        {/* Step 1: Normal password entry */}
        {step === 'password' && (
          <>
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-orange-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t('nav.admin')}</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('setup.password.password')}
                error={error}
                autoFocus
              />

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={loading} className="flex-1">
                  {t('common.confirm')}
                </Button>
              </div>
            </form>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full mt-3 text-sm text-orange-500 hover:text-orange-600 transition-colors"
            >
              {t('forgotPassword.link')}
            </button>
          </>
        )}

        {/* Step 2: Show machine ID + enter unlock code */}
        {step === 'forgot' && (
          <>
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <KeyRound className="h-8 w-8 text-blue-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t('forgotPassword.title')}</h2>
              <p className="text-sm text-gray-500 text-center mt-1">
                {t('forgotPassword.subtitle')}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('activation.machineId')}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono select-all">
                  {machineId}
                </div>
                <button
                  type="button"
                  onClick={handleCopyMachineId}
                  className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>

            <form onSubmit={handleValidateUnlockCode} className="space-y-4">
              <Input
                type="text"
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value.toUpperCase())}
                placeholder={t('forgotPassword.codePlaceholder')}
                label={t('forgotPassword.codeLabel')}
                error={error}
                autoFocus
                className="font-mono tracking-wider"
              />

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t('common.back')}
                </Button>
                <Button type="submit" loading={loading} className="flex-1">
                  {t('common.confirm')}
                </Button>
              </div>
            </form>
          </>
        )}

        {/* Step 3: Set new password */}
        {step === 'newPassword' && (
          <>
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('forgotPassword.newPasswordTitle')}
              </h2>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('setup.password.password')}
                label={t('setup.password.password')}
                autoFocus
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('setup.password.confirm')}
                label={t('setup.password.confirm')}
                error={error}
              />

              <Button type="submit" loading={loading} className="w-full">
                {t('forgotPassword.resetButton')}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
