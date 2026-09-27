import { useTranslation } from 'react-i18next'
import { Eye } from 'lucide-react'
import { ReceiptPreview, type PreviewTemplate } from '../ReceiptPreview'

interface PreviewPanelProps {
  template: PreviewTemplate | null
  paperWidth: number
  refreshKey: number
}

/** Right panel of the Receipt Editor: the printer's own HTML for a sample order, on white paper. */
export function PreviewPanel({ template, paperWidth, refreshKey }: PreviewPanelProps) {
  const { t } = useTranslation()
  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border border-line bg-surface shadow-e1">
      <header className="flex items-center gap-3 border-b border-line px-5 pt-4 pb-3">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
          <Eye className="h-[18px] w-[18px]" />
        </span>
        <h3 className="min-w-0 truncate text-base font-semibold text-ink" title={template ? t('receiptEditor.previewSample') : t('receiptEditor.previewDefault')}>
          {t('receiptEditor.livePreview')}
        </h3>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-b-2xl bg-surface-3 p-5">
        <ReceiptPreview template={template} paperWidth={paperWidth} refreshKey={refreshKey} />
      </div>
    </section>
  )
}
