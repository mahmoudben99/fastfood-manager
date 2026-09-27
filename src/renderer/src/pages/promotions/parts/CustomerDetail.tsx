import { useTranslation } from 'react-i18next'
import { ArrowLeft, MessageCircle, Phone, Receipt, ShoppingCart, Star, Wallet } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Money, cn } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { formatClock, formatDay, localName, type MenuItemLite } from './promoTypes'

export interface Customer {
  id: number
  phone: string
  phone_normalized: string
  name: string | null
  total_spent: number
  order_count: number
  last_order_date: string | null
  notes: string | null
}

/**
 * customers:getFavorites returns { menu_item_id, total } (older builds: { name, total_quantity });
 * names are resolved from the menu in the food language.
 */
export interface FavoriteRow {
  menu_item_id?: number
  total?: number
  name?: string
  total_quantity?: number
}

interface CustomerDetailProps {
  customer: Customer
  orders: any[]
  favorites: FavoriteRow[]
  menuItems: MenuItemLite[]
  onBack: () => void
}

export function CustomerDetail({ customer, orders, favorites, menuItems, onBack }: CustomerDetailProps) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const favoriteName = (row: FavoriteRow) => {
    const menuItem = menuItems.find((m) => m.id === row.menu_item_id)
    return menuItem ? localName(menuItem, foodLanguage) : row.name || (row.menu_item_id ? `#${row.menu_item_id}` : '—')
  }
  const favoriteQty = (row: FavoriteRow) => Number(row.total ?? row.total_quantity ?? 0)
  const maxQty = Math.max(1, ...favorites.map(favoriteQty))

  const openWhatsApp = () => {
    // WhatsApp requires an international number without '+' or a domestic trunk zero. Keep
    // showing the cashier-entered form, but use the canonical identity for the deep link.
    const whatsappPhone = (customer.phone_normalized || customer.phone).replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${whatsappPhone}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <IconButton
            icon={<ArrowLeft className="rtl:-scale-x-100" />}
            label={t('loyalty.backToCustomers')}
            variant="secondary"
            size="lg"
            onClick={onBack}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-ink"><bdi>{customer.name || customer.phone}</bdi></h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                <bdi dir="ltr" className="num">{customer.phone}</bdi>
              </span>
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4" />
                {t('loyalty.ordersCount', { count: customer.order_count })}
              </span>
              <span className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4" />
                {t('loyalty.totalSpent')}
                <span className="font-semibold text-ink"><Money value={customer.total_spent} /></span>
              </span>
            </div>
            {customer.last_order_date && (
              <p className="num mt-1 text-xs text-muted">
                {t('loyalty.lastOrderLabel', { date: formatDay(customer.last_order_date) })}
              </p>
            )}
          </div>
          <Button variant="success" size="lg" icon={<MessageCircle className="h-5 w-5" />} onClick={openWhatsApp}>
            {t('loyalty.whatsapp')}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t('loyalty.favoriteItems')} icon={<Star />}>
          {favorites.length === 0 ? (
            <EmptyState compact icon={<Star />} title={t('loyalty.noOrderData')} />
          ) : (
            <ol className="space-y-3.5">
              {favorites.map((row, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      i === 0 ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-muted'
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink"><bdi>{favoriteName(row)}</bdi></span>
                      <span className="num shrink-0 text-sm font-bold text-ink-2">{favoriteQty(row)}×</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn('h-full rounded-full', i === 0 ? 'bg-ember' : 'bg-primary-soft-2')}
                        style={{ width: `${(favoriteQty(row) / maxQty) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title={t('loyalty.recentOrders')} icon={<Receipt />} padding={false}>
          {orders.length === 0 ? (
            <EmptyState compact icon={<Receipt />} title={t('loyalty.noOrdersYet')} />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {orders.map((order) => (
                <li key={order.id} className="flex min-h-14 items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{t('loyalty.orderNumber', { n: order.daily_number })}</p>
                    <p className="num text-xs text-muted">
                      {formatDay(order.order_date)} {formatClock(order.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {order.status === 'cancelled' && (
                      <Badge variant="danger">{t('orderHistory.status.cancelled')}</Badge>
                    )}
                    <span className={cn('text-sm font-bold', order.status === 'cancelled' ? 'text-muted line-through' : 'text-ink')}>
                      <Money value={order.total} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
