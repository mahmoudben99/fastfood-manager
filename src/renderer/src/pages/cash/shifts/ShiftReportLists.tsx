import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Bike, Percent, Trash2 } from 'lucide-react'
import type { ShiftReport, ShiftReportLine } from '../../../../../shared/shift-report'
import { Money, cn } from '../../../components/ui'
import { OverShort, SectionLabel, fmtTime } from '../cashShared'

/** Ranked list; bars follow the backend's ranking key (items: quantity, categories: revenue). */
function Ranked({ title, lines, tone, by }: { title: string; lines: ShiftReportLine[]; tone: 'ember' | 'soft'; by: 'quantity' | 'revenue' }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...lines.map((l) => l[by]))
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <SectionLabel>{title}</SectionLabel>
      {lines.length === 0 ? (
        <p className="text-sm text-muted py-2">{t('cashAdmin.report.nothingSold')}</p>
      ) : (
        <ol className="space-y-3">
          {lines.slice(0, 8).map((line, i) => (
            <li key={`${line.name}-${i}`} className="flex items-center gap-3">
              <span className="num w-5 text-sm font-bold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink truncate">
                    <bdi>{line.name}</bdi> <span className="num text-xs font-medium text-muted">× {line.quantity}</span>
                  </span>
                  <span className="text-sm font-bold text-ink"><Money value={line.revenue} decimals={0} /></span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', i === 0 ? (tone === 'ember' ? 'bg-ember' : 'bg-primary') : 'bg-primary-soft-2')}
                    style={{ width: `${(line[by] / max) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Audit({ icon, title, count, amount, children, tone }: {
  icon: ReactNode; title: string; count: number; amount: number; children?: ReactNode; tone: 'danger' | 'warning' | 'info'
}) {
  const tile = { danger: 'bg-danger-soft text-danger-ink', warning: 'bg-warning-soft text-warning-ink', info: 'bg-info-soft text-info-ink' }[tone]
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        <span className={cn('h-9 w-9 shrink-0 rounded-xl flex items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]', count > 0 ? tile : 'bg-surface-2 text-muted')}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted truncate">{title}</p>
          <p className="text-base font-bold text-ink">
            <span className="num">{count}</span>
            {count > 0 && <span className="text-sm font-semibold text-ink-2"> · <Money value={amount} decimals={0} /></span>}
          </p>
        </div>
      </div>
      {count > 0 && children && <ul className="space-y-1.5 text-sm max-h-44 overflow-y-auto">{children}</ul>}
    </section>
  )
}

const Line = ({ left, right }: { left: ReactNode; right: ReactNode }) => (
  <li className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-1.5">
    <span className="min-w-0 truncate text-ink-2">{left}</span>
    <span className="shrink-0 font-semibold text-ink">{right}</span>
  </li>
)

/** Top items / categories, then the anti-theft audit: discounts, cancellations, voids, drivers. */
export function ShiftReportLists({ report }: { report: ShiftReport }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-4">
        <Ranked title={t('cashAdmin.report.topItems')} lines={report.top_items} tone="ember" by="quantity" />
        <Ranked title={t('cashAdmin.report.categories')} lines={report.categories} tone="soft" by="revenue" />
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Audit icon={<Percent />} tone="warning" title={t('cashAdmin.report.discounts')} count={report.discounts.count} amount={report.discounts.amount}>
          {report.discounts.by_cashier.map((d) => (
            <Line key={d.cashier} left={<><bdi>{d.cashier}</bdi> <span className="num text-muted">× {d.count}</span></>} right={<Money value={d.amount} decimals={0} />} />
          ))}
        </Audit>
        <Audit icon={<Ban />} tone="danger" title={t('cashAdmin.report.cancellations')} count={report.cancellations.count} amount={report.cancellations.amount}>
          {report.cancellations.list.map((c) => (
            <Line
              key={c.order_id}
              left={<><span className="num font-semibold">#{c.daily_number}</span> <span className="num text-muted">{fmtTime(c.at)}</span> · <bdi>{c.by}</bdi>{c.reason ? <> · <bdi className="text-muted">{c.reason}</bdi></> : null}</>}
              right={<Money value={c.total} decimals={0} />}
            />
          ))}
        </Audit>
        <Audit icon={<Trash2 />} tone="danger" title={t('cashAdmin.report.voids')} count={report.voids.count} amount={report.voids.amount}>
          {report.voids.list.map((v, i) => (
            <Line
              key={`${v.order_id}-${i}`}
              left={<><span className="num font-semibold">#{v.daily_number}</span> <bdi>{v.item_name}</bdi> <span className="num text-muted">× {v.quantity}</span> · <bdi>{v.by}</bdi></>}
              right={<Money value={v.amount} decimals={0} />}
            />
          ))}
        </Audit>
        <Audit
          icon={<Bike />}
          tone="info"
          title={t('cashAdmin.report.driverSettlements')}
          count={report.driver_settlements.length}
          amount={report.driver_settlements.reduce((a, d) => a + d.collected, 0)}
        >
          {report.driver_settlements.map((d, i) => (
            <Line key={`${d.driver_name}-${i}`} left={<bdi>{d.driver_name}</bdi>} right={<OverShort value={d.difference} />} />
          ))}
        </Audit>
      </div>
      {report.movements.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <SectionLabel>{t('cashAdmin.movements.title')}</SectionLabel>
          <ul className="grid md:grid-cols-2 gap-2">
            {report.movements.map((m) => (
              <Line
                key={m.id}
                left={<><span className="num text-muted">{fmtTime(m.created_at)}</span> · <bdi>{m.reason}</bdi>{m.operator ? <span className="text-muted"> · <bdi>{m.operator}</bdi></span> : null}</>}
                right={<span className={m.kind === 'pay_out' ? 'text-danger-ink' : 'text-success-ink'}><Money value={m.kind === 'pay_out' ? -m.amount : m.amount} decimals={0} /></span>}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
