import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  error?: string
  zIndex?: number
}

/** In-app confirmation (window.confirm is blocked in the Electron renderer and looks foreign). */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  error,
  zIndex
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onCancel} title={title} size="sm" zIndex={zIndex}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">{message}</p>
        {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} className="flex-1">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
