import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal } from '../../../components/ui'
import { ipcErrorMessage } from '../../../utils/ipcError'
import { InfoNote } from '../SettingsFeedback'
import { digitsOnly, useTouchKeyboard } from '../useTouchKeyboard'

interface TabletPinDialogProps {
  /** 'enable' = opened by switching PIN protection on: it only turns on once a valid PIN is saved. */
  mode: 'change' | 'enable'
  onClose: () => void
  /** Called after the PIN was stored (and protection enabled in 'enable' mode). */
  onSaved: () => void
}

const pin4 = (v: string) => digitsOnly(v).slice(0, 4)

/** Set / change the 4-digit PIN waiters type on the LAN tablet order page. */
export function TabletPinDialog({ mode, onClose, onSaved }: TabletPinDialogProps) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      setError(t('settings.pinMustBe4Digits'))
      return
    }
    if (newPin !== confirmPin) {
      setError(t('settings.pinMismatch'))
      return
    }
    setSaving(true)
    try {
      const result = await window.api.tablet.setPin(newPin)
      if (!result.ok) {
        setError(result.error || t('settings.pinError'))
        return
      }
      if (mode === 'enable') await window.api.tablet.setPinEnabled(true)
      onSaved()
    } catch (err) {
      setError(ipcErrorMessage(err) || t('settings.pinError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      size="sm"
      title={mode === 'enable' ? t('settings.tabletPinSetTitle') : t('settings.tabletPinModalTitle')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" onClick={() => { void save() }} loading={saving} disabled={newPin.length !== 4}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InfoNote tone="warning">
          {mode === 'enable' ? t('settings.tabletPinSetHint') : t('settings.tabletPinModalWarning')}
        </InfoNote>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          inputSize="lg"
          dir="ltr"
          autoFocus={!kb.isTouch}
          label={t('settings.tabletPinNew')}
          className="num tracking-[0.5em] text-center"
          {...kb.bind('newPin', newPin, (v) => { setNewPin(v); setError('') }, { type: 'numeric', transform: pin4 })}
        />
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          inputSize="lg"
          dir="ltr"
          label={t('settings.tabletPinConfirm')}
          className="num tracking-[0.5em] text-center"
          error={error}
          {...kb.bind('confirmPin', confirmPin, (v) => { setConfirmPin(v); setError('') }, { type: 'numeric', transform: pin4 })}
        />
      </div>
    </Modal>
    {kb.keyboard()}
    </>
  )
}
