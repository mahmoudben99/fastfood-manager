import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, X, Check, Pencil, Minus, Plus, Trash2, Search } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { formatCurrency } from '../../utils/formatCurrency'

export function OrdersHistory() {
  const { t } = useTranslation()
  const { language } = useAppStore()
  const [orders, setOrders] = useState<any[]>([])
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [cancelConfirm, setCancelConfirm] = useState<any>(null)

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Receipt preview
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  // Edit state
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<any[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    loadOrders()
  }, [startDate, endDate])

  const loadOrders = async () => {
    const data = await window.api.orders.getByDateRange(startDate, endDate)
    setOrders(data)
  }

  const viewOrder = async (id: number) => {
    const order = await window.api.orders.getById(id)
    setSelectedOrder(order)
    setEditMode(false)
  }

  const markDone = async (id: number) => {
    await window.api.orders.updateStatus(id, 'completed')
    loadOrders()
    if (selectedOrder?.id === id) {
      const updated = await window.api.orders.getById(id)
      setSelectedOrder(updated)
    }
  }

  const confirmCancel = async () => {
    if (!cancelConfirm) return
    await window.api.orders.cancel(cancelConfirm.id)
    setCancelConfirm(null)
    loadOrders()
    if (selectedOrder?.id === cancelConfirm.id) {
      const updated = await window.api.orders.getById(cancelConfirm.id)
      setSelectedOrder(updated)
    }
  }

  // Edit helpers
  const startEdit = () => {
    if (!selectedOrder?.items) return
    setEditItems(
      selectedOrder.items.map((item: any) => ({
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        notes: item.notes,
        worker_id: item.worker_id
      }))
    )
    setEditMode(true)
  }

  const updateEditQty = (index: number, qty: number) => {
    if (qty < 1) {
      setEditItems(editItems.filter((_: any, i: number) => i !== index))
      return
    }
    const updated = [...editItems]
    updated[index] = { ...updated[index], quantity: qty }
    setEditItems(updated)
  }

  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_: any, i: number) => i !== index))
  }

  const saveEdit = async () => {
    if (!selectedOrder || editItems.length === 0) return
    setSavingEdit(true)
    try {
      const updated = await window.api.orders.updateItems(
        selectedOrder.id,
        editItems.map((item: any) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          notes: item.notes || undefined,
          worker_id: item.worker_id || undefined
        }))
      )
      setSelectedOrder(updated)
      setEditMode(false)
      loadOrders()
    } catch (err) {
      console.error('Failed to update order:', err)
    } finally {
      setSavingEdit(false)
    }
  }

  const editTotal = editItems.reduce((sum: number, item: any) => sum + item.unit_price * item.quantity, 0)

  const statusVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
    const map: Record<string, any> = {
      pending: 'info',
      preparing: 'info',
      ready: 'success',
      completed: 'success',
      cancelled: 'danger'
    }
    return map[status] || 'default'
  }

  const previewReceipt = async (orderId: number) => {
    const html = await window.api.printer.previewReceipt(orderId)
    if (html) setPreviewHtml(html)
  }

  const isOngoing = (status: string) => status === 'preparing' || status === 'pending'

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      // Search by order number, phone, or table
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesNumber = String(order.daily_number).includes(q)
        const matchesPhone = order.customer_phone?.toLowerCase().includes(q)
        const matchesTable = order.table_number?.toLowerCase().includes(q)
        if (!matchesNumber && !matchesPhone && !matchesTable) return false
      }
      return true
    })
  }, [orders, searchQuery, statusFilter])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('nav.ordersHistory')}</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <span className="self-center text-gray-400">-</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />

        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('orders.searchOrders')}
            className="ps-10 pe-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-48"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">{t('common.all')}</option>
          <option value="preparing">{t('orders.status.preparing')}</option>
          <option value="completed">{t('orders.status.completed')}</option>
          <option value="cancelled">{t('orders.status.cancelled')}</option>
        </select>

        <span className="self-center text-sm text-gray-400">
          {filteredOrders.length} {t('orders.ordersFound')}
        </span>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-start px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">{t('orders.title')}</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">{t('orders.total')}</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-end px-4 py-3 font-medium text-gray-600">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => viewOrder(order.id)}>
                <td className="px-4 py-3 font-medium">#{order.daily_number}</td>
                <td className="px-4 py-3 text-gray-500">{order.created_at}</td>
                <td className="px-4 py-3">
                  <Badge variant={order.order_type === 'delivery' ? 'info' : 'default'}>
                    {t(`orders.${order.order_type}`)}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-medium">{formatCurrency(order.total)}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(order.status)}>{t(`orders.status.${order.status}`)}</Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); viewOrder(order.id) }}>
                    {t('orders.viewReceipt')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <div className="text-center py-12 text-gray-400">{t('orders.noOrders')}</div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <Modal isOpen onClose={() => setCancelConfirm(null)} title={t('orders.cancelConfirm')} size="sm">
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-7 w-7 text-red-600" />
            </div>
            <p className="text-gray-600 mb-1">
              {t('orders.orderNumber', { number: cancelConfirm.daily_number })}
            </p>
            <p className="text-sm text-gray-500">{t('orders.cancelWarning')}</p>
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setCancelConfirm(null)} className="flex-1">
              {t('common.no')}
            </Button>
            <Button variant="danger" onClick={confirmCancel} className="flex-1">
              {t('orders.confirmCancel')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Order detail modal */}
      {selectedOrder && (
        <Modal isOpen onClose={() => { setSelectedOrder(null); setEditMode(false) }} title={t('orders.orderNumber', { number: selectedOrder.daily_number })} size="lg">
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <Badge variant={statusVariant(selectedOrder.status)}>
                {t(`orders.status.${selectedOrder.status}`)}
              </Badge>
              <Badge variant={selectedOrder.order_type === 'delivery' ? 'info' : 'default'}>
                {t(`orders.${selectedOrder.order_type}`)}
              </Badge>
              {selectedOrder.table_number && <span className="text-gray-500">{t('orders.tableNumber')}: {selectedOrder.table_number}</span>}
              {selectedOrder.customer_phone && <span>Tel: {selectedOrder.customer_phone}</span>}
            </div>

            {editMode ? (
              <div>
                <div className="space-y-2 mb-4">
                  {editItems.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">{item.menu_item_name}</span>
                        <p className="text-xs text-gray-500">{formatCurrency(item.unit_price)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateEditQty(i, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateEditQty(i, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeEditItem(i)}
                          className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 ms-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-lg font-bold mb-4">
                  <span>{t('orders.total')}</span>
                  <span className="text-orange-600">{formatCurrency(editTotal)}</span>
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditMode(false)} className="flex-1">
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={saveEdit} loading={savingEdit} disabled={editItems.length === 0} className="flex-1">
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-start px-3 py-2">{t('menu.name')}</th>
                        <th className="text-start px-3 py-2">{t('orders.quantity')}</th>
                        <th className="text-start px-3 py-2">{t('menu.price')}</th>
                        <th className="text-start px-3 py-2">{t('orders.notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">{item.menu_item_name}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{formatCurrency(item.total_price)}</td>
                          <td className="px-3 py-2 text-gray-500">{item.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between text-lg font-bold">
                  <span>{t('orders.total')}</span>
                  <span className="text-orange-600">{formatCurrency(selectedOrder.total)}</span>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => previewReceipt(selectedOrder.id)}
                  >
                    {t('orders.previewReceipt')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.api.printer.printReceipt(selectedOrder.id)}
                  >
                    {t('orders.printReceipt')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.api.printer.printKitchen(selectedOrder.id)}
                  >
                    {t('orders.printKitchen')}
                  </Button>
                </div>

                {isOngoing(selectedOrder.status) && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button variant="secondary" size="sm" onClick={startEdit}>
                      <Pencil className="h-4 w-4" />
                      {t('orders.editOrder')}
                    </Button>
                    <Button size="sm" onClick={() => markDone(selectedOrder.id)}>
                      <Check className="h-4 w-4" />
                      {t('orders.markDone')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setCancelConfirm(selectedOrder)}>
                      <X className="h-4 w-4" />
                      {t('orders.status.cancelled')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Receipt Preview Modal */}
      {previewHtml && (
        <Modal isOpen onClose={() => setPreviewHtml(null)} title={t('orders.previewReceipt')} size="sm">
          <div className="flex justify-center">
            <div
              className="bg-white border rounded-lg p-2 shadow-inner max-h-[70vh] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setPreviewHtml(null)} className="flex-1">
              {t('common.close')}
            </Button>
            {selectedOrder && (
              <Button onClick={() => { window.api.printer.printReceipt(selectedOrder.id); setPreviewHtml(null) }} className="flex-1">
                {t('orders.printReceipt')}
              </Button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
