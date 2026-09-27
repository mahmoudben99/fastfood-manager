import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, CheckCircle2, FolderOpen, FolderOutput, Info } from 'lucide-react'
import { Button, Card, EmptyState, cn, toast } from '../../components/ui'
import type { ArchiveExportResult, FiscalStatus } from '../../../../shared/fiscal'

/** Yearly archive export (JSON + CSV + SHA-256 manifest) into a folder the owner picks. */
export function ArchiveCard({ status }: { status: FiscalStatus | null }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Extract<ArchiveExportResult, { ok: true }> | null>(null)
  const years = status?.years ?? []
  const all = selected.length === 0
  const orders = (value: Extract<ArchiveExportResult, { ok: true }>): number => value.years.reduce((sum, year) => sum + year.orders, 0)

  const toggle = (year: number): void =>
    setSelected(selected.includes(year) ? selected.filter((y) => y !== year) : [...selected, year])
  const chip = (active: boolean): string => cn(
    'tap min-h-10 rounded-full px-4 text-sm font-semibold border num',
    active ? 'bg-inverse text-on-inverse border-transparent' : 'bg-surface text-ink-2 border-line-strong hover:bg-surface-2'
  )

  const exportArchive = async (): Promise<void> => {
    setBusy(true)
    try {
      const outcome = await window.api.fiscal.exportArchive(all ? undefined : selected)
      if (outcome.ok) {
        setResult(outcome)
        toast.success(t('compliance.archive.done'), { description: t('compliance.archive.doneDetail', { count: outcome.years.length, orders: orders(outcome) }) })
      } else if (!outcome.canceled) {
        toast.error(t('compliance.archive.failed'), { description: outcome.error })
      }
    } catch (error) {
      toast.error(t('compliance.archive.failed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('compliance.archive.title')} icon={<Archive />}>
      {status && years.length === 0 ? (
        <EmptyState compact icon={<Archive />} title={t('compliance.archive.none')} description={t('compliance.archive.noneHint')} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5 text-sm">
            <p className="text-ink-2">{t('compliance.archive.subtitle')}</p>
            <p className="flex items-start gap-1.5 text-muted">
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              {t('compliance.archive.retention')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('compliance.archive.title')}>
            <button type="button" aria-pressed={all} className={chip(all)} onClick={() => setSelected([])}>
              {t('compliance.archive.allYears')}
            </button>
            {years.map((year) => (
              <button key={year} type="button" aria-pressed={selected.includes(year)} className={chip(selected.includes(year))} onClick={() => toggle(year)}>
                {year}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="lg" icon={<FolderOutput />} loading={busy} onClick={() => void exportArchive()} fullWidth>
            {t('compliance.archive.export')}
          </Button>
          {result && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success-ink">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-semibold">{t('compliance.archive.doneDetail', { count: result.years.length, orders: orders(result) })}</span>
              <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={result.folder}>{result.folder}</code>
              <Button size="sm" variant="ghost" icon={<FolderOpen />} onClick={() => void window.api.fiscal.reveal(result.years[0]?.folder ?? result.folder)}>
                {t('compliance.archive.show')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
