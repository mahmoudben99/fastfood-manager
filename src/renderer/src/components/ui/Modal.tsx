import { ReactNode, useEffect, useId } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  /** One line under the title. */
  description?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  zIndex?: number
  /** Sticky action row (buttons end-aligned). */
  footer?: ReactNode
  /** Tap on the dimmed backdrop closes (default true). Turn off for forms with unsaved input. */
  closeOnBackdrop?: boolean
  hideCloseButton?: boolean
  className?: string
  children: ReactNode
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  zIndex = 50,
  footer,
  closeOnBackdrop = true,
  hideCloseButton = false,
  className = '',
  children
}: ModalProps) {
  const { t } = useTranslation()
  const titleId = useId()

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div
        className="fixed inset-0 bg-overlay animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative w-full max-h-[90vh] flex flex-col rounded-2xl bg-surface border border-line shadow-e4 animate-pop-in',
          sizeClasses[size],
          className
        )}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-bold text-ink leading-snug">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="tap -me-2 -mt-1 h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-line bg-surface-2/60 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
