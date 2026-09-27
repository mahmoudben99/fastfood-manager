import { ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Printer, RefreshCw } from 'lucide-react'
import type { ShiftReport } from '../../../../shared/shift-report'
import { Button, Money, Skeleton, cn, toast } from '../ui'
import { withApprovalFirst } from './approval'
import { errorText, hasToken, methodName } from './methods'
import { useShiftStore } from './shiftStore'
import { SignedMoney } from './Numpad'

function Row({ label, value, strong, tone }: { label: ReactNode; value: number; strong?: boolean; tone?: 'minus' | 'plus' }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5', strong && 'border-t border-dashed border-line-strong mt-1 pt-2.5')}>
      <span className={cn('text-sm', strong ? 'font-bold text-ink' : 'text-ink-2')}>{label}</span>
      <span className={cn('text-sm', strong ? 'text-lg font-extrabold text-ink' : 'font-semibold text-ink')}>
        {tone ? <SignedMoney value={Math.abs(value)} sign={tone} /> : <Money value={value} decimals={0} />}
      </span>
    </div>
  )
}

function Kpi({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5 min-w-0">
      <p className="text-xs font-semibold text-muted truncate">{label}</p>
      <p className="text-kpi text-ink truncate">{children}</p>
    </div>
  )
}

/** X report of the open shift: sales, money by method, drawer (expected cash hidden during a blind count). */
export function ShiftReportView() {
  const { t, i18n } = useTranslation()
  const [report, setReport] = useState<ShiftReport | null>(null)
  const [printing, setPrinting] = useState(false)

  const refresh = useShiftStore((s) => s.refresh)
  const load = (): void => {
    window.api.shifts.xReport().then(setReport).catch((error) => {
      if (hasToken(error, 'NO_OPEN_SHIFT')) void refresh()
      else toast.error(t('checkout.shift.reportError'), { description: errorText(error, '') })
    })
  }
  useEffect(load, [t])

  const reveal = async (): Promise<void> => {
    try {
      const revealed = await withApprovalFirst('view_expected', (approval) => window.api.shifts.xReport(approval))
      if (revealed) setReport(revealed)
    } catch (error) {
      toast.error(t('checkout.shift.reportError'), { description: errorText(error, '') })
    }
  }
  const print = async (): Promise<void> => {
    setPrinting(true)
    try {
      const result = await window.api.shifts.printReport()
      if (result.success) toast.success(t('checkout.shift.xPrinted'))
      else toast.error(t('checkout.shift.printFailed'), { description: result.error })
    } catch (error) {
      toast.error(t('checkout.shift.printFailed'), { description: errorText(error, '') })
    } finally {
      setPrinting(false)
    }
  }

  if (!report) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }
  const { cash } = report
  return (
    <div className="space-y-4" data-testid="x-report">
      <div className="grid grid-cols-3 gap-2">
        <Kpi label={t('checkout.shift.orders')}><bdi className="num">{report.orders.count}</bdi></Kpi>
        <Kpi label={t('checkout.shift.netSales')}><Money value={report.orders.net_sales} decimals={0} /></Kpi>
        <Kpi label={t('checkout.shift.avgTicket')}><Money value={report.orders.average_ticket} decimals={0} /></Kpi>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-bold text-ink mb-1">{t('checkout.shift.byMethod')}</p>
          {report.payments.length === 0 && <p className="text-sm text-muted py-2">{t('checkout.shift.noPayments')}</p>}
          {report.payments.map((row) => (
            <Row key={row.method} label={`${methodName(row.method, i18n.language)} · ${row.count}`} value={row.net} />
          ))}
          {report.unpaid.count > 0 && (
            <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-warning-ink">
              {t('checkout.shift.unpaid', { count: report.unpaid.count })} <Money value={report.unpaid.amount} decimals={0} />
            </p>
          )}
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-bold text-ink mb-1">{t('checkout.shift.drawer')}</p>
          <Row label={t('checkout.shift.float')} value={cash.opening_float} />
          <Row label={t('checkout.shift.cashSales')} value={cash.cash_sales} tone="plus" />
          {cash.cash_refunds !== 0 && <Row label={t('checkout.shift.refunds')} value={cash.cash_refunds} tone="minus" />}
          {cash.pay_ins > 0 && <Row label={t('checkout.shift.payIns')} value={cash.pay_ins} tone="plus" />}
          {cash.pay_outs > 0 && <Row label={t('checkout.shift.payOuts')} value={cash.pay_outs} tone="minus" />}
          {cash.expected === null ? (
            <div className="flex items-center justify-between gap-2 border-t border-dashed border-line-strong mt-1 pt-2">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{t('checkout.shift.expected')}</span>
                <span className="flex items-center gap-1 text-xs text-muted"><EyeOff className="h-3.5 w-3.5 shrink-0" />{t('checkout.shift.expectedHidden')}</span>
              </span>
              <Button size="md" variant="soft" className="shrink-0 whitespace-nowrap" icon={<Eye className="h-4 w-4" />} onClick={reveal}>
                {t('checkout.shift.reveal')}
              </Button>
            </div>
          ) : (
            <Row label={t('checkout.shift.expected')} value={cash.expected} strong />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="lg" icon={<Printer className="h-5 w-5" />} onClick={print} loading={printing} cooldownMs={800}>
          {t('checkout.shift.printX')}
        </Button>
        <Button variant="ghost" size="lg" icon={<RefreshCw className="h-5 w-5" />} onClick={load}>
          {t('checkout.shift.refresh')}
        </Button>
      </div>
    </div>
  )
}
