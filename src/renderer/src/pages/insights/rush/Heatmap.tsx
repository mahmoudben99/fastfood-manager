import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RushHourCell, RushHoursReport } from '../../../../../shared/insights'
import { Money, cn } from '../../../components/ui'
import { WEEK_ORDER, formatNumber, hourRange } from '../shared/format'

/** Cell tint: 6 % → 88 % ember over the sunken surface (works in both themes). */
function tint(ratio: number): string {
  const pct = Math.round(6 + 82 * Math.min(1, Math.max(0, ratio)))
  return `color-mix(in oklab, var(--primary) ${pct}%, var(--surface-2))`
}

/**
 * Weekday × hour grid of average orders (CSS grid, no chart library). Hours run left→right in
 * every language; tap or hover a cell for its numbers.
 */
export function Heatmap({ report }: { report: RushHoursReport }) {
  const { t } = useTranslation()
  const [focus, setFocus] = useState<RushHourCell | null>(null)
  const { hours, byKey, max } = useMemo(() => {
    const hoursSeen = report.cells.map((c) => c.hour)
    const from = Math.min(...hoursSeen)
    const to = Math.max(...hoursSeen)
    const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
    const byKey = new Map(report.cells.map((c) => [`${c.weekday}:${c.hour}`, c]))
    return { hours, byKey, max: Math.max(...report.cells.map((c) => c.avgOrders), 0.01) }
  }, [report])
  const shown = focus ?? report.best[0] ?? null

  return (
    <div>
      <div dir="ltr" className="overflow-x-auto">
        <div
          className="grid gap-1 min-w-[36rem]"
          style={{ gridTemplateColumns: `5.5rem repeat(${hours.length}, minmax(1.75rem, 1fr))` }}
          onMouseLeave={() => setFocus(null)}
        >
          <div />
          {hours.map((h) => (
            <div key={h} className="num pb-1 text-center text-[11px] font-medium text-faint">{String(h).padStart(2, '0')}</div>
          ))}
          {WEEK_ORDER.map((weekday) => (
            <div key={weekday} className="contents">
              <div dir="auto" className={cn('flex items-center pe-2 text-xs font-semibold', report.openDays[weekday] ? 'text-ink-2' : 'text-faint')}>
                <span className="truncate">{t(`days.${weekday}`)}</span>
              </div>
              {hours.map((hour) => {
                const cell = byKey.get(`${weekday}:${hour}`)
                const ratio = cell ? cell.avgOrders / max : 0
                const active = focus === cell && cell !== undefined
                return (
                  <button
                    key={hour}
                    type="button"
                    disabled={!cell}
                    onMouseEnter={() => cell && setFocus(cell)}
                    onFocus={() => cell && setFocus(cell)}
                    onClick={() => cell && setFocus(cell)}
                    className={cn(
                      'num h-9 rounded-md text-[11px] font-semibold flex items-center justify-center',
                      cell ? 'cursor-pointer' : 'cursor-default',
                      ratio >= 0.62 ? 'text-white' : 'text-ink-2',
                      active && 'ring-2 ring-ink'
                    )}
                    style={{ background: cell ? tint(ratio) : 'var(--surface-2)', opacity: cell ? 1 : 0.55 }}
                    aria-label={cell ? `${t(`days.${weekday}`)} ${hourRange(hour, hour + 1)}: ${formatNumber(cell.avgOrders)}` : undefined}
                  >
                    {cell && cell.avgOrders >= 0.5 ? formatNumber(cell.avgOrders, cell.avgOrders >= 10 ? 0 : 1) : ''}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-h-10 text-sm">
          {shown && (
            <p className="text-ink-2">
              <span className="font-semibold text-ink">{t(`days.${shown.weekday}`)} · <bdi dir="ltr">{hourRange(shown.hour, shown.hour + 1)}</bdi></span>
              {' — '}
              {t('insights.rush.cellDetail', { orders: formatNumber(shown.avgOrders) })}
              {' · '}
              {t('insights.rush.avgTicket')} <Money value={shown.avgTicket} decimals={0} className="font-semibold text-ink" />
            </p>
          )}
        </div>
        <div dir="ltr" className="flex items-center gap-2 text-xs text-muted">
          <bdi>{t('insights.rush.quiet')}</bdi>
          <span className="flex gap-0.5">
            {[0.05, 0.25, 0.45, 0.65, 0.85, 1].map((r) => (
              <span key={r} className="h-3 w-5 rounded-sm" style={{ background: tint(r) }} />
            ))}
          </span>
          <bdi>{t('insights.rush.busy')}</bdi>
        </div>
      </div>
    </div>
  )
}
