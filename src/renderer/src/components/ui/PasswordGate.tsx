import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'

interface PasswordGateProps {
  onUnlock: () => void
  onCancel: () => void
}

export function PasswordGate({ onUnlock, onCancel }: PasswordGateProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4">
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
      </div>
    </div>
  )
}
