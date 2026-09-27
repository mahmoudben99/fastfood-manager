import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { cn } from './cn'

type ConfirmTone = 'danger' | 'warning' | 'primary'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  error?: string
  zIndex?: number
  /** danger (default, delete/void) · warning (irreversible but not destructive) · primary */
  tone?: ConfirmTone
  icon?: ReactNode
}

const toneStyles: Record<ConfirmTone, { tile: string; icon: ReactNode; button: 'danger' | 'primary' }> = {
  danger: { tile: 'bg-danger-soft text-danger-ink', icon: <Trash2 />, button: 'danger' },
  warning: { tile: 'bg-warning-soft text-warning-ink', icon: <AlertTriangle />, button: 'primary' },
  primary: { tile: 'bg-primary-soft text-primary-ink', icon: <HelpCircle />, button: 'primary' }
}

/**
 * App-wide confirmation (window.confirm is blocked/foreign in Electron). Only for destructive,
 * non-undoable actions (void a paid order, delete). For reversible actions prefer an Undo toast.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  error,
  zIndex = 100,
  tone = 'danger',
  icon
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const style = toneStyles[tone]
  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onCancel}
      size="sm"
      zIndex={zIndex}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={busy} className="flex-1">
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={style.button} size="lg" onClick={onConfirm} loading={busy} className="flex-1">
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4" role="alertdialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className={cn('h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center [&_svg]:h-6 [&_svg]:w-6', style.tile)}>
          {icon ?? style.icon}
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-lg font-bold text-ink leading-snug">{title}</h2>
          <div className="mt-1 text-sm text-muted leading-relaxed">{message}</div>
        </div>
      </div>
      {error && <p className="mt-4 text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
    </Modal>
  )
}
