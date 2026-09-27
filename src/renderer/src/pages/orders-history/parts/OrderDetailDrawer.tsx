import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Check, ChefHat, FileText, Info, Pencil, Phone, Printer, ReceiptText, ShoppingBag, StickyNote, User, X, XCircle
} from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, IconButton, Skeleton, SkeletonText, Tabs, cn } from '../../../components/ui'
import { orderEditRejection } from '../../../../../shared/order-edit'
import { DeliveryInfo } from './DeliveryInfo'
import { Drawer, DrawerBody, DrawerFooter } from './Drawer'
import { EditView, InvoiceView } from './DrawerViews'
import {
  DetailSection, OrderStatusBadge, OrderTypeBadge, PaymentBadge, effectivePaymentStatus, formatDayClock, isOngoing
} from './labels'
import { OrderLines, OrderTotals } from './OrderItemsView'
import { PaymentPanel } from './PaymentPanel'
import { ReceiptPreview } from './ReceiptPreview'
import { useOrderDetail } from './useOrderDetail'
import type { HistoryOrder } from './types'

type Mode = 'details' | 'receipt' | 'edit' | 'invoice'

function CustomerBlock({ order }: { order: HistoryOrder }) {
  const { t } = useTranslation()
  if (!order.customer_name && !order.customer_phone && !order.table_number && !order.notes) return null
  return (
    <DetailSection icon={<User />} title={t('orderHistory.detail.customer')}>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {order.customer_name && <span className="font-semibold text-ink"><bdi>{order.customer_name}</bdi></span>}
        {order.customer_phone && (
          <span className="flex items-center gap-1.5 text-ink-2">
            <Phone className="h-4 w-4 text-muted" />
            <bdi dir="ltr" className="num">{order.customer_phone}</bdi>
          </span>
        )}
        {order.table_number && (
          <span className="text-ink-2">{t('orderHistory.tableLabel', { n: order.table_number })}</span>
        )}
      </div>
      {order.notes && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 break-words">
            <span className="font-semibold">{t('orderHistory.detail.orderNote')}: </span>
            {order.notes}
          </span>
        </p>
      )}
    </DetailSection>
  )
}

function LoadingBody() {
  return (
    <DrawerBody>
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <Skeleton className="h-5 w-32" />
        <SkeletonText lines={4} />
      </div>
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <Skeleton className="h-5 w-24" />
        <SkeletonText lines={2} />
      </div>
    </DrawerBody>
  )
}

/**
 * Order detail side sheet: items (options + combo picks), payments, delivery, receipt preview,
 * reprints, invoice, and — for today's ongoing orders — edit / done / cancel.
 */
export function OrderDetailDrawer({ orderId, onClose, onChanged }: { orderId: number | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation()
  const titleId = useId()
  const detail = useOrderDetail(orderId, onChanged)
  const [mode, setMode] = useState<Mode>('details')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [markingDone, setMarkingDone] = useState(false)

  useEffect(() => {
    setMode('details')
    setConfirmCancel(false)
    setCancelError('')
  }, [orderId])

  const order = detail.order?.id === orderId ? detail.order : null
  const ongoing = order ? isOngoing(order.status) : false
  const rejection = order ? orderEditRejection(order) : null

  const doCancel = async () => {
    if (!order) return
    setCancelBusy(true)
    setCancelError('')
    try {
      const cancelled = await detail.cancelOrder(order)
      if (cancelled) setConfirmCancel(false)
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : String(error))
    } finally {
      setCancelBusy(false)
    }
  }

  const doMarkDone = async () => {
    if (!order) return
    setMarkingDone(true)
    await detail.markDone(order)
    setMarkingDone(false)
  }

  const header = !order ? (
    <header className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
      <div className="min-w-0 flex-1 space-y-2.5" id={titleId}>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <IconButton icon={<X />} label={t('common.close')} size="lg" onClick={onClose} />
    </header>
  ) : (
    <header className={cn('bg-surface px-5 pt-4', mode !== 'details' && mode !== 'receipt' && 'border-b border-line')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id={titleId} className="text-2xl font-extrabold tracking-tight text-ink">
              {t('orders.orderNumber', { number: order.daily_number })}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <OrderStatusBadge status={order.status} />
              <OrderTypeBadge type={order.order_type} />
              <PaymentBadge status={detail.payment?.status ?? effectivePaymentStatus(order.payment_status, order.status)} />
            </div>
          </div>
          <p className="mt-1 text-sm text-muted">
            <span className="num">{formatDayClock(order.created_at)}</span>
            {order.cashier_name && <> · <bdi>{order.cashier_name}</bdi></>}
          </p>
        </div>
        <IconButton icon={<X />} label={t('common.close')} size="lg" onClick={onClose} />
      </div>
      {mode === 'details' || mode === 'receipt' ? (
        <Tabs
          className="mt-2 -mx-5 px-3"
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'details', label: t('orderHistory.detail.tabDetails'), icon: <ShoppingBag /> },
            { id: 'receipt', label: t('orderHistory.detail.tabReceipt'), icon: <ReceiptText /> }
          ]}
        />
      ) : (
        <div className="mt-2 flex min-h-12 items-center gap-2 pb-2">
          <IconButton
            icon={<ArrowLeft className="rtl:-scale-x-100" />}
            label={t('common.back')}
            onClick={() => setMode('details')}
          />
          <span className="text-base font-semibold text-ink">
            {mode === 'edit'
              ? t('orderHistory.edit.title', { number: order.daily_number })
              : t('orderHistory.invoice.title')}
          </span>
        </div>
      )}
    </header>
  )

  const printing = detail.printing
  const actions = order && (
    <DrawerFooter>
      {ongoing ? (
        // One row: reprints as icons (name = tooltip), then edit / cancel, then the one primary.
        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon={<Printer />} label={t('orders.printReceipt')} variant="secondary" size="lg"
            loading={printing === 'receipt'} onClick={() => void detail.printReceipt(order.id)} />
          <IconButton icon={<ChefHat />} label={t('orders.printKitchen')} variant="secondary" size="lg"
            loading={printing === 'kitchen'} onClick={() => void detail.printKitchen(order.id)} />
          <IconButton icon={<FileText />} label={t('orderHistory.action.invoice')} variant="secondary" size="lg"
            onClick={() => setMode('invoice')} />
          <span className="mx-1 h-8 w-px bg-line" aria-hidden="true" />
          {rejection === null && (
            <IconButton icon={<Pencil />} label={t('orders.editOrder')} variant="secondary" size="lg" onClick={() => setMode('edit')} />
          )}
          <IconButton icon={<XCircle />} label={t('orders.cancelOrder')} variant="danger" size="lg"
            onClick={() => { setCancelError(''); setConfirmCancel(true) }} />
          <Button size="lg" icon={<Check className="h-5 w-5" />} loading={markingDone} onClick={doMarkDone} className="min-w-32 flex-1">
            {t('orders.markDone')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="lg" cooldownMs={800} loading={printing === 'receipt'}
            icon={<Printer className="h-5 w-5" />} onClick={() => void detail.printReceipt(order.id)}>
            {t('orderHistory.action.receipt')}
          </Button>
          <Button variant="secondary" size="lg" cooldownMs={800} loading={printing === 'kitchen'}
            icon={<ChefHat className="h-5 w-5" />} onClick={() => void detail.printKitchen(order.id)}>
            {t('orderHistory.action.kitchen')}
          </Button>
          <Button variant="secondary" size="lg" icon={<FileText className="h-5 w-5" />}
            disabled={order.status === 'cancelled'} onClick={() => setMode('invoice')}>
            {t('orderHistory.action.invoice')}
          </Button>
        </div>
      )}
    </DrawerFooter>
  )

  let body
  if (!order) {
    body = detail.failed && !detail.loading ? (
      <DrawerBody>
        <EmptyState compact icon={<ReceiptText />} title={t('orderHistory.detail.loadFailed')} />
      </DrawerBody>
    ) : (
      <LoadingBody />
    )
  } else if (mode === 'edit') {
    body = <EditView order={order} onSave={(lines) => detail.saveEdit(order, lines)} onDone={() => setMode('details')} />
  } else if (mode === 'invoice') {
    body = <InvoiceView order={order} onBack={() => setMode('details')} />
  } else {
    body = (
      <>
        {/* keyed by tab: switching Details/Receipt starts at the top */}
        <DrawerBody key={mode}>
          {mode === 'receipt' ? (
            <ReceiptPreview orderId={order.id} version={detail.version} />
          ) : (
            <>
              {ongoing && rejection === 'past_day' && (
                // Same business rule the main process enforces: only today's orders are
                // editable. Explain instead of offering an Edit that can never save.
                <div className="flex items-start gap-2.5 rounded-2xl bg-warning-soft p-3 text-sm text-warning-ink">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t('orderHistory.edit.lockedPastDay')}</p>
                </div>
              )}
              <CustomerBlock order={order} />
              <DetailSection icon={<ShoppingBag />} title={t('orderHistory.detail.items')}>
                <OrderLines items={order.items} />
                <div className="mt-4 border-t border-line pt-3">
                  <OrderTotals order={order} />
                </div>
              </DetailSection>
              <PaymentPanel
                summary={detail.payment}
                orderStatus={order.status}
                paymentStatus={order.payment_status}
                total={order.total}
              />
              {order.order_type === 'delivery' && (
                <DeliveryInfo delivery={detail.delivery} fee={order.delivery_fee ?? 0} />
              )}
            </>
          )}
        </DrawerBody>
        {actions}
      </>
    )
  }

  return (
    <Drawer open={orderId !== null} onClose={onClose} dismissible={!confirmCancel && mode !== 'edit' && mode !== 'invoice'} labelledBy={titleId}>
      {header}
      {body}
      {order && (
        <ConfirmDialog
          isOpen={confirmCancel}
          title={t('orders.cancelConfirm')}
          message={
            <>
              <span className="block font-semibold text-ink-2">{t('orders.orderNumber', { number: order.daily_number })}</span>
              {t('orders.cancelWarning')}
            </>
          }
          confirmLabel={t('orders.confirmCancel')}
          cancelLabel={t('common.no')}
          busy={cancelBusy}
          error={cancelError}
          onConfirm={() => void doCancel()}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </Drawer>
  )
}
