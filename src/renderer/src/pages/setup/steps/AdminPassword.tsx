import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, ShieldCheck } from 'lucide-react'
import { Input } from '../../../components/ui/Input'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { StepLayout } from '../parts/StepLayout'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
  /** Confirmation PIN, owned by the wizard so it survives Back/Next and gates Next. */
  confirm: string
  onConfirmChange: (value: string) => void
}

export function AdminPassword({ data, updateData, confirm, onConfirmChange }: Props) {
  const { t } = useTranslation()
  const isTouch = data.inputMode === 'touchscreen'

  // Virtual keyboard state
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' } | null>(null)

  const passwordError =
    data.password.length > 0 && data.password.length < 4 ? t('setup.password.tooShort') : ''

  const confirmError =
    confirm.length > 0 && confirm !== data.password ? t('setup.password.mismatch') : ''

  const matches = data.password.length >= 4 && confirm === data.password

  const handlePasswordChange = (value: string) => {
    updateData({ password: value.replace(/\D/g, '') })
  }

  const getKeyboardValue = (): string => {
    if (!keyboardTarget) return ''
    return keyboardTarget.field === 'password' ? data.password : confirm
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    const digits = val.replace(/\D/g, '')
    if (keyboardTarget.field === 'password') {
      updateData({ password: digits })
    } else {
      onConfirmChange(digits)
    }
  }

  const pinClass = `num text-center text-xl tracking-[0.4em] ${isTouch ? 'cursor-pointer' : ''}`

  return (
    <StepLayout icon={<ShieldCheck />} title={t('setup.password.title')}>
      <div className="mx-auto max-w-md space-y-4">
        <Input
          type="password"
          inputMode="numeric"
          dir="ltr"
          inputSize="lg"
          autoComplete="new-password"
          label={t('setup.password.password')}
          value={data.password}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardTarget({ field: 'password', type: 'numeric' }) : undefined}
          onChange={(e) => handlePasswordChange(e.target.value)}
          error={passwordError}
          helperText={t('setup.password.hint')}
          className={pinClass}
        />
        <Input
          type="password"
          inputMode="numeric"
          dir="ltr"
          inputSize="lg"
          autoComplete="new-password"
          label={t('setup.password.confirm')}
          value={confirm}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardTarget({ field: 'confirm', type: 'numeric' }) : undefined}
          onChange={(e) => onConfirmChange(e.target.value.replace(/\D/g, ''))}
          error={confirmError}
          className={pinClass}
        />
        {matches && (
          <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold text-success-ink">
            <CircleCheck className="h-5 w-5" aria-hidden />
            {t('setup.password.match')}
          </p>
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
    </StepLayout>
  )
}
