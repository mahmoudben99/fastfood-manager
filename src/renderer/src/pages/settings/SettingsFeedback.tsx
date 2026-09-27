import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, AlertCircle } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

/** Page-local toast, same look as the other in-app toasts (fixed top corner, auto-hides). */
export function useToast() {
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((kind: 'success' | 'error', text: string) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ kind, text })
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const toastView = toast ? (
    <div
      role="status"
      className={`fixed top-4 end-4 z-[999] max-w-sm flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
        toast.kind === 'success' ? 'bg-green-500' : 'bg-red-500'
      }`}
    >
      {toast.kind === 'success' ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
      <span>{toast.text}</span>
    </div>
  ) : null

  return { showToast, toastView }
}

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** In-app confirmation (window.confirm is unreliable in Electron). */
export function ConfirmDialog({ isOpen, title, message, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm" zIndex={100}>
      <div className="text-center py-4">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <div className="text-sm text-gray-600">{message}</div>
      </div>
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          {t('common.cancel')}
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={busy} className="flex-1">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

interface UnsavedChangesDialogProps {
  isOpen: boolean
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** Save / Discard / Cancel prompt shown before leaving a screen with unsaved edits. */
export function UnsavedChangesDialog({ isOpen, saving, onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t('settings.unsavedTitle')} size="sm" zIndex={100}>
      <div className="flex items-start gap-3 py-2">
        <AlertTriangle className="h-6 w-6 text-orange-500 shrink-0" />
        <p className="text-sm text-gray-600">{t('settings.unsavedMessage')}</p>
      </div>
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="secondary" onClick={onCancel} className="flex-1" disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" onClick={onDiscard} className="flex-1" disabled={saving}>
          {t('settings.unsavedDiscard')}
        </Button>
        <Button onClick={onSave} loading={saving} className="flex-1">
          {t('settings.unsavedSave')}
        </Button>
      </div>
    </Modal>
  )
}
