import { useTranslation } from 'react-i18next'
import { ChevronRight, LayoutTemplate, Plus, Printer } from 'lucide-react'
import { Button, Card, EmptyState } from '../../../components/ui'
import { InfoNote, SaveBar } from '../SettingsFeedback'
import type { PrinterSettings } from '../hooks/usePrinterSettings'
import { PrinterCard } from './PrinterCard'

interface PrinterSectionProps {
  p: PrinterSettings
  onOpenReceiptEditor: () => void
}

/** Settings > Printers: one card per printer + the Receipt Editor entry point. */
export function PrinterSection({ p, onOpenReceiptEditor }: PrinterSectionProps) {
  const { t } = useTranslation()

  return (
    <div>
      {p.configs.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" size="lg" icon={<Plus className="h-5 w-5" />} onClick={p.add}>
            {t('settings.addPrinter')}
          </Button>
        </div>
      )}

      <div className="space-y-5">
        {p.loaded && p.printers.length === 0 && <InfoNote tone="warning">{t('settings.noPrintersDetected')}</InfoNote>}

        {p.configs.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon={<Printer />}
              title={t('settings.noPrintersConfigured')}
              description={t('settings.v4.addPrinterHint')}
              action={
                <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={p.add}>
                  {t('settings.addPrinter')}
                </Button>
              }
            />
          </Card>
        ) : (
          p.configs.map((config, index) => <PrinterCard key={config.id} config={config} index={index} p={p} />)
        )}

        <button
          type="button"
          onClick={onOpenReceiptEditor}
          className="tap group flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-start shadow-e1 hover:border-line-strong hover:shadow-e2"
        >
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-primary-soft text-primary-ink flex items-center justify-center">
            <LayoutTemplate className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-ink">{t('settings.receiptEditor')}</span>
            <span className="mt-0.5 block text-sm text-muted">{t('settings.v4.receiptEditorDesc')}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted rtl:-scale-x-100" />
        </button>
      </div>

      {/* Always available: saving an empty list removes the last printer. */}
      <SaveBar
        dirty={p.isDirty}
        saving={p.saving}
        error={p.saveError}
        onSave={() => { void p.save() }}
        onDiscard={p.discard}
      />
    </div>
  )
}
