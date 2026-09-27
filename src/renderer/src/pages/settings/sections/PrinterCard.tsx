import { useTranslation } from 'react-i18next'
import { Check, Printer, Trash2 } from 'lucide-react'
import { Button, Card, Field, IconButton, SegmentedControl, Select, Toggle, cn } from '../../../components/ui'
import { InfoNote } from '../SettingsFeedback'
import type { PrinterConfig, PrinterSettings } from '../hooks/usePrinterSettings'

type FontSize = 'small' | 'medium' | 'large'

interface PrinterCardProps {
  config: PrinterConfig
  index: number
  p: PrinterSettings
}

/** One configured printer: device, jobs it prints, paper/font, auto-print and a test print. */
export function PrinterCard({ config, index, p }: PrinterCardProps) {
  const { t } = useTranslation()
  const missing = p.isMissing(config.printerName)
  const result = p.testResults[config.id]
  const fontOptions = [
    { value: 'small' as FontSize, label: t('settings.fontSmall') },
    { value: 'medium' as FontSize, label: t('settings.fontMedium') },
    { value: 'large' as FontSize, label: t('settings.fontLarge') }
  ]

  const printerOptions = [
    { value: '', label: t('settings.selectPrinter') },
    // A saved printer that is no longer installed keeps its value, labelled as missing.
    ...(missing ? [{ value: config.printerName, label: t('settings.printerNotFound', { name: config.printerName }) }] : []),
    ...p.printers.map((pr) => ({
      value: pr.name,
      label: `${pr.name}${pr.isDefault ? ` ${t('settings.defaultSuffix')}` : ''}`
    }))
  ]

  return (
    <Card
      title={t('settings.printerLabel', { n: index + 1 })}
      icon={<Printer />}
      actions={
        <IconButton
          icon={<Trash2 />}
          label={t('settings.removePrinter')}
          variant="danger"
          onClick={() => p.remove(config.id)}
        />
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Select
            label={t('settings.printerName')}
            value={config.printerName}
            onChange={(e) => p.update(config.id, { printerName: e.target.value })}
            options={printerOptions}
          />
          {missing && <InfoNote tone="warning">{t('settings.printerNotFoundWarning')}</InfoNote>}
        </div>

        <Field label={t('settings.printTasks')}>
          <div className="flex flex-wrap gap-2">
            {p.availableTasks().map((task) => {
              const on = config.tasks.includes(task.value)
              return (
                <button
                  key={task.value}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => p.toggleTask(config.id, task.value)}
                  className={cn(
                    'tap inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold',
                    on
                      ? 'bg-primary-soft text-primary-ink border-primary/40'
                      : 'bg-surface text-ink-2 border-line hover:bg-surface-2'
                  )}
                >
                  <span
                    className={cn(
                      'h-5 w-5 shrink-0 rounded-md border flex items-center justify-center',
                      on ? 'bg-primary border-primary text-on-primary' : 'border-line-strong bg-surface'
                    )}
                    aria-hidden="true"
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  {task.label}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('settings.paperWidth')}>
            <SegmentedControl
              fullWidth
              ariaLabel={t('settings.paperWidth')}
              value={config.paperWidth}
              onChange={(v) => p.update(config.id, { paperWidth: v })}
              options={[
                { value: '58', label: <span className="num">58 mm</span> },
                { value: '80', label: <span className="num">80 mm</span> }
              ]}
            />
          </Field>
          <Field label={t('settings.receiptFont')}>
            <SegmentedControl<FontSize>
              fullWidth
              ariaLabel={t('settings.receiptFont')}
              value={config.receiptFontSize as FontSize}
              onChange={(v) => p.update(config.id, { receiptFontSize: v })}
              options={fontOptions}
            />
          </Field>
          <Field label={t('settings.kitchenFont')}>
            <SegmentedControl<FontSize>
              fullWidth
              ariaLabel={t('settings.kitchenFont')}
              value={config.kitchenFontSize as FontSize}
              onChange={(v) => p.update(config.id, { kitchenFontSize: v })}
              options={fontOptions}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
          <div className="min-w-60 flex-1">
            <Toggle
              checked={config.autoPrint}
              onChange={(v) => p.update(config.id, { autoPrint: v })}
              label={t('settings.autoPrintOnNewOrder')}
            />
          </div>
          <Button
            variant="secondary"
            size="lg"
            icon={<Printer className="h-5 w-5" />}
            onClick={() => { void p.testPrint(config.id, config.printerName) }}
            loading={p.testingIds.has(config.id)}
            disabled={!config.printerName}
            cooldownMs={800}
          >
            {t('settings.testPrint')}
          </Button>
        </div>

        {result && (
          <InfoNote tone={result.success ? 'success' : 'danger'}>
            {result.success
              ? t('settings.testPrintSentTo', { name: result.printerName || config.printerName })
              : result.error || t('settings.printFailed')}
          </InfoNote>
        )}
      </div>
    </Card>
  )
}
