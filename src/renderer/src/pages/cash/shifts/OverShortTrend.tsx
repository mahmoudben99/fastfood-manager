import { useTranslation } from 'react-i18next'
import { Scale } from 'lucide-react'
import { Card, EmptyState, Money, Skeleton, cn } from '../../../components/ui'
import { fmtDate, useAsync } from '../cashShared'

/** Diverging CSS bar chart of the last closed shifts' over (up) / short (down) amounts. */
export function OverShortTrend({ version }: { version: number }) {
  const { t } = useTranslation()
  const list = useAsync(() => window.api.shifts.list({ limit: 60 }), [version])
  const closed = (list.data ?? [])
    .filter((s) => s.status === 'closed' && s.over_short !== null)
    .slice(0, 21)
    .reverse()
  const values = closed.map((s) => s.over_short as number)
  const max = Math.max(1, ...values.map((v) => Math.abs(v)))
  const net = values.reduce((a, v) => a + v, 0)
  const shortCount = values.filter((v) => v < 0).length
  const exactCount = values.filter((v) => v === 0).length

  return (
    <Card
      title={t('cashAdmin.trend.title')}
      subtitle={t('cashAdmin.trend.subtitle', { count: closed.length })}
      icon={<Scale />}
      actions={
        closed.length > 0 ? (
          <div className="hidden sm:flex items-center gap-5 text-end">
            <div>
              <p className="text-xs text-muted">{t('cashAdmin.trend.net')}</p>
              <p className={cn('text-base font-bold', net < 0 ? 'text-danger-ink' : 'text-ink')}><Money value={net} decimals={0} /></p>
            </div>
            <div>
              <p className="text-xs text-muted">{t('cashAdmin.trend.shortShifts')}</p>
              <p className="num text-base font-bold text-ink">{shortCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t('cashAdmin.trend.exactShifts')}</p>
              <p className="num text-base font-bold text-ink">{exactCount}</p>
            </div>
          </div>
        ) : undefined
      }
    >
      {list.loading && !list.data ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : closed.length === 0 ? (
        <EmptyState compact icon={<Scale />} title={t('cashAdmin.trend.emptyTitle')} />
      ) : (
        <div dir="ltr" className="relative">
          <div className="relative flex items-stretch gap-1.5 h-36" role="img" aria-label={t('cashAdmin.trend.title')}>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-line" aria-hidden="true" />
            {closed.map((s) => {
              const v = s.over_short as number
              const pct = (Math.abs(v) / max) * 82
              return (
                <div key={s.id} className="group flex-1 min-w-0 flex flex-col items-center" title={`#${s.id} · ${fmtDate(s.business_date)} · ${v}`}>
                  <div className="flex-1 w-full flex flex-col justify-end items-center">
                    {v > 0 && <span className="num text-[10px] font-semibold text-info-ink mb-0.5">+{v}</span>}
                    {v > 0 && <div className="w-full max-w-7 rounded-t-md bg-info" style={{ height: `${Math.max(pct, 4)}%` }} />}
                  </div>
                  <div className={cn('w-full max-w-7 h-[3px] rounded-full', v === 0 ? 'bg-success' : 'bg-line-strong')} />
                  <div className="flex-1 w-full flex flex-col justify-start items-center">
                    {v < 0 && <div className="w-full max-w-7 rounded-b-md bg-danger" style={{ height: `${Math.max(pct, 4)}%` }} />}
                    {v < 0 && <span className="num text-[10px] font-semibold text-danger-ink mt-0.5">{v}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-1.5 mt-2">
            {closed.map((s) => (
              <span key={s.id} className="num flex-1 min-w-0 text-center text-[10px] text-muted truncate">
                {fmtDate(s.business_date).slice(0, 5)}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted" dir="auto">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-info" />{t('cashAdmin.over')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger" />{t('cashAdmin.short')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" />{t('cashAdmin.exact')}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
