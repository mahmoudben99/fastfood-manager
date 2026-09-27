import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Clock, Lock, LockOpen, ReceiptText, Wallet } from 'lucide-react'
import { Card, Modal, Money, Skeleton, Tabs, cn } from '../ui'
import type { ShiftBarProps } from './contracts'
import { isApprovalOpen } from './approval'
import { Z_SHEET } from './methods'
import { ShiftCloseResult, type CloseOutcome } from './ShiftClose'
import { elapsedText, timeOf } from './format'
import { ShiftClose } from './ShiftClose'
import { ShiftMovements } from './ShiftMovements'
import { ShiftOpen } from './ShiftOpen'
import { ShiftReportView } from './ShiftReportView'
import { useNow, useShiftStore } from './shiftStore'

type Tab = 'summary' | 'cash' | 'close'

/**
 * Shift / cash drawer. `compact`: a pill for the order-screen header (open/closed, cashier,
 * elapsed) that opens the drawer panel; otherwise the panel inline. The panel opens a shift
 * (cashier + opening float), records pay-ins / pay-outs, shows + prints the X report and closes
 * the shift with a blind count (Z report).
 */
export function ShiftBar({ compact, initialTab }: ShiftBarProps) {
  const { t, i18n } = useTranslation()
  const { shift, loaded, refresh } = useShiftStore()
  const [open, setOpen] = useState(false)
  const now = useNow()

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!compact) {
    return (
      <Card padding={false} className="overflow-hidden">
        <div className="p-5">
          <ShiftPanel active inline initialTab={initialTab} />
        </div>
      </Card>
    )
  }

  const label = !loaded
    ? t('common.loading')
    : shift
      ? t('checkout.shift.pillOpen', { name: shift.cashier_name })
      : t('checkout.shift.open')
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          void refresh() // the shift may have been opened / closed elsewhere
        }}
        data-testid="shift-pill"
        className={cn(
          'tap inline-flex items-center gap-2 min-h-12 rounded-full border px-4 text-sm font-semibold max-w-full',
          shift ? 'bg-surface border-line text-ink hover:bg-surface-2 dark:bg-surface-2' : 'bg-warning-soft border-warning/40 text-warning-ink'
        )}
      >
        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', shift ? 'bg-success' : 'bg-warning')} aria-hidden="true" />
        <span className="truncate">{label}</span>
        {shift && (
          <span className="inline-flex items-center gap-1 text-muted font-medium shrink-0">
            <Clock className="h-3.5 w-3.5" />
            <bdi className="num">{elapsedText(t, shift.opened_at, now)}</bdi>
          </span>
        )}
        {!shift && loaded && <LockOpen className="h-4 w-4 shrink-0" />}
      </button>
      {open && createPortal(
      <Modal
        isOpen={open}
        onClose={() => { if (!isApprovalOpen()) setOpen(false) }}
        zIndex={Z_SHEET}
        size="xl"
        closeOnBackdrop={false}
        title={t('checkout.shift.title')}
        description={shift ? <ShiftLine /> : undefined}
      >
        <ShiftPanel active={open} initialTab={initialTab} onClosed={() => setOpen(false)} />
      </Modal>,
      document.body
      )}
    </>
  )
}

/** "Karim · since 14:02 · 2 h 05 · Float 5 000 DA". */
function ShiftLine() {
  const { t, i18n } = useTranslation()
  const shift = useShiftStore((s) => s.shift)
  const now = useNow()
  if (!shift) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
      <span className="font-semibold text-ink-2">{shift.cashier_name}</span>
      <span>· {t('checkout.shift.since', { time: timeOf(shift.opened_at, i18n.language) })}</span>
      <span>· <bdi className="num">{elapsedText(t, shift.opened_at, now)}</bdi></span>
      <span>· {t('checkout.shift.floatLine')} <Money value={shift.opening_float} decimals={0} /></span>
    </span>
  )
}

function ShiftPanel({ active, initialTab = 'summary', onClosed, inline }: { active: boolean; initialTab?: Tab; onClosed?: () => void; inline?: boolean }) {
  const { t } = useTranslation()
  const { shift, loaded, error, refresh } = useShiftStore()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [closed, setClosed] = useState<CloseOutcome | null>(null)

  if (closed) {
    return (
      <ShiftCloseResult
        outcome={closed}
        onDone={() => {
          setClosed(null)
          setTab('summary')
          onClosed?.()
        }}
      />
    )
  }

  if (!loaded) return <Skeleton className="h-64 rounded-2xl" />
  if (!shift) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-2.5 text-sm font-bold text-warning-ink">
          <Lock className="h-4 w-4 shrink-0" />
          {error ?? t('checkout.shift.noShift')}
        </p>
        <ShiftOpen active={active} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {inline && <p className="text-sm text-muted"><ShiftLine /></p>}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: t('checkout.shift.tabSummary'), icon: <ReceiptText className="h-4 w-4" /> },
          { id: 'cash', label: t('checkout.shift.tabCash'), icon: <ArrowLeftRight className="h-4 w-4" /> },
          { id: 'close', label: t('checkout.shift.tabClose'), icon: <Wallet className="h-4 w-4" /> }
        ]}
      />
      {tab === 'summary' && <ShiftReportView />}
      {tab === 'cash' && <ShiftMovements shift={shift} active={active} />}
      {tab === 'close' && (
        <ShiftClose
          shift={shift}
          active={active}
          onClosed={(outcome) => {
            setClosed(outcome)
            void refresh() // every ShiftBar (e.g. the order-screen pill) now shows "no shift"
          }}
        />
      )}
    </div>
  )
}
