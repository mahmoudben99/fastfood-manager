import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, CreditCard, EyeOff, Percent, Receipt, ShoppingBag, TrendingUp } from 'lucide-react'
import { DZD_DENOMINATIONS } from '../../../../../shared/cash'
import type { ShiftReport } from '../../../../../shared/shift-report'
import { Badge, Button, Money, cn, formatAmount } from '../../../components/ui'
import { LedgerRow, OverShort, SectionLabel, fmtDateTime, useMethodLabel } from '../cashShared'
import { ShiftReportLists } from './ShiftReportLists'

function Tile({ label, value, icon, sub }: { label: ReactNode; value: ReactNode; icon: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted truncate">{label}</span>
        <span className="h-8 w-8 shrink-0 rounded-lg bg-primary-soft text-primary-ink flex items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

/** In-app X / Z report: KPIs, drawer reconciliation, payments by method, then the audit lists. */
export function ShiftReportView({ report, onReveal, revealing }: { report: ShiftReport; onReveal?: () => void; revealing?: boolean }) {
  const { t } = useTranslation()
  const methodLabel = useMethodLabel()
  const { shift, orders, cash } = report
  const zed = report.kind === 'Z'
  const paymentsTotal = report.payments.reduce((a, p) => a + p.net, 0)
  const counts = cash.denominations
    ? DZD_DENOMINATIONS.filter((d) => (cash.denominations?.[d.key] ?? 0) > 0)
    : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface-2 border border-line p-4">
        <span
          className={cn(
            'h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center text-xl font-extrabold',
            zed ? 'bg-inverse text-on-inverse' : 'bg-primary-soft text-primary-ink'
          )}
          aria-hidden="true"
        >
          {report.kind}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-ink">
            <bdi>{shift.cashier_name}</bdi>
          </p>
          <p className="text-sm text-muted num">
            <bdi dir="ltr">{fmtDateTime(shift.opened_at)} → {shift.closed_at ? fmtDateTime(shift.closed_at) : t('cashAdmin.report.live')}</bdi>
          </p>
        </div>
        <div className="ms-auto text-end">
          <Badge variant={zed ? 'neutral' : 'success'} dot={!zed}>{zed ? t('cashAdmin.report.final') : t('cashAdmin.report.live')}</Badge>
          {!zed && <p className="mt-1 text-xs text-muted num">{t('cashAdmin.report.generated', { at: fmtDateTime(report.generated_at) })}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={t('cashAdmin.report.netSales')} icon={<TrendingUp />} value={<Money value={orders.net_sales} decimals={0} />}
          sub={<>{t('cashAdmin.report.gross')} <Money value={orders.gross_sales} decimals={0} styledSymbol={false} /></>} />
        <Tile label={t('cashAdmin.report.orders')} icon={<ShoppingBag />} value={<span className="num">{orders.count}</span>}
          sub={orders.delivery_fees > 0 ? <>{t('cashAdmin.report.deliveryFees')} <Money value={orders.delivery_fees} decimals={0} styledSymbol={false} /></> : undefined} />
        <Tile label={t('cashAdmin.report.avgTicket')} icon={<Receipt />} value={<Money value={orders.average_ticket} decimals={0} />} />
        <Tile label={t('cashAdmin.report.discounts')} icon={<Percent />} value={<Money value={orders.discounts} decimals={0} />}
          sub={report.discounts.count > 0 ? t('cashAdmin.report.discountCount', { count: report.discounts.count }) : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <SectionLabel>{t('cashAdmin.report.drawer')}</SectionLabel>
          <div className="divide-y divide-line/60">
            <LedgerRow label={t('cashAdmin.report.openingFloat')} value={<Money value={cash.opening_float} decimals={0} />} />
            <LedgerRow sign="+" label={t('cashAdmin.report.cashSales')} value={<Money value={cash.cash_sales} decimals={0} />} />
            {cash.cash_refunds !== 0 && <LedgerRow sign="−" label={t('cashAdmin.report.cashRefunds')} value={<Money value={Math.abs(cash.cash_refunds)} decimals={0} />} />}
            {cash.rounding !== 0 && <LedgerRow sign="±" label={t('cashAdmin.report.rounding')} value={<Money value={cash.rounding} decimals={0} />} />}
            {cash.pay_ins !== 0 && <LedgerRow sign="+" label={t('cashAdmin.report.payIns')} value={<Money value={cash.pay_ins} decimals={0} />} />}
            {cash.pay_outs !== 0 && <LedgerRow sign="−" label={t('cashAdmin.report.payOuts')} value={<Money value={Math.abs(cash.pay_outs)} decimals={0} />} />}
            {cash.driver_differences !== 0 && (
              <LedgerRow sign="±" label={t('cashAdmin.report.driverDiff')} value={<Money value={cash.driver_differences} decimals={0} />} />
            )}
          </div>
          <LedgerRow
            strong
            sign="="
            label={t('cashAdmin.report.expected')}
            value={
              cash.expected === null ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><EyeOff className="h-4 w-4" />{t('cashAdmin.current.hidden')}</span>
                  {onReveal && <Button size="sm" variant="outline" loading={revealing} onClick={onReveal}>{t('cashAdmin.current.reveal')}</Button>}
                </span>
              ) : (
                <Money value={cash.expected} decimals={0} />
              )
            }
          />
          {cash.counted !== null && (
            <>
              <LedgerRow label={t('cashAdmin.report.counted')} value={<Money value={cash.counted} decimals={0} />} />
              <LedgerRow label={t('cashAdmin.report.overShort')} value={<OverShort value={cash.over_short} />} />
            </>
          )}
          {cash.change_given > 0 && (
            <LedgerRow muted label={t('cashAdmin.report.changeGiven')} value={<Money value={cash.change_given} decimals={0} />} />
          )}
          {counts.length > 0 && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 grid grid-cols-2 gap-x-6 gap-y-1">
              {counts.map((d) => (
                <div key={d.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted num"><bdi dir="ltr">{formatAmount(d.value, 0)} × {cash.denominations?.[d.key]}</bdi></span>
                  <span className="font-semibold text-ink"><Money value={d.value * (cash.denominations?.[d.key] ?? 0)} decimals={0} /></span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 flex flex-col gap-4">
          <div>
            <SectionLabel>{t('cashAdmin.report.byMethod')}</SectionLabel>
            {report.payments.length === 0 ? (
              <p className="text-sm text-muted py-2">{t('cashAdmin.report.noPayments')}</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {report.payments.map((p) => (
                  <li key={p.method} className="flex items-center gap-3 py-2">
                    <span className="h-8 w-8 shrink-0 rounded-lg bg-surface-2 text-ink-2 flex items-center justify-center">
                      {p.method === 'cash' ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{methodLabel(p.method, p.label)}</p>
                      <p className="text-xs text-muted">
                        {t('cashAdmin.report.paymentCount', { count: p.count })}
                        {p.refunds !== 0 && <> · {t('cashAdmin.report.refunds')} <Money value={p.refunds} decimals={0} styledSymbol={false} /></>}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-ink"><Money value={p.net} decimals={0} /></span>
                  </li>
                ))}
                <li className="flex items-center justify-between pt-3">
                  <span className="text-sm font-bold text-ink">{t('cashAdmin.report.totalCollected')}</span>
                  <span className="text-base font-extrabold text-ink"><Money value={paymentsTotal} decimals={0} /></span>
                </li>
              </ul>
            )}
          </div>
          <div>
            <SectionLabel>{t('cashAdmin.report.byType')}</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {(['local', 'takeout', 'delivery'] as const).map((type) => (
                <div key={type} className="rounded-xl bg-surface-2 px-3 py-2.5 min-w-0">
                  <p className="text-xs text-muted truncate">{t(`cashAdmin.orderType.${type}`)}</p>
                  <p className="text-sm font-bold text-ink num">{orders.by_type[type]?.count ?? 0}</p>
                  <p className="text-xs text-ink-2"><Money value={orders.by_type[type]?.total ?? 0} decimals={0} /></p>
                </div>
              ))}
            </div>
          </div>
          {report.unpaid.count > 0 && (
            <div className="rounded-xl bg-warning-soft text-warning-ink px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3">
              <span>{t('cashAdmin.report.unpaid', { count: report.unpaid.count })}</span>
              <Money value={report.unpaid.amount} decimals={0} />
            </div>
          )}
        </section>
      </div>

      <ShiftReportLists report={report} />
    </div>
  )
}
