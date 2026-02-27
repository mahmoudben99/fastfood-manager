import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, KeyRound, Copy, Check, ArrowLeft, Send, MessageSquare } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { VirtualKeyboard } from '../VirtualKeyboard'
import { useAppStore } from '../../store/appStore'

interface PasswordGateProps {
  onUnlock: () => void
  onCancel: () => void
}

type Step = 'password' | 'forgot' | 'newPassword'
type ResetMethod = 'telegram' | 'support'

export function PasswordGate({ onUnlock, onCancel }: PasswordGateProps) {
  const { t } = useTranslation()
  const { inputMode } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [machineId, setMachineId] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [resetMethod, setResetMethod] = useState<ResetMethod>('support')
  const [hasTelegram, setHasTelegram] = useState(false)
  const [telegramSent, setTelegramSent] = useState(false)
  const [telegramCode, setTelegramCode] = useState('')

  // New password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Which method was used to reach newPassword step
  const [validatedMethod, setValidatedMethod] = useState<ResetMethod>('support')

  // Virtual keyboard state
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text' } | null>(null)

  useEffect(() => {
    // Check if Telegram bot is configured so we can show the Telegram tab
    window.api.telegram.getConfig().then((cfg: { token?: string; chatId?: string }) => {
      setHasTelegram(!!(cfg?.token && cfg?.chatId))
    }).catch(() => {})
  }, [])

  const getKeyboardValue = (): string => {
    if (!keyboardTarget) return ''
    switch (keyboardTarget.field) {
      case 'password': return password
      case 'newPassword': return newPassword
      case 'confirmPassword': return confirmPassword
      case 'unlockCode': return unlockCode
      case 'telegramCode': return telegramCode
      default: return ''
    }
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    switch (keyboardTarget.field) {
      case 'password': setPassword(val.replace(/\D/g, '')); break
      case 'newPassword': setNewPassword(val.replace(/\D/g, '')); break
      case 'confirmPassword': setConfirmPassword(val.replace(/\D/g, '')); break
      case 'unlockCode': setUnlockCode(val.toUpperCase()); break
      case 'telegramCode': setTelegramCode(val.replace(/\D/g, '')); break
    }
  }

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
    setTelegramCode('')
    setTelegramSent(false)
    // Default to telegram if configured, otherwise support
    setResetMethod(hasTelegram ? 'telegram' : 'support')
  }

  const handleSendTelegramCode = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await window.api.reset.sendViaTelegram()
      if (result?.sent) {
        setTelegramSent(true)
      } else {
        setError('Failed to send code. Make sure Telegram bot is running.')
      }
    } catch {
      setError('Failed to send code via Telegram.')
    } finally {
      setLoading(false)
    }
  }

  const handleValidateTelegramCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const valid = await window.api.reset.validateTelegram(telegramCode.trim())
      if (valid) {
        setValidatedMethod('telegram')
        setStep('newPassword')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
      } else {
        setError('Invalid or expired code. Please try again.')
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
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
      // Try local HMAC code first, then cloud one-time code
      const localValid = await window.api.activation.validateUnlockCode(unlockCode.trim())
      let cloudValid = false
      if (!localValid) {
        try {
          const result = await window.api.reset.validateCloud(unlockCode.trim())
          cloudValid = result?.valid === true
        } catch {
          // Offline — cloud check fails silently
        }
      }

      if (localValid || cloudValid) {
        setValidatedMethod('support')
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
      const code = validatedMethod === 'telegram' ? telegramCode.trim() : unlockCode.trim()
      const result = await window.api.reset.resetPassword(code, newPassword, validatedMethod)
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
    setTelegramCode('')
    setTelegramSent(false)
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
                inputMode="numeric"
                value={password}
                readOnly={isTouch}
                onClick={isTouch ? () => setKeyboardTarget({ field: 'password', type: 'numeric' }) : undefined}
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                placeholder={t('setup.password.password')}
                error={error}
                autoFocus={!isTouch}
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

        {/* Step 2: Forgot password — Telegram or Support reset */}
        {step === 'forgot' && (
          <>
            <div className="flex flex-col items-center mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <KeyRound className="h-8 w-8 text-blue-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t('forgotPassword.title')}</h2>
            </div>

            {/* Method tabs (only show Telegram tab if configured) */}
            {hasTelegram && (
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => { setResetMethod('telegram'); setError('') }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${resetMethod === 'telegram' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                >
                  <MessageSquare className="h-4 w-4 inline mr-1" />
                  Via Telegram
                </button>
                <button
                  type="button"
                  onClick={() => { setResetMethod('support'); setError('') }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${resetMethod === 'support' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                >
                  <KeyRound className="h-4 w-4 inline mr-1" />
                  Contact Support
                </button>
              </div>
            )}

            {/* Telegram reset flow */}
            {resetMethod === 'telegram' && (
              <>
                {!telegramSent ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500 text-center">
                      A 6-digit reset code will be sent to your Telegram chat.
                    </p>
                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                    <div className="flex gap-3">
                      <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        {t('common.back')}
                      </Button>
                      <Button type="button" loading={loading} onClick={handleSendTelegramCode} className="flex-1">
                        <Send className="h-4 w-4 mr-1" />
                        Send Code
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleValidateTelegramCode} className="space-y-4">
                    <p className="text-sm text-gray-500 text-center">
                      Code sent! Enter the 6-digit code from your Telegram.
                    </p>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={telegramCode}
                      readOnly={isTouch}
                      onClick={isTouch ? () => setKeyboardTarget({ field: 'telegramCode', type: 'numeric' }) : undefined}
                      onChange={(e) => setTelegramCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      label="Telegram Code"
                      error={error}
                      autoFocus={!isTouch}
                      className="font-mono tracking-widest text-center"
                    />
                    <div className="flex gap-3">
                      <Button type="button" variant="secondary" onClick={() => setTelegramSent(false)} className="flex-1">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Resend
                      </Button>
                      <Button type="submit" loading={loading} className="flex-1">
                        {t('common.confirm')}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}

            {/* Support reset flow */}
            {resetMethod === 'support' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('activation.machineId')}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">Send this ID to support to receive an unlock code.</p>
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
                    readOnly={isTouch}
                    onClick={isTouch ? () => setKeyboardTarget({ field: 'unlockCode', type: 'text' }) : undefined}
                    onChange={(e) => setUnlockCode(e.target.value.toUpperCase())}
                    placeholder={t('forgotPassword.codePlaceholder')}
                    label={t('forgotPassword.codeLabel')}
                    error={error}
                    autoFocus={!isTouch}
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
                inputMode="numeric"
                value={newPassword}
                readOnly={isTouch}
                onClick={isTouch ? () => setKeyboardTarget({ field: 'newPassword', type: 'numeric' }) : undefined}
                onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, ''))}
                placeholder={t('setup.password.password')}
                label={t('setup.password.password')}
                autoFocus={!isTouch}
              />
              <Input
                type="password"
                inputMode="numeric"
                value={confirmPassword}
                readOnly={isTouch}
                onClick={isTouch ? () => setKeyboardTarget({ field: 'confirmPassword', type: 'numeric' }) : undefined}
                onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, ''))}
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

      {/* Virtual Keyboard for touchscreen mode */}
      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type={keyboardTarget.type}
          value={getKeyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </div>
  )
}
