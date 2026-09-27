import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RemoteOrderInbox } from '../../components/RemoteOrderInbox' // WP-G remote inbox mount (import)
import { useAppStore } from '../../store/appStore'
import { useOrderStore, type OrderType } from '../../store/orderStore'
import { DayRecapModal } from '../analytics/DayRecapModal'
import { CategoryRail } from './components/CategoryRail'
import { HistoryModal } from './components/history/HistoryModal'
import { MenuGrid } from './components/MenuGrid'
import { PaymentHost } from './components/PaymentHost'
import { Milestone, RecapGate, ShiftPrompt } from './components/Overlays'
import { SheetHost } from './components/SheetHost'
import { SuccessModal } from './components/SuccessModal'
import { Ticket } from './components/Ticket'
import { PrintAlerts } from './components/TicketAlerts'
import { TopBar } from './components/TopBar'
import { useCartActions } from './hooks/useCartActions'
import { useCheckout } from './hooks/useCheckout'
import { useCustomerDisplay, usePrintJobs } from './hooks/useFeeds'
import { useMenuData } from './hooks/useMenuData'
import { useOrderShortcuts } from './hooks/useOrderShortcuts'
import { useTodayOrders } from './hooks/useTodayOrders'
import { clearCartWithUndo } from './lib/cartActions'
import type { SortDirection, SortMode } from './lib/menuGrid'
import { TouchKeyboardProvider } from './touchKeyboard'
import type { SheetState } from './types'
import './orders.css'

const ORDER_TYPES: OrderType[] = ['local', 'takeout', 'delivery']

/**
 * The POS order screen (v4 "Ember"): category rail | fixed-position item grid | receipt ticket.
 * State lives in the order store; this component only wires data feeds, sheets and shortcuts.
 */
export function OrderScreen() {
  const isTouch = useAppStore((s) => s.inputMode === 'touchscreen')
  return (
    <TouchKeyboardProvider enabled={isTouch}>
      <OrderScreenBody isTouch={isTouch} />
    </TouchKeyboardProvider>
  )
}

function OrderScreenBody({ isTouch }: { isTouch: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const menu = useMenuData()
  const today = useTodayOrders()
  const printJobs = usePrintJobs()
  useCustomerDisplay()

  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [compact, setCompact] = useState(true)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [recap, setRecap] = useState<'gate' | 'open' | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void useOrderStore.getState().loadActivePromos()
    window.api.settings.getAll().then((s: Record<string, string>) => {
      if (s.menu_sort_mode === 'name' || s.menu_sort_mode === 'price') setSortMode(s.menu_sort_mode)
      if (s.menu_sort_direction === 'asc' || s.menu_sort_direction === 'desc') setSortDirection(s.menu_sort_direction)
      if (s.menu_compact_mode !== undefined) setCompact(s.menu_compact_mode !== 'false')
    }).catch(() => {})
  }, [])

  // Start on the first category (as v3); a search with no hit in it widens to All.
  useEffect(() => {
    if (menu.categories.length > 0) setActiveCategory((current) => current ?? menu.categories[0].id)
  }, [menu.categories])

  const openSheet = useCallback((next: SheetState) => setSheet(next), [])
  const closeSheet = useCallback(() => setSheet(null), [])
  const checkout = useCheckout({
    onNeedDelivery: () => setSheet({ kind: 'delivery' }),
    afterSave: today.pushQueue,
    refreshMenu: menu.refresh
  })

  const actions = useCartActions(menu, openSheet, () => {
    setHistoryOpen(false)
    checkout.dismissError()
  })

  const onSearch = useCallback((value: string) => {
    setSearch(value)
    if (!value.trim() || activeCategory === null) return
    const q = value.trim().toLowerCase()
    const inCategory = menu.items.some((i) => i.category_id === activeCategory && (i.name.toLowerCase().includes(q) || i.name_fr?.toLowerCase().includes(q) || i.name_ar?.includes(value.trim())))
    if (!inCategory) setActiveCategory(null)
  }, [activeCategory, menu.items])

  const onSort = useCallback((mode: SortMode) => {
    const direction: SortDirection = mode === sortMode ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortMode(mode)
    setSortDirection(direction)
    void window.api.settings.setMultiple({ menu_sort_mode: mode, menu_sort_direction: direction })
  }, [sortMode, sortDirection])

  const onToggleCompact = useCallback(() => {
    setCompact((value) => {
      void window.api.settings.set('menu_compact_mode', value ? 'false' : 'true')
      return !value
    })
  }, [])

  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const item of menu.items) map.set(item.category_id, (map.get(item.category_id) || 0) + 1)
    return map
  }, [menu.items])

  const overlayOpen = sheet !== null || historyOpen || recap !== null || checkout.paymentOpen || checkout.success !== null || checkout.shiftPrompt
  useOrderShortcuts({
    overlayOpen,
    onCycleType: () => {
      const s = useOrderStore.getState()
      s.setOrderType(ORDER_TYPES[(ORDER_TYPES.indexOf(s.orderType) + 1) % ORDER_TYPES.length])
    },
    onPay: checkout.pay,
    onHistory: () => setHistoryOpen(true),
    onFocusSearch: (typed) => {
      if (typed !== undefined) onSearch(typed)
      searchRef.current?.focus()
    },
    onEscape: (fromField) => {
      if (search) {
        setSearch('')
        searchRef.current?.blur()
      } else if (fromField) {
        ;(document.activeElement as HTMLElement | null)?.blur()
      } else if (clearCartWithUndo(t)) checkout.dismissError()
    },
    onClearCart: () => {
      if (clearCartWithUndo(t)) checkout.dismissError()
    },
    onCategoryKey: (n) => setActiveCategory(n === 1 ? null : menu.categories[n - 2]?.id ?? activeCategory)
  })

  return (
    <div className="pos-layout h-screen grid bg-canvas text-ink overflow-hidden">
      {/* WP-G remote inbox: bottom-start, clear of the ticket and Pay button */}<RemoteOrderInbox />
      <TopBar
        searchRef={searchRef}
        search={search}
        onSearch={onSearch}
        sortMode={sortMode}
        sortDirection={sortDirection}
        onSort={onSort}
        compact={compact}
        onToggleCompact={onToggleCompact}
        ongoingCount={today.ongoingCount}
        readyCount={today.orders.filter((o) => today.readyIds.has(o.id) && (o.status === 'preparing' || o.status === 'pending')).length}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenRecap={() => setRecap('gate')}
        onAdmin={() => navigate('/admin')}
      />
      <CategoryRail
        categories={menu.categories}
        counts={counts}
        total={menu.items.length}
        active={activeCategory}
        onSelect={setActiveCategory}
        foodLanguage={foodLanguage}
        showKeys={!isTouch}
      />
      <main className="min-h-0 min-w-0 flex flex-col">
        <PrintAlerts attention={printJobs.attention} active={printJobs.active} onRetry={printJobs.retry} onDismiss={printJobs.dismiss} />
        <MenuGrid
          items={menu.items}
          categories={menu.categories}
          activeCategory={activeCategory}
          search={search}
          sortMode={sortMode}
          sortDirection={sortDirection}
          compact={compact}
          foodLanguage={foodLanguage}
          isTouch={isTouch}
          groupsById={menu.groupsById}
          catalogVersion={menu.catalogVersion}
          onTap={actions.tapItem}
          onCustomize={actions.customizeItem}
        />
      </main>
      <Ticket
        checkout={checkout}
        lang={foodLanguage}
        isTouch={isTouch}
        onEditLine={actions.editLine}
        onOpenNote={() => setSheet({ kind: 'orderNote' })}
        onOpenDiscount={() => setSheet({ kind: 'discount' })}
        onOpenDelivery={() => setSheet({ kind: 'delivery' })}
        onAddSuggestion={actions.addById}
      />

      {sheet && (
        <SheetHost
          sheet={sheet}
          menu={menu}
          lang={foodLanguage}
          noteSuggestions={today.noteSuggestions}
          validation={checkout.validation}
          onClose={closeSheet}
          onRepeat={actions.repeatOrder}
        />
      )}
      <PaymentHost open={checkout.paymentOpen} busy={checkout.busy} onCancel={checkout.closePayment} onConfirm={checkout.confirmPayment} />
      {historyOpen && (
        <HistoryModal
          orders={today.orders}
          readyIds={today.readyIds}
          onClose={() => setHistoryOpen(false)}
          onChanged={today.pushQueue}
          onEdit={actions.startEditOrder}
        />
      )}
      {checkout.success && <SuccessModal info={checkout.success} onClose={checkout.closeSuccess} />}
      {checkout.shiftPrompt && <ShiftPrompt onClose={checkout.closeShiftPrompt} onRetry={() => checkout.retry()} />}
      {recap === 'gate' && <RecapGate onClose={() => setRecap(null)} onUnlocked={() => setRecap('open')} />}
      <DayRecapModal isOpen={recap === 'open'} onClose={() => setRecap(null)} />
      {checkout.milestone !== null && <Milestone number={checkout.milestone} />}
    </div>
  )
}
