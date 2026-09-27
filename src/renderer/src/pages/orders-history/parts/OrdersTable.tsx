import { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ClipboardList, SearchX } from 'lucide-react'
import { Button, Card, EmptyState, Money, Skeleton, cn } from '../../../components/ui'
import {
  OrderStatusBadge, OrderTypeBadge, OrderTypeIcon, PaymentBadge, effectivePaymentStatus, formatClock, formatDayClock
} from './labels'
import type { HistoryOrder } from './types'

interface OrdersTableProps {
  orders: HistoryOrder[]
  total: number
  loading: boolean
  /** Filters/search hide everything (vs. an empty period). */
  filtered: boolean
  multiDay: boolean
  selectedId: number | null
  onOpen: (order: HistoryOrder) => void
  onClearFilters: () => void
  onShowMore: () => void
}

function CustomerCell({ order }: { order: HistoryOrder }) {
  const { t } = useTranslation()
  const table = order.table_number ? t('orderHistory.tableLabel', { n: order.table_number }) : null
  const primary = order.customer_name || order.customer_phone || table
  const secondary = order.customer_name ? order.customer_phone || table : order.customer_phone ? table : null
  if (!primary) return <span className="text-muted">{t('orderHistory.walkIn')}</span>
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate font-medium text-ink"><bdi>{primary}</bdi></p>
      {secondary && <p className="truncate text-xs text-muted"><bdi>{secondary}</bdi></p>}
    </div>
  )
}

/** Rows rendered per step (long periods stay light on slow PCs). */
export const PAGE_SIZE = 100

const HEAD = 'sticky top-0 z-10 h-11 whitespace-nowrap border-b border-line bg-surface-2 px-3 xl:px-4 text-xs font-semibold text-muted'
/** Cell padding: tighter below xl so the table fits a 1024px screen (≈720px content). */
const CELL = 'px-3 xl:px-4'
/** Type + payment get their own columns only from xl; below that they fold into # / status. */
const WIDE = 'hidden xl:table-cell'

/** Orders list: sticky head, 48px rows, end-aligned money, status words + icons. */
export function OrdersTable(props: OrdersTableProps) {
  const { t } = useTranslation()
  const { orders, loading } = props

  if (!loading && orders.length === 0) {
    return (
      <Card padding={false}>
        {props.filtered ? (
          <EmptyState
            icon={<SearchX />}
            title={t('orderHistory.empty.filteredTitle')}
            action={<Button variant="secondary" size="lg" onClick={props.onClearFilters}>{t('orderHistory.clearFilters')}</Button>}
          />
        ) : (
          <EmptyState icon={<ClipboardList />} title={t('orderHistory.empty.title')} description={t('orderHistory.empty.body')} />
        )}
      </Card>
    )
  }

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, order: HistoryOrder) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      props.onOpen(order)
    }
  }

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="max-h-[68vh] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={cn(HEAD, 'text-start')}>{t('orderHistory.col.number')}</th>
              <th className={cn(HEAD, 'text-start')}>{t('orderHistory.col.time')}</th>
              <th className={cn(HEAD, WIDE, 'text-start')}>{t('orderHistory.col.type')}</th>
              <th className={cn(HEAD, 'text-start')}>{t('orderHistory.col.customer')}</th>
              <th className={cn(HEAD, WIDE, 'text-start')}>{t('orderHistory.col.payment')}</th>
              <th className={cn(HEAD, 'text-end')}>{t('orderHistory.col.total')}</th>
              <th className={cn(HEAD, 'text-start')}>{t('orderHistory.col.status')}</th>
              <th className={cn(HEAD, 'w-10')} aria-hidden="true" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="h-12">
                    <td className={CELL}><Skeleton className="h-4 w-10" /></td>
                    <td className={CELL}><Skeleton className="h-4 w-12" /></td>
                    <td className={cn(CELL, WIDE)}><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className={CELL}><Skeleton className="h-4 w-28" /></td>
                    <td className={cn(CELL, WIDE)}><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className={CELL}><Skeleton className="ms-auto h-4 w-20" /></td>
                    <td className={CELL}><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td />
                  </tr>
                ))
              : orders.map((order) => {
                  const payment = effectivePaymentStatus(order.payment_status, order.status)
                  return (
                    <tr
                      key={order.id}
                      tabIndex={0}
                      aria-label={t('orderHistory.open', { number: order.daily_number })}
                      onClick={() => props.onOpen(order)}
                      onKeyDown={(e) => onKey(e, order)}
                      className={cn(
                        'h-12 cursor-pointer outline-none hover:bg-surface-2 active:bg-surface-3 focus-visible:bg-surface-2',
                        props.selectedId === order.id && 'bg-primary-soft hover:bg-primary-soft',
                        order.status === 'cancelled' && 'text-muted'
                      )}
                    >
                      <td className={cn(CELL, 'whitespace-nowrap')}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="num font-bold text-ink">#{order.daily_number}</span>
                          <OrderTypeIcon type={order.order_type} className="xl:hidden" />
                        </span>
                      </td>
                      {/* created_at is a UTC timestamp; show the local wall-clock time. */}
                      <td className={cn(CELL, 'num whitespace-nowrap text-muted')}>
                        {props.multiDay ? formatDayClock(order.created_at) : formatClock(order.created_at)}
                      </td>
                      <td className={cn(CELL, WIDE)}><OrderTypeBadge type={order.order_type} /></td>
                      <td className={cn(CELL, 'max-w-[9rem] py-1.5 xl:max-w-[14rem]')}><CustomerCell order={order} /></td>
                      <td className={cn(CELL, WIDE)}><PaymentBadge status={payment} /></td>
                      <td className={cn(CELL, 'whitespace-nowrap text-end font-bold', order.status === 'cancelled' ? 'text-muted line-through' : 'text-ink')}>
                        <Money value={order.total} />
                      </td>
                      <td className={CELL}>
                        <div className="flex flex-wrap items-center gap-1">
                          <OrderStatusBadge status={order.status} />
                          {(payment === 'unpaid' || payment === 'partial') && (
                            <span className="xl:hidden"><PaymentBadge status={payment} /></span>
                          )}
                        </div>
                      </td>
                      <td className="pe-3 text-muted">
                        <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
        {!loading && orders.length < props.total && (
          <div className="flex justify-center border-t border-line p-3">
            <Button variant="ghost" size="lg" onClick={props.onShowMore}>
              {t('orderHistory.showMore', { count: Math.min(PAGE_SIZE, props.total - orders.length) })}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
