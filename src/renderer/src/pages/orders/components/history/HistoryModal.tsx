import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Search, SearchX, X } from 'lucide-react'
import { withApproval } from '../../../../components/checkout'
import { ConfirmDialog, EmptyState, Modal, Tabs, toast } from '../../../../components/ui'
import { stripIpcPrefix } from '../../lib/checkout'
import { topLevelItems, type OrderData } from '../../types'
import { useTouchField } from '../../touchKeyboard'
import { HistoryRow } from './HistoryRow'
import { OrderDetail } from './OrderDetail'

interface HistoryModalProps {
  orders: OrderData[]
  readyIds: Set<number>
  onClose: () => void
  /** Reload today's orders + customer display queue. */
  onChanged: () => void
  onEdit: (orderId: number) => void
}

const isOngoing = (o: OrderData): boolean => o.status === 'preparing' || o.status === 'pending'

/** Today's orders (F3): ongoing / done, search, READY from the KDS, quick actions and reprints. */
export function HistoryModal({ orders, readyIds, onClose, onChanged, onEdit }: HistoryModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'ongoing' | 'done'>('ongoing')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const [cancelTarget, setCancelTarget] = useState<OrderData | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [alertMinutes, setAlertMinutes] = useState(20)
  const searchField = useTouchField(query, setQuery, 'text')

  useEffect(() => {
    window.api.settings.get('order_alert_minutes').then((v: string) => setAlertMinutes(parseInt(v || '20') || 20)).catch(() => {})
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) =>
      o.table_number?.toLowerCase().includes(q) ||
      o.customer_phone?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      String(o.daily_number).includes(q) ||
      topLevelItems(o.items).some((i) => i.menu_item_name?.toLowerCase().includes(q) || i.menu_item_name_fr?.toLowerCase().includes(q) || i.menu_item_name_ar?.includes(query.trim())))
  }, [orders, query])
  const ongoing = filtered.filter(isOngoing)
  const done = filtered.filter((o) => !isOngoing(o))
  const list = tab === 'ongoing' ? ongoing : done

  const refresh = useCallback(() => {
    onChanged()
    setVersion((v) => v + 1)
  }, [onChanged])

  const setStatus = useCallback(async (id: number, status: 'completed' | 'preparing') => {
    try {
      await window.api.orders.updateStatus(id, status)
      refresh()
    } catch (err) {
      toast.error(stripIpcPrefix(err))
    }
  }, [refresh])
  const markDone = useCallback((id: number) => setStatus(id, 'completed'), [setStatus])
  const openOrder = useCallback((o: OrderData) => setSelected(o.id), [])

  const confirmCancel = async (): Promise<void> => {
    if (!cancelTarget) return
    setCancelBusy(true)
    setCancelError('')
    try {
      const result = await withApproval((approval) => window.api.orders.cancel(cancelTarget.id, approval), { action: 'cancel_order' })
      if (result === null) {
        setCancelError(t('pos.error.approvalCancelled'))
        return
      }
      setCancelTarget(null)
      refresh()
    } catch (err) {
      setCancelError(stripIpcPrefix(err))
    } finally {
      setCancelBusy(false)
    }
  }

  const ageOf = (o: OrderData): number => Math.max(0, Math.floor((now - new Date(o.created_at).getTime()) / 60000))

  return (
    <>
      <Modal isOpen onClose={onClose} size="xl" title={t('orders.today')}>
        {selected !== null ? (
          <OrderDetail
            orderId={selected}
            ready={readyIds.has(selected)}
            version={version}
            onBack={() => setSelected(null)}
            onDone={markDone}
            onRestore={(id) => setStatus(id, 'preparing')}
            onEdit={onEdit}
            onCancel={setCancelTarget}
          />
        ) : orders.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={t('orders.noOrders')} />
        ) : (
          <div className="flex flex-col gap-4 min-h-[50vh]">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-faint" />
              <input
                data-ui="input"
                {...searchField}
                autoFocus={!searchField.readOnly}
                placeholder={t('pos.history.search')}
                className="w-full h-12 rounded-xl border border-line-strong bg-surface ps-11 pe-11 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              {query && (
                <button type="button" aria-label={t('common.close')} onClick={() => setQuery('')} className="tap absolute end-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'ongoing', label: t('orders.ongoing'), count: ongoing.length },
                { id: 'done', label: t('orders.done'), count: done.length }
              ]}
            />
            {list.length === 0 ? (
              <EmptyState compact icon={<SearchX />} title={query ? t('pos.history.noMatch') : tab === 'ongoing' ? t('pos.history.noneOngoing') : t('pos.history.noneDone')} />
            ) : (
              <div className="flex flex-col gap-2.5">
                {list.map((order) => {
                  const age = ageOf(order)
                  return (
                    <HistoryRow
                      key={order.id}
                      order={order}
                      ready={readyIds.has(order.id)}
                      ageMinutes={age}
                      overdue={age >= alertMinutes}
                      onOpen={openOrder}
                      onDone={markDone}
                      onEdit={onEdit}
                      onCancel={setCancelTarget}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={cancelTarget !== null}
        title={t('orders.cancelConfirm')}
        message={cancelTarget ? `${t('orders.orderNumber', { number: cancelTarget.daily_number })} — ${t('orders.cancelWarning')}` : ''}
        confirmLabel={t('orders.confirmCancel')}
        cancelLabel={t('common.no')}
        busy={cancelBusy}
        error={cancelError}
        onConfirm={confirmCancel}
        onCancel={() => { setCancelTarget(null); setCancelError('') }}
      />
    </>
  )
}
