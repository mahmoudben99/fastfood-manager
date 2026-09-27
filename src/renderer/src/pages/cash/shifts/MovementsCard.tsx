import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowDownUp, ArrowUpRight, Plus } from 'lucide-react'
import type { Shift } from '../../../../../shared/shift-report'
import { Button, Card, EmptyState, Money, Skeleton, cn } from '../../../components/ui'
import { fmtTime, useAsync } from '../cashShared'
import { MovementModal } from './ShiftModals'

interface MovementsCardProps {
  shift: Shift | null
  version: number
  onChanged: () => void
  className?: string
}

/** Pay-ins and pay-outs of the open shift ("bought bread", "change from the bank"). */
export function MovementsCard({ shift, version, onChanged, className = '' }: MovementsCardProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const list = useAsync(() => (shift ? window.api.shifts.listMovements(shift.id) : Promise.resolve([])), [shift?.id, version])
  const rows = list.data ?? []
  const payIns = rows.filter((m) => m.kind === 'pay_in').reduce((a, m) => a + m.amount, 0)
  const payOuts = rows.filter((m) => m.kind === 'pay_out').reduce((a, m) => a + m.amount, 0)

  return (
    <Card
      padding={false}
      className={cn('flex flex-col', className)}
      title={t('cashAdmin.movements.title')}
      subtitle={shift ? t('cashAdmin.shiftNumber', { id: shift.id }) : t('cashAdmin.movements.noShift')}
      icon={<ArrowDownUp />}
      actions={
        shift ? (
          <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            {t('common.add')}
          </Button>
        ) : undefined
      }
    >
      {shift && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-5 pt-4">
          <div className="rounded-xl bg-success-soft px-3.5 py-2.5">
            <p className="text-xs font-semibold text-success-ink">{t('cashAdmin.movement.payIns')}</p>
            <p className="text-lg font-bold text-ink"><Money value={payIns} decimals={0} /></p>
          </div>
          <div className="rounded-xl bg-danger-soft px-3.5 py-2.5">
            <p className="text-xs font-semibold text-danger-ink">{t('cashAdmin.movement.payOuts')}</p>
            <p className="text-lg font-bold text-ink"><Money value={-payOuts} decimals={0} /></p>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {list.loading && !list.data ? (
          <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon={<ArrowDownUp />}
            title={t('cashAdmin.movements.emptyTitle')}
            description={shift ? undefined : t('cashAdmin.movements.noShiftBody')}
          />
        ) : (
          <ul className="px-3 py-3 max-h-80 overflow-y-auto">
            {rows.slice().reverse().map((m) => {
              const out = m.kind === 'pay_out'
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                  <span
                    className={cn(
                      'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center',
                      out ? 'bg-danger-soft text-danger-ink' : 'bg-success-soft text-success-ink'
                    )}
                    aria-label={out ? t('cashAdmin.movement.payOut') : t('cashAdmin.movement.payIn')}
                  >
                    {out ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate"><bdi>{m.reason}</bdi></p>
                    <p className="text-xs text-muted truncate">
                      <span className="num">{fmtTime(m.created_at)}</span>
                      {m.operator ? <> · <bdi>{m.operator}</bdi></> : null}
                    </p>
                  </div>
                  <span className={cn('text-sm font-bold', out ? 'text-danger-ink' : 'text-success-ink')}>
                    <Money value={out ? -m.amount : m.amount} decimals={0} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <MovementModal isOpen={adding} onClose={() => setAdding(false)} onDone={onChanged} />
    </Card>
  )
}
