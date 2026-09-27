import { ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Banknote, Eye, EyeOff, Lock, Play, Printer, Receipt, UserRound, Wallet } from 'lucide-react'
import { parseApprovalError } from '../../../../../shared/cash'
import type { Shift, ShiftReport } from '../../../../../shared/shift-report'
import { Badge, Button, Card, EmptyState, IconButton, Money, Skeleton, cn, toast } from '../../../components/ui'
import { withApproval } from '../../../components/checkout'
import { Hint, errorText, fmtDuration, fmtTime, minutesBetween, useAsync, useMethodLabel } from '../cashShared'
import { MovementModal, OpenShiftModal } from './ShiftModals'
import { CloseShiftModal } from './CloseShiftModal'

interface CurrentShiftCardProps {
  shift: Shift | null
  loading: boolean
  version: number
  onChanged: () => void
  onShowReport: (shiftId: number, report?: ShiftReport) => void
  className?: string
}

function Metric({ label, children, icon, highlight = false }: { label: ReactNode; children: ReactNode; icon: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn('rounded-2xl p-4 flex flex-col gap-2 min-w-0', highlight ? 'bg-primary-soft ring-1 ring-primary/25' : 'bg-surface-2')}>
      <div className={cn('flex items-start gap-2 text-[13px] font-medium leading-snug [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:mt-px', highlight ? 'text-primary-ink' : 'text-muted')}>
        {icon}
        <span className="line-clamp-2">{label}</span>
      </div>
      <div className="text-kpi text-ink tracking-tight leading-none">{children}</div>
    </div>
  )
}

/** The drawer right now: cashier, float, sales, expected cash (hidden during a blind count). */
export function CurrentShiftCard({ shift, loading, version, onChanged, onShowReport, className = '' }: CurrentShiftCardProps) {
  const { t } = useTranslation()
  const methodLabel = useMethodLabel()
  const [modal, setModal] = useState<'open' | 'close' | 'movement' | null>(null)
  const [revealed, setRevealed] = useState<ShiftReport | null>(null)
  const [revealing, setRevealing] = useState(false)
  const x = useAsync(() => (shift ? window.api.shifts.xReport() : Promise.resolve(null)), [shift?.id, version])
  useEffect(() => setRevealed(null), [shift?.id, version])
  const report = revealed ?? x.data

  const reveal = async (): Promise<void> => {
    setRevealing(true)
    try {
      const result = await withApproval(async (approval) => {
        if (!approval) throw new Error('APPROVAL_REQUIRED:view_expected')
        return window.api.shifts.xReport(approval)
      }, { action: 'view_expected', reason: t('cashAdmin.current.revealReason') })
      if (result) setRevealed(result)
    } catch (e) {
      toast.error(t('cashAdmin.current.revealFailed'), {
        description: parseApprovalError(e) ? t('cashAdmin.approvalNeeded') : errorText(e, '')
      })
    } finally {
      setRevealing(false)
    }
  }

  const printX = async (): Promise<void> => {
    try {
      const result = await window.api.shifts.printReport()
      if (result.success) toast.success(t('cashAdmin.current.xPrinted'))
      else toast.error(t('cashAdmin.printFailed'), { description: result.error })
    } catch (e) {
      toast.error(t('cashAdmin.printFailed'), { description: errorText(e, '') })
    }
  }

  const modals = (
    <>
      <OpenShiftModal isOpen={modal === 'open'} onClose={() => setModal(null)} onDone={onChanged} />
      {shift && (
        <>
          <MovementModal isOpen={modal === 'movement'} onClose={() => setModal(null)} onDone={onChanged} />
          <CloseShiftModal
            isOpen={modal === 'close'}
            shift={shift}
            onClose={() => setModal(null)}
            onDone={(closed) => {
              onChanged()
              onShowReport(closed.shift.id, closed.report)
            }}
          />
        </>
      )}
    </>
  )

  if (loading) {
    return (
      <Card className={className}>
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2 flex-1"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></div>
        </div>
        <div className="grid grid-cols-2 2xl:grid-cols-4 gap-3 mt-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </Card>
    )
  }

  if (!shift) {
    return (
      <Card className={cn('flex items-center', className)}>
        <EmptyState
          icon={<Wallet />}
          title={t('cashAdmin.current.noneTitle')}
          description={t('cashAdmin.current.noneBody')}
          action={<Button size="lg" icon={<Play className="h-5 w-5 rtl:-scale-x-100" />} onClick={() => setModal('open')}>{t('cashAdmin.current.open')}</Button>}
        />
        {modals}
      </Card>
    )
  }

  const running = minutesBetween(shift.opened_at)
  const blind = report?.blind ?? false

  return (
    <Card padding={false} className={className}>
      <div className="p-5 flex flex-wrap items-start justify-between gap-4 border-b border-line">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 shrink-0 rounded-2xl bg-success-soft text-success-ink flex items-center justify-center">
            <UserRound className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" dot>{t('cashAdmin.status.open')}</Badge>
              <span className="text-xs text-muted num">{t('cashAdmin.shiftNumber', { id: shift.id })} · {shift.register_id}</span>
            </div>
            <h3 className="mt-1 text-xl font-bold text-ink truncate"><bdi>{shift.cashier_name}</bdi></h3>
            <p className="text-sm text-muted">
              {t('cashAdmin.current.openedAt', { time: fmtTime(shift.opened_at) })} ·{' '}
              <span className="num">{t('cashAdmin.current.running', { duration: fmtDuration(running) })}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<ArrowDownUp className="h-4 w-4" />} onClick={() => setModal('movement')}>
            {t('cashAdmin.current.movement')}
          </Button>
          <Button variant="secondary" icon={<Receipt className="h-4 w-4" />} onClick={() => onShowReport(shift.id)}>
            {t('cashAdmin.current.viewX')}
          </Button>
          <IconButton variant="secondary" icon={<Printer />} label={t('cashAdmin.current.printX')} onClick={printX} />
          <Button icon={<Lock className="h-4 w-4" />} onClick={() => setModal('close')}>
            {t('cashAdmin.current.close')}
          </Button>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 2xl:grid-cols-4 gap-3">
        <Metric label={t('cashAdmin.report.openingFloat')} icon={<Wallet />}>
          <Money value={shift.opening_float} decimals={0} />
        </Metric>
        <Metric label={t('cashAdmin.report.cashSales')} icon={<Banknote />}>
          {report ? <Money value={report.cash.cash_sales} decimals={0} /> : <Skeleton className="h-7 w-24" />}
        </Metric>
        <Metric label={t('cashAdmin.current.ordersNet', { count: report?.orders.count ?? 0 })} icon={<Receipt />}>
          {report ? <Money value={report.orders.net_sales} decimals={0} /> : <Skeleton className="h-7 w-24" />}
        </Metric>
        <Metric label={<>{t('cashAdmin.report.expected')}{blind && <Hint text={t('cashAdmin.current.blindHint')} className="ms-1.5 text-primary-ink" />}</>} icon={blind ? <EyeOff /> : <Eye />} highlight>
          {!report ? (
            <Skeleton className="h-7 w-24" />
          ) : blind ? (
            <div className="flex flex-col gap-2">
              <span className="tracking-[0.3em] text-muted" aria-label={t('cashAdmin.current.hidden')}>••••</span>
              <Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />} loading={revealing} onClick={reveal} className="self-start">
                {t('cashAdmin.current.reveal')}
              </Button>
            </div>
          ) : (
            <Money value={report.cash.expected ?? 0} decimals={0} />
          )}
        </Metric>
      </div>

      {report && report.payments.length > 0 && (
        <div className="px-5 pb-5 -mt-1 flex flex-wrap gap-2">
          {report.payments.map((p) => (
            <span key={p.method} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
              <span className="text-muted">{methodLabel(p.method, p.label)}</span>
              <span className="font-bold text-ink"><Money value={p.net} decimals={0} /></span>
            </span>
          ))}
          {report.unpaid.count > 0 && (
            <Badge variant="warning" size="md">
              {t('cashAdmin.current.unpaid', { count: report.unpaid.count })} · <Money value={report.unpaid.amount} decimals={0} styledSymbol={false} />
            </Badge>
          )}
        </div>
      )}
      {modals}
    </Card>
  )
}
