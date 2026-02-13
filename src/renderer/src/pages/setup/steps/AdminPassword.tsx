import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield } from 'lucide-react'
import { Input } from '../../../components/ui/Input'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

export function AdminPassword({ data, updateData }: Props) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState('')

  const passwordError =
    data.password.length > 0 && data.password.length < 4 ? t('setup.password.tooShort') : ''

  const confirmError =
    confirm.length > 0 && confirm !== data.password ? t('setup.password.mismatch') : ''

  const handlePasswordChange = (value: string) => {
    updateData({ password: value })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-orange-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.password.title')}</h2>
        <p className="text-gray-500 mt-1">{t('setup.password.subtitle')}</p>
      </div>

      <div className="bg-white rounded-xl p-6 space-y-5 shadow-sm max-w-md mx-auto">
        <Input
          type="password"
          label={t('setup.password.password')}
          value={data.password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          error={passwordError}
        />
        <Input
          type="password"
          label={t('setup.password.confirm')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirmError}
        />
      </div>
    </div>
  )
}
