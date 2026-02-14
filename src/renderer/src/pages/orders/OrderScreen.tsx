import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, ShoppingCart, Trash2, Minus, Plus, Phone, MessageSquare, Check, Printer, Moon, Sun, Search, ClipboardList, X, Hash, Pencil, AlertTriangle } from 'lucide-react'
import { useOrderStore, type CartItem } from '../../store/orderStore'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { formatCurrency } from '../../utils/formatCurrency'

interface MenuItemData {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  category_id: number
  image_path: string | null
  emoji: string | null
  category_name: string
}

interface CategoryData {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  icon: string | null
}

interface OrderItemData {
  id: number
  menu_item_id: number
  menu_item_name: string
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  worker_id: number | null
}

interface OrderData {
  id: number
  daily_number: number
  order_type: string
  table_number: string | null
  status: string
  total: number
  created_at: string
  notes: string | null
  customer_phone: string | null
  items?: OrderItemData[]
}

export function OrderScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { language, foodLanguage, darkMode, toggleDarkMode } = useAppStore()
  const store = useOrderStore()

  const [categories, setCategories] = useState<CategoryData[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemData[]>([])
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [noteModal, setNoteModal] = useState<{ index: number; notes: string } | null>(null)
  const [orderSuccess, setOrderSuccess] = useState<{ orderId: number; orderNumber: number } | null>(null)
  const [placing, setPlacing] = useState(false)

  // Order history state
  const [showHistory, setShowHistory] = useState(false)
  const [todayOrders, setTodayOrders] = useState<OrderData[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null)

  // Edit state
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<{ menu_item_id: number; menu_item_name: string; quantity: number; unit_price: number; notes: string | null; worker_id: number | null }[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Cancel confirmation
  const [cancelConfirm, setCancelConfirm] = useState<OrderData | null>(null)

  // Price edit modal
  const [priceModal, setPriceModal] = useState<{ index: number; price: string } | null>(null)

  // Ongoing order count for badge
  const [ongoingCount, setOngoingCount] = useState(0)

  // Size group expansion
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    loadOngoingCount()
  }, [])

  const loadData = async () => {
    const [cats, items] = await Promise.all([
      window.api.categories.getAll(),
      window.api.menu.getAll()
    ])
    setCategories(cats)
    setMenuItems(items)
    if (cats.length > 0) setActiveCategory(cats[0].id)
  }

  const searchRef = useRef<HTMLInputElement>(null)

  const loadOngoingCount = async () => {
    const orders = await window.api.orders.getToday()
    const count = orders.filter((o: any) => o.status === 'preparing' || o.status === 'pending').length
    setOngoingCount(count)
  }

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't fire shortcuts when typing in input fields (except for F-keys and Escape)
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)

    if (e.key === 'Escape') {
      if (noteModal) { setNoteModal(null); return }
      if (priceModal) { setPriceModal(null); return }
      if (orderSuccess) { setOrderSuccess(null); return }
      if (cancelConfirm) { setCancelConfirm(null); return }
      if (showHistory) { setShowHistory(false); setSelectedOrder(null); setEditMode(false); return }
      if (store.items.length > 0) { store.clearOrder(); return }
      return
    }

    if (e.key === 'F1') {
      e.preventDefault()
      const types = ['local', 'takeout', 'delivery'] as const
      const idx = types.indexOf(store.orderType as any)
      store.setOrderType(types[(idx + 1) % 3])
      return
    }

    if (e.key === 'F2') {
      e.preventDefault()
      if (store.items.length > 0 && !placing) {
        handlePlaceOrder()
      }
      return
    }

    if (e.key === 'F3') {
      e.preventDefault()
      if (!showHistory) openHistory()
      return
    }

    if (e.key === 'F4') {
      e.preventDefault()
      searchRef.current?.focus()
      return
    }

    if (e.key === 'Delete' && !isInput) {
      e.preventDefault()
      store.clearOrder()
      return
    }

    // Number keys 1-9 to select category (when not in input)
    if (!isInput && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey) {
      const idx = parseInt(e.key) - 1
      if (idx === 0) {
        setActiveCategory(null) // "All"
      } else if (idx - 1 < categories.length) {
        setActiveCategory(categories[idx - 1].id)
      }
      return
    }
  }, [store, noteModal, priceModal, orderSuccess, cancelConfirm, showHistory, placing, categories])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const loadTodayOrders = async () => {
    const orders = await window.api.orders.getToday()
    setTodayOrders(orders)
  }

  const openHistory = () => {
    loadTodayOrders()
    setShowHistory(true)
    setSelectedOrder(null)
    setEditMode(false)
  }

  const viewOrderDetails = async (order: OrderData) => {
    const full = await window.api.orders.getById(order.id)
    setSelectedOrder(full)
    setEditMode(false)
  }

  const getCategoryName = (cat: CategoryData) => {
    if (foodLanguage === 'ar' && cat.name_ar) return cat.name_ar
    if (foodLanguage === 'fr' && cat.name_fr) return cat.name_fr
    return cat.name
  }

  const getItemName = (item: MenuItemData | CartItem) => {
    if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
    if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
    return item.name
  }

  const matchesSearch = (i: MenuItemData, q: string) =>
    i.name.toLowerCase().includes(q) ||
    (i.name_ar && i.name_ar.includes(q)) ||
    (i.name_fr && i.name_fr.toLowerCase().includes(q))

  // Auto-switch to "All" when search has no results in current category
  useEffect(() => {
    if (!searchQuery.trim() || !activeCategory) return
    const q = searchQuery.toLowerCase()
    const hasInCategory = menuItems.some((i) => i.category_id === activeCategory && matchesSearch(i, q))
    if (!hasInCategory) {
      const hasInAll = menuItems.some((i) => matchesSearch(i, q))
      if (hasInAll) setActiveCategory(null)
    }
  }, [searchQuery])

  const filteredItems = menuItems.filter((i) => {
    if (activeCategory && i.category_id !== activeCategory) return false
    if (searchQuery.trim()) {
      return matchesSearch(i, searchQuery.toLowerCase())
    }
    return true
  })

  // Size suffixes to detect (order matters — check longer patterns first)
  const SIZE_PATTERNS = /\s+(XXL|XL|XS|S|M|L|Grande|Grand|Petit|Small|Medium|Large)\s*$/i

  // Group items that share the same base name but differ by size suffix (3+ variants only)
  const groupedItems = useMemo(() => {
    const groups: Record<string, { baseName: string; items: MenuItemData[] }> = {}
    const ungrouped: MenuItemData[] = []

    for (const item of filteredItems) {
      const name = getItemName(item)
      const match = name.match(SIZE_PATTERNS)
      if (match) {
        const baseName = name.slice(0, match.index!).trim()
        const key = `${item.category_id}::${baseName.toLowerCase()}`
        if (!groups[key]) groups[key] = { baseName, items: [] }
        groups[key].items.push(item)
      } else {
        ungrouped.push(item)
      }
    }

    // Build final list: groups with 3+ sizes become grouped, rest stay individual
    type GridEntry = { type: 'single'; item: MenuItemData } | { type: 'group'; key: string; baseName: string; emoji: string | null; categoryIcon: string | null; items: MenuItemData[] }
    const result: GridEntry[] = []

    const groupedIds = new Set<number>()
    for (const [key, group] of Object.entries(groups)) {
      if (group.items.length >= 3) {
        const first = group.items[0]
        result.push({
          type: 'group',
          key,
          baseName: group.baseName,
          emoji: first.emoji,
          categoryIcon: categories.find(c => c.id === first.category_id)?.icon || null,
          items: group.items.sort((a, b) => a.price - b.price)
        })
        group.items.forEach(i => groupedIds.add(i.id))
      }
    }

    // Add ungrouped and items from groups with < 3 variants
    for (const item of filteredItems) {
      if (!groupedIds.has(item.id)) {
        result.push({ type: 'single', item })
      }
    }

    return result
  }, [filteredItems, categories, foodLanguage])

  const getSizeLabel = (item: MenuItemData): string => {
    const name = getItemName(item)
    const match = name.match(SIZE_PATTERNS)
    return match ? match[1].toUpperCase() : name
  }

  const handleAddItem = (item: MenuItemData) => {
    store.addItem({
      menu_item_id: item.id,
      name: item.name,
      name_ar: item.name_ar,
      name_fr: item.name_fr,
      price: item.price,
      image_path: item.image_path,
      category_id: item.category_id
    })
  }

  const handlePlaceOrder = async () => {
    if (store.items.length === 0) return
    if (store.orderType === 'delivery' && !store.customerPhone.trim()) return

    setPlacing(true)
    try {
      const order = await window.api.orders.create({
        order_type: store.orderType,
        table_number: store.tableNumber || undefined,
        customer_phone: store.customerPhone || undefined,
        customer_name: store.customerName || undefined,
        notes: store.notes || undefined,
        items: store.items.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          notes: item.notes || undefined,
          worker_id: item.worker_id || undefined,
          unit_price: item.price
        }))
      })

      setOrderSuccess({ orderId: order.id, orderNumber: order.daily_number })
      store.clearOrder()
      loadOngoingCount()

      // Auto-print kitchen ticket
      window.api.printer.printKitchen(order.id).catch(() => {})
    } catch (err) {
      console.error('Failed to place order:', err)
    } finally {
      setPlacing(false)
    }
  }

  // --- Order history helpers ---
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'preparing': return 'bg-blue-100 text-blue-700'
      case 'ready':
      case 'completed': return 'bg-green-100 text-green-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const ongoingOrders = todayOrders.filter((o) => o.status === 'preparing' || o.status === 'pending')
  const doneOrders = todayOrders.filter((o) => o.status === 'completed' || o.status === 'cancelled')

  const markDone = async (id: number) => {
    await window.api.orders.updateStatus(id, 'completed')
    await loadTodayOrders()
    loadOngoingCount()
    if (selectedOrder?.id === id) {
      const updated = await window.api.orders.getById(id)
      setSelectedOrder(updated)
    }
  }

  const confirmCancel = async () => {
    if (!cancelConfirm) return
    await window.api.orders.cancel(cancelConfirm.id)
    setCancelConfirm(null)
    await loadTodayOrders()
    loadOngoingCount()
    if (selectedOrder?.id === cancelConfirm.id) {
      const updated = await window.api.orders.getById(cancelConfirm.id)
      setSelectedOrder(updated)
    }
  }

  // --- Edit helpers ---
  const startEdit = () => {
    if (!selectedOrder?.items) return
    setEditItems(
      selectedOrder.items.map((item) => ({
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
      setEditItems(editItems.filter((_, i) => i !== index))
      return
    }
    const updated = [...editItems]
    updated[index] = { ...updated[index], quantity: qty }
    setEditItems(updated)
  }

  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index))
  }

  const saveEdit = async () => {
    if (!selectedOrder || editItems.length === 0) return
    setSavingEdit(true)
    try {
      const updated = await window.api.orders.updateItems(
        selectedOrder.id,
        editItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          notes: item.notes || undefined,
          worker_id: item.worker_id || undefined
        }))
      )
      setSelectedOrder(updated)
      setEditMode(false)
      await loadTodayOrders()
    } catch (err) {
      console.error('Failed to update order:', err)
    } finally {
      setSavingEdit(false)
    }
  }

  const editTotal = editItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const subtotal = store.getSubtotal()

  return (
    <div className="h-screen flex bg-gray-100">
      {/* LEFT: Menu Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b px-4 py-3 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-bold text-gray-900">{t('orders.title')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={openHistory}
              className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <ClipboardList className="h-4 w-4" />
              {t('orders.today')}
              {ongoingCount > 0 && (
                <span className="absolute -top-2 -end-2 min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1 animate-pulse">
                  {ongoingCount}
                </span>
              )}
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Lock className="h-4 w-4" />
              {t('nav.admin')}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="bg-white border-b px-4 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setExpandedGroup(null) }}
              placeholder={`${t('menu.search')} (F4)`}
              className="w-full ps-10 pe-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => { setActiveCategory(null); setExpandedGroup(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === null
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('common.all')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setExpandedGroup(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.icon && <span>{cat.icon}</span>} {getCategoryName(cat)}
            </button>
          ))}
        </div>

        {/* Menu items grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {groupedItems.map((entry) => {
              if (entry.type === 'single') {
                const item = entry.item
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="bg-white rounded-xl border border-gray-200 p-3 text-start hover:shadow-md hover:border-orange-300 transition-all"
                  >
                    {item.image_path ? (
                      <>
                        <div className="aspect-square rounded-lg bg-gray-100 mb-2 overflow-hidden">
                          <img
                            src={`app-image://${item.image_path}`}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <h3 className="font-medium text-gray-900 text-sm truncate">
                          {getItemName(item)}
                        </h3>
                        <p className="text-orange-600 font-bold text-sm mt-1">
                          {formatCurrency(item.price)}
                        </p>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        {(item.emoji || categories.find(c => c.id === item.category_id)?.icon) && (
                          <span className="text-xl shrink-0">{item.emoji || categories.find(c => c.id === item.category_id)?.icon}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-gray-900 text-sm truncate">
                            {getItemName(item)}
                          </h3>
                          <p className="text-orange-600 font-bold text-sm">
                            {formatCurrency(item.price)}
                          </p>
                        </div>
                      </div>
                    )}
                  </button>
                )
              }

              // Grouped item (3+ sizes)
              const isExpanded = expandedGroup === entry.key
              return (
                <div key={entry.key} className="relative">
                  {!isExpanded ? (
                    <button
                      onClick={() => setExpandedGroup(entry.key)}
                      className="w-full bg-white rounded-xl border-2 border-orange-200 p-3 text-start hover:shadow-md hover:border-orange-400 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        {(entry.emoji || entry.categoryIcon) && (
                          <span className="text-xl shrink-0">{entry.emoji || entry.categoryIcon}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-gray-900 text-sm truncate">{entry.baseName}</h3>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-orange-600 font-bold text-xs">{formatCurrency(entry.items[0].price)}</span>
                            <span className="text-gray-400 text-xs">-</span>
                            <span className="text-orange-600 font-bold text-xs">{formatCurrency(entry.items[entry.items.length - 1].price)}</span>
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {entry.items.map((_, i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                          ))}
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="bg-white rounded-xl border-2 border-orange-400 p-2 shadow-lg animate-slide-up">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-1.5">
                          {(entry.emoji || entry.categoryIcon) && (
                            <span className="text-base">{entry.emoji || entry.categoryIcon}</span>
                          )}
                          <span className="font-semibold text-gray-900 text-xs truncate">{entry.baseName}</span>
                        </div>
                        <button
                          onClick={() => setExpandedGroup(null)}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        {entry.items.map((sizeItem) => (
                          <button
                            key={sizeItem.id}
                            onClick={() => { handleAddItem(sizeItem); setExpandedGroup(null) }}
                            className="flex-1 py-2 px-1 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-400 transition-all text-center"
                          >
                            <div className="font-bold text-gray-900 text-xs">{getSizeLabel(sizeItem)}</div>
                            <div className="text-orange-600 font-bold text-xs mt-0.5">{formatCurrency(sizeItem.price)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingCart className="h-12 w-12 mb-3" />
              <p>{t('menu.noItems')}</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div className="w-96 bg-white border-s flex flex-col shrink-0">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">{t('orders.cart')}</h2>
            {store.items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={store.clearOrder}>
                <Trash2 className="h-4 w-4" />
                {t('orders.clearCart')}
              </Button>
            )}
          </div>

          {/* Order type toggle */}
          <div className="flex gap-1 mt-3">
            {(['local', 'takeout', 'delivery'] as const).map((type) => (
              <button
                key={type}
                onClick={() => store.setOrderType(type)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  store.orderType === type
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(`orders.${type === 'local' ? 'local' : type}`)}
              </button>
            ))}
          </div>

          {/* Table number for local orders */}
          {store.orderType === 'local' && (
            <div className="mt-3 relative">
              <Hash className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={store.tableNumber}
                onChange={(e) => store.setTableNumber(e.target.value)}
                placeholder={t('orders.tableNumberPlaceholder')}
                className="w-full ps-10 pe-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          )}

          {/* Phone for delivery */}
          {store.orderType === 'delivery' && (
            <div className="mt-3 relative">
              <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="tel"
                value={store.customerPhone}
                onChange={(e) => store.setCustomerPhone(e.target.value)}
                placeholder={t('orders.phonePlaceholder')}
                className="w-full ps-10 pe-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {store.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingCart className="h-10 w-10 mb-2" />
              <p className="text-sm">{t('orders.empty')}</p>
            </div>
          ) : (
            store.items.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 text-sm truncate">
                      {getItemName(item)}
                    </h4>
                    <p className="text-orange-600 text-sm font-medium">
                      {formatCurrency(item.price)}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{item.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => store.removeItem(index)}
                    className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => store.updateQuantity(index, item.quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => store.updateQuantity(index, item.quantity + 1)}
                      className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPriceModal({ index, price: String(item.price) })}
                      className="p-1.5 rounded hover:bg-orange-100 text-gray-400 hover:text-orange-600"
                      title={t('orders.editPrice')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        setNoteModal({ index, notes: item.notes })
                      }
                      className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                    <span className="font-bold text-sm">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total & Place Order */}
        <div className="border-t p-4 space-y-3 shrink-0">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('orders.subtotal')}</span>
            <span className="font-bold text-lg">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900">{t('orders.total')}</span>
            <span className="font-bold text-xl text-orange-600">{formatCurrency(subtotal)}</span>
          </div>

          <Button
            onClick={handlePlaceOrder}
            loading={placing}
            disabled={
              store.items.length === 0 ||
              (store.orderType === 'delivery' && !store.customerPhone.trim())
            }
            className="w-full"
            size="lg"
          >
            {t('orders.placeOrder')} (F2)
          </Button>
        </div>
      </div>

      {/* Notes modal */}
      {noteModal && (
        <Modal
          isOpen
          onClose={() => setNoteModal(null)}
          title={t('orders.notes')}
          size="sm"
        >
          <textarea
            value={noteModal.notes}
            onChange={(e) => setNoteModal({ ...noteModal, notes: e.target.value })}
            placeholder={t('orders.notesPlaceholder')}
            rows={4}
            className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            autoFocus
          />
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setNoteModal(null)} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                store.updateItemNotes(noteModal.index, noteModal.notes)
                setNoteModal(null)
              }}
              className="flex-1"
            >
              {t('common.save')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Price edit modal */}
      {priceModal && (
        <Modal
          isOpen
          onClose={() => setPriceModal(null)}
          title={t('orders.editPrice')}
          size="sm"
        >
          <div className="space-y-3">
            <input
              type="number"
              value={priceModal.price}
              onChange={(e) => setPriceModal({ ...priceModal, price: e.target.value })}
              step="0.01"
              min="0"
              className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg font-bold text-center"
              autoFocus
            />
            <p className="text-xs text-gray-500 text-center">{t('orders.notesPlaceholder')}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPriceModal(null)} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => {
                  const newPrice = parseFloat(priceModal.price)
                  if (!isNaN(newPrice) && newPrice >= 0) {
                    store.updateItemPrice(priceModal.index, newPrice)
                  }
                  setPriceModal(null)
                }}
                className="flex-1"
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Order success modal */}
      {orderSuccess && (
        <Modal isOpen onClose={() => setOrderSuccess(null)} size="sm">
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('orders.orderPlaced')}</h2>
            <p className="text-3xl font-bold text-orange-600">
              {t('orders.orderNumber', { number: orderSuccess.orderNumber })}
            </p>
            <div className="flex gap-2 mt-6 justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.api.printer.printReceipt(orderSuccess.orderId)}
              >
                <Printer className="h-4 w-4" />
                {t('orders.printReceipt')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.api.printer.printKitchen(orderSuccess.orderId)}
              >
                <Printer className="h-4 w-4" />
                {t('orders.printKitchen')}
              </Button>
            </div>
            <Button onClick={() => setOrderSuccess(null)} className="mt-4">
              {t('common.close')}
            </Button>
          </div>
        </Modal>
      )}

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

      {/* Order History Modal */}
      {showHistory && (
        <Modal isOpen onClose={() => { setShowHistory(false); setSelectedOrder(null); setEditMode(false) }} title={t('orders.today')} size="lg">
          {selectedOrder ? (
            <div>
              <button
                onClick={() => { setSelectedOrder(null); setEditMode(false) }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <X className="h-4 w-4" />
                {t('common.back')}
              </button>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {t('orders.orderNumber', { number: selectedOrder.daily_number })}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {formatTime(selectedOrder.created_at)}
                    {selectedOrder.table_number && ` \u2022 ${t('orders.tableNumber')}: ${selectedOrder.table_number}`}
                    {selectedOrder.order_type === 'delivery' && selectedOrder.customer_phone && ` \u2022 ${selectedOrder.customer_phone}`}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                  {t(`orders.status.${selectedOrder.status}`)}
                </span>
              </div>

              {/* Edit mode */}
              {editMode ? (
                <div>
                  <div className="space-y-2 mb-4">
                    {editItems.map((item, i) => (
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

                  <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg mb-4">
                    <span className="font-bold text-gray-900">{t('orders.total')}</span>
                    <span className="font-bold text-lg text-orange-600">{formatCurrency(editTotal)}</span>
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
                <div>
                  {/* View mode */}
                  <div className="space-y-2 mb-4">
                    {selectedOrder.items?.map((item, i) => (
                      <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{item.menu_item_name || 'Unknown'}</span>
                          <span className="text-xs text-gray-500 ms-2">x{item.quantity}</span>
                          {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
                        </div>
                        <span className="text-sm font-medium">{formatCurrency(item.total_price)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg mb-4">
                    <span className="font-bold text-gray-900">{t('orders.total')}</span>
                    <span className="font-bold text-lg text-orange-600">{formatCurrency(selectedOrder.total)}</span>
                  </div>

                  {/* Print buttons */}
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => window.api.printer.printReceipt(selectedOrder.id)}
                      className="flex-1"
                    >
                      <Printer className="h-4 w-4" />
                      {t('orders.printReceipt')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => window.api.printer.printKitchen(selectedOrder.id)}
                      className="flex-1"
                    >
                      <Printer className="h-4 w-4" />
                      {t('orders.printKitchen')}
                    </Button>
                  </div>

                  {/* Action buttons for ongoing orders */}
                  {(selectedOrder.status === 'preparing' || selectedOrder.status === 'pending') && (
                    <div className="flex gap-2 pt-3 border-t">
                      <Button variant="secondary" size="sm" onClick={startEdit} className="flex-1">
                        <Pencil className="h-4 w-4" />
                        {t('orders.editOrder')}
                      </Button>
                      <Button size="sm" onClick={() => markDone(selectedOrder.id)} className="flex-1">
                        <Check className="h-4 w-4" />
                        {t('orders.markDone')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setCancelConfirm(selectedOrder)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto space-y-6">
              {todayOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ClipboardList className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-sm">{t('orders.noOrders')}</p>
                </div>
              ) : (
                <>
                  {/* Ongoing orders */}
                  {ongoingOrders.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-2">
                        🔥 {t('orders.ongoing')} ({ongoingOrders.length})
                      </h3>
                      <div className="space-y-2">
                        {ongoingOrders.map((order) => (
                          <button
                            key={order.id}
                            onClick={() => viewOrderDetails(order)}
                            className="w-full flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-start border border-blue-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                                #{order.daily_number}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {t('orders.orderNumber', { number: order.daily_number })}
                                  {order.table_number && <span className="text-gray-500 ms-2">T{order.table_number}</span>}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatTime(order.created_at)} &middot; {t(`orders.${order.order_type === 'local' ? 'local' : order.order_type}`)}
                                </p>
                              </div>
                            </div>
                            <span className="font-bold text-sm text-gray-900">{formatCurrency(order.total)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Done orders */}
                  {doneOrders.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                        ✅ {t('orders.done')} ({doneOrders.length})
                      </h3>
                      <div className="space-y-2">
                        {doneOrders.map((order) => (
                          <button
                            key={order.id}
                            onClick={() => viewOrderDetails(order)}
                            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-start"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                                order.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                              }`}>
                                #{order.daily_number}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {t('orders.orderNumber', { number: order.daily_number })}
                                  {order.table_number && <span className="text-gray-500 ms-2">T{order.table_number}</span>}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatTime(order.created_at)} &middot; {t(`orders.${order.order_type === 'local' ? 'local' : order.order_type}`)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                                {t(`orders.status.${order.status}`)}
                              </span>
                              <span className="font-bold text-sm text-gray-900">{formatCurrency(order.total)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
