import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { Button, Input, Modal } from '../../../components/ui'
import { useTouchKeyboard } from '../useTouchKeyboard'

/** XXXXX-XXXXX-XXXXX-XXXXX, hex only. */
export const formatActivateCode = (value: string) => {
  const clean = value.replace(/[^A-Fa-f0-9-]/g, '').toUpperCase().replace(/-/g, '')
  const parts: string[] = []
  for (let i = 0; i < clean.length && i < 20; i += 5) parts.push(clean.slice(i, i + 5))
  return parts.join('-')
}

/** Trial users who later purchase: enter the serial for this machine ID. */
export function ActivateDialog({ machineId, onClose }: { machineId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const activate = async () => {
    setError('')
    setLoading(true)
    try {
      const result = await window.api.activation.activate(code)
      if (result.success) {
        onClose()
        window.location.reload()
      } else {
        setError(t('settings.activateInvalidCode'))
      }
    } catch {
      setError(t('settings.activateFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Modal
        isOpen
        onClose={() => { kb.close(); onClose() }}
        closeOnBackdrop={false}
        size="sm"
        title={t('settings.activateSoftware')}
        description={
          <>
            {t('settings.activateModalHint')} <span dir="ltr" className="font-mono text-ink">{machineId}</span>
          </>
        }
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => { kb.close(); onClose() }}>
              {t('common.cancel')}
            </Button>
            <Button
              size="lg"
              icon={<ShieldCheck className="h-5 w-5" />}
              onClick={() => { void activate() }}
              loading={loading}
              disabled={code.length < 23}
            >
              {t('settings.activate')}
            </Button>
          </>
        }
      >
        <Input
          inputSize="lg"
          dir="ltr"
          maxLength={23}
          autoFocus={!kb.isTouch}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          aria-label={t('settings.activateSoftware')}
          className="font-mono tracking-wider text-center uppercase"
          error={error}
          {...kb.bind('activateCode', code, setCode, { transform: formatActivateCode, extended: false })}
        />
      </Modal>
      {kb.keyboard()}
    </>
  )
}
