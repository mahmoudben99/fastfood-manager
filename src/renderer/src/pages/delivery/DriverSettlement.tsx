import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bike, HandCoins, History, Phone, TriangleAlert, Users } from 'lucide-react'
import type { DriverSettlementPreview } from '../../../../shared/delivery'
import { Button, Card, EmptyState, Input, Money, Skeleton } from '../../components/ui'
import { Hint, OverShort, fmtDate, fmtTime, localToday, td, tdEnd, th, thEnd, useAsync } from '../cash/cashShared'
import { SettleModal } from './SettleModal'

type Driver = { id: number; name: string; phone: string | null }

/** End-of-day cash settlement per driver (expected COD vs collected) + settlement history. */
export function DriverSettlement() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [date, setDate] = useState(localToday())
  const [settling, setSettling] = useState<{ driver: Driver; preview: DriverSettlementPreview } | null>(null)
  const data = useAsync(async () => {
    const drivers = await window.api.delivery.getDrivers()
    const previews = await Promise.all(drivers.map((d) => window.api.delivery.settlementPreview(d.id)))
    return drivers.map((driver, i) => ({ driver, preview: previews[i] }))
  }, [version])
  const history = useAsync(() => window.api.delivery.listSettlements({ date }), [date, version])
  const cards = data.data ?? []
  const totalExpected = cards.reduce((a, c) => a + c.preview.expectedCash, 0)

  return (
    <div className="space-y-6">
      {cards.length > 0 && (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line px-4 py-2 text-sm">
            <Hint text={t('delivery.drivers.intro')} />
            <span className="text-muted">{t('delivery.drivers.toSettle')}</span>
            <span className="text-base font-bold text-ink"><Money value={totalExpected} decimals={0} /></span>
          </span>
        </div>
      )}

      {data.loading && !data.data ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      ) : cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={t('delivery.drivers.emptyTitle')}
            description={t('delivery.drivers.emptyBody')}
            action={<Button variant="secondary" onClick={() => navigate('/admin/workers')}>{t('delivery.drivers.goWorkers')}</Button>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map(({ driver, preview }) => {
            const initials = driver.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
            const ready = preview.orders.length > 0
            return (
              <section key={driver.id} className="rounded-2xl bg-surface border border-line shadow-e1 p-5 flex flex-col gap-4 contain-card">
                <div className="flex items-center gap-3">
                  <span className="h-12 w-12 shrink-0 rounded-2xl bg-primary-soft text-primary-ink flex items-center justify-center text-base font-extrabold" aria-hidden="true">
                    {initials || <Bike className="h-6 w-6" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-ink truncate"><bdi>{driver.name}</bdi></p>
                    {driver.phone && <p className="flex items-center gap-1.5 text-sm text-muted num"><Phone className="h-3.5 w-3.5" /><bdi dir="ltr">{driver.phone}</bdi></p>}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-2 px-4 py-3">
                  <p className="text-xs font-semibold text-muted">{t('delivery.drivers.expected')}</p>
                  <p className="text-kpi text-ink tracking-tight"><Money value={preview.expectedCash} decimals={0} /></p>
                  <p className="text-xs text-muted">{t('delivery.drivers.orders', { count: preview.orders.length })}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft text-info-ink px-2.5 py-1 font-semibold">
                    <Bike className="h-3.5 w-3.5" />{t('delivery.drivers.outNow', { count: preview.outForDelivery })}
                  </span>
                  {preview.failed > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft text-danger-ink px-2.5 py-1 font-semibold">
                      <TriangleAlert className="h-3.5 w-3.5" />{t('delivery.drivers.failed', { count: preview.failed })}
                    </span>
                  )}
                </div>
                <Button
                  className="mt-auto"
                  size="lg"
                  variant={ready ? 'soft' : 'secondary'}
                  disabled={!ready}
                  icon={<HandCoins className="h-5 w-5" />}
                  onClick={() => setSettling({ driver, preview })}
                >
                  {ready ? t('delivery.drivers.settle') : t('delivery.drivers.nothing')}
                </Button>
              </section>
            )
          })}
        </div>
      )}

      <Card
        padding={false}
        title={t('delivery.drivers.history')}
        icon={<History />}
        actions={<div className="w-44"><Input type="date" aria-label={t('delivery.board.date')} value={date} max={localToday()} onChange={(e) => setDate(e.target.value || localToday())} /></div>}
      >
        {history.loading && !history.data ? (
          <div className="p-5 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState compact icon={<History />} title={t('delivery.drivers.historyEmpty', { date: fmtDate(date) })} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-surface-2">
                <tr>
                  <th className={th}>{t('delivery.drivers.time')}</th>
                  <th className={th}>{t('delivery.card.driver')}</th>
                  <th className={thEnd}>{t('delivery.drivers.orderCount')}</th>
                  <th className={thEnd}>{t('delivery.drivers.expected')}</th>
                  <th className={thEnd}>{t('delivery.drivers.collected')}</th>
                  <th className={thEnd}>{t('cashAdmin.report.overShort')}</th>
                  <th className={th}>{t('cashAdmin.note')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(history.data ?? []).map((s) => (
                  <tr key={s.id} className="h-14">
                    <td className={td}><span className="num">{fmtTime(s.created_at)}</span><div className="text-xs text-muted"><bdi>{s.operator}</bdi></div></td>
                    <td className={td}><bdi className="font-semibold text-ink">{s.driver_name ?? `#${s.driver_id}`}</bdi></td>
                    <td className={tdEnd}><span className="num">{s.order_count}</span></td>
                    <td className={tdEnd}><Money value={s.expected_cash} decimals={0} /></td>
                    <td className={tdEnd}><Money value={s.collected_cash} decimals={0} /></td>
                    <td className={tdEnd}><OverShort value={s.difference} /></td>
                    <td className={td}><bdi className="text-muted">{s.note ?? ''}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SettleModal target={settling} onClose={() => setSettling(null)} onDone={bump} />
    </div>
  )
}
