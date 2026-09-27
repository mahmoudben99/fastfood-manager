import { useTranslation } from 'react-i18next'
import { Check, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Button, IconButton, cn } from '../../../components/ui'

export interface Template {
  id: number
  name: string
  is_active: number
  blocks: string
}

interface TemplateBarProps {
  templates: Template[]
  activeTemplate: Template | null
  currentTemplateId: number | null
  /** Editor shows the built-in default receipt (no template loaded, no blocks). */
  showingDefault: boolean
  isDirty: boolean
  isTouch: boolean
  onShowDefault: () => void
  onLoad: (tmpl: Template) => void
  onDelete: (tmpl: Template) => void
  onUseDefault: () => void
  onActivateCurrent: () => void
}

/** Saved layouts as pills + which one the receipt printer uses right now. */
export function TemplateBar({
  templates,
  activeTemplate,
  currentTemplateId,
  showingDefault,
  isDirty,
  isTouch,
  onShowDefault,
  onLoad,
  onDelete,
  onUseDefault,
  onActivateCurrent
}: TemplateBarProps) {
  const { t } = useTranslation()
  const pill = (selected: boolean) =>
    cn(
      'tap inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold',
      isTouch ? 'min-h-12' : 'min-h-10',
      selected ? 'bg-primary-soft text-primary-ink border-primary/40' : 'bg-surface text-ink-2 border-line hover:bg-surface-2'
    )
  const canActivate = currentTemplateId !== null && !isDirty && activeTemplate?.id !== currentTemplateId
  const printing = (
    <Badge variant="success" icon={<Check />}>
      {t('receiptEditor.active')}
    </Badge>
  )

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-e1">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        <span className="shrink-0 pe-1 text-xs font-bold uppercase tracking-wider text-muted rtl:normal-case rtl:tracking-normal">
          {t('receiptEditor.templates').replace(/[:：]\s*$/, '')}
        </span>
        <button type="button" className={pill(showingDefault)} onClick={onShowDefault}>
          {t('receiptEditor.defaultReceipt')}
          {!activeTemplate && printing}
        </button>
        {templates.map((tm) => (
          <span key={tm.id} className="inline-flex shrink-0 items-center gap-0.5">
            <button type="button" className={pill(currentTemplateId === tm.id)} onClick={() => onLoad(tm)}>
              <bdi>{tm.name}</bdi>
              {tm.is_active ? printing : null}
            </button>
            <IconButton
              icon={<Trash2 />}
              label={t('receiptEditor.deleteTemplate')}
              variant="danger"
              size={isTouch ? 'lg' : 'sm'}
              onClick={() => onDelete(tm)}
            />
          </span>
        ))}
      </div>
      {(activeTemplate || canActivate) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {activeTemplate && (
            <Button variant="secondary" size={isTouch ? 'lg' : 'md'} icon={<RotateCcw className="h-4 w-4" />} onClick={onUseDefault}>
              {t('receiptEditor.useDefault')}
            </Button>
          )}
          {canActivate && (
            <Button variant="soft" size={isTouch ? 'lg' : 'md'} icon={<Check className="h-4 w-4" />} onClick={onActivateCurrent}>
              {t('receiptEditor.useThisTemplate')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
