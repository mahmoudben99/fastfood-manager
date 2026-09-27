import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Copy, Info } from 'lucide-react'
import { Button, IconButton, Modal, cn } from '../../components/ui'

/* Shared building blocks for the Settings sections and the Receipt Editor (v4 Ember kit). */

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
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onCancel}
      size="sm"
      zIndex={100}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" size="lg" onClick={onDiscard} disabled={saving}>
            {t('settings.unsavedDiscard')}
          </Button>
          <Button size="lg" onClick={onSave} loading={saving}>
            {t('settings.unsavedSave')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4" role="alertdialog" aria-label={t('settings.unsavedTitle')}>
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-warning-soft text-warning-ink flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-lg font-bold text-ink leading-snug">{t('settings.unsavedTitle')}</h2>
          <p className="mt-1 text-sm text-muted leading-relaxed">{t('settings.unsavedMessage')}</p>
        </div>
      </div>
    </Modal>
  )
}

interface SaveBarProps {
  dirty: boolean
  saving?: boolean
  error?: string
  onSave: () => void
  onDiscard?: () => void
}

/** Sticky footer of a form section: state on the start side, Discard + Save at the end. */
export function SaveBar({ dirty, saving, error, onSave, onDiscard }: SaveBarProps) {
  const { t } = useTranslation()
  // Contextual: only appears once something changed (or a save failed).
  if (!dirty && !error) return null
  return (
    <div className="sticky bottom-4 z-10 mt-6 animate-slide-in-up">
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-2xl border border-line-strong bg-surface px-4 py-3 shadow-e3'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-sm" role="status">
          {error ? (
            <>
              <AlertCircle className="h-5 w-5 shrink-0 text-danger-ink" />
              <span className="font-medium text-danger-ink">{error}</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span className="font-semibold text-ink">{t('settings.unsavedTitle')}</span>
            </>
          )}
        </div>
        {dirty && onDiscard && (
          <Button variant="ghost" size="lg" onClick={onDiscard} disabled={saving}>
            {t('settings.unsavedDiscard')}
          </Button>
        )}
        <Button size="lg" onClick={onSave} loading={saving} disabled={!dirty} cooldownMs={600} className="min-w-32">
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

type NoteTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral'

const noteTones: Record<NoteTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-info-soft text-info-ink', icon: <Info /> },
  warning: { box: 'bg-warning-soft text-warning-ink', icon: <AlertTriangle /> },
  danger: { box: 'bg-danger-soft text-danger-ink', icon: <AlertCircle /> },
  success: { box: 'bg-success-soft text-success-ink', icon: <CheckCircle2 /> },
  neutral: { box: 'bg-surface-2 text-ink-2 border border-line', icon: <Info /> }
}

/** Inline status / hint banner (icon + text, never colour alone). */
export function InfoNote({
  tone = 'info',
  title,
  children,
  icon,
  className
}: {
  tone?: NoteTone
  title?: ReactNode
  children?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  const style = noteTones[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn('flex items-start gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed', style.box, className)}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon ?? style.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}

/** Read-only value (link, machine ID) in a sunken monospace well with a copy button. */
export function CopyField({ value, display, copyLabel }: { value: string; display?: ReactNode; copyLabel: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center gap-2">
      <div
        dir="ltr"
        className="flex-1 min-w-0 min-h-11 flex items-center rounded-xl border border-line bg-surface-2 px-3.5 font-mono text-sm text-ink select-all"
      >
        <span className="truncate">{display ?? value}</span>
      </div>
      <IconButton
        icon={copied ? <Check className="text-success-ink" /> : <Copy />}
        label={copyLabel}
        variant="secondary"
        size="md"
        onClick={copy}
      />
    </div>
  )
}

interface ChoiceCardProps {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  /** Visual preview above the label row (theme swatch, text sample…). */
  preview?: ReactNode
  className?: string
}

/** Large tappable radio card (theme, density, input mode). */
export function ChoiceCard({ selected, onSelect, title, description, icon, preview, className }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'tap flex flex-col gap-3 rounded-2xl border p-3.5 text-start',
        selected
          ? 'border-primary bg-primary-soft ring-2 ring-primary/20'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
        className
      )}
    >
      {preview}
      <span className="flex w-full items-center gap-3">
        {icon && (
          <span
            className={cn(
              'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5',
              selected ? 'bg-ember text-on-primary' : 'bg-surface-2 text-ink-2'
            )}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {description && <span className="mt-0.5 block text-xs text-muted leading-snug">{description}</span>}
        </span>
        <span
          className={cn(
            'h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center',
            selected ? 'border-primary bg-primary' : 'border-line-strong bg-surface'
          )}
          aria-hidden="true"
        >
          {selected && <Check className="h-3 w-3 text-on-primary" strokeWidth={3.5} />}
        </span>
      </span>
    </button>
  )
}
