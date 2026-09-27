import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardSummary } from '../../../../shared/insights'
import type { Shift } from '../../../../shared/shift-report'

export interface KitchenStatus {
  /** Open (new / in progress) tickets. */
  open: number
  /** Open tickets older than the KDS "late" setting. */
  late: number
  lateMinutes: number
}

export interface SetupStatus {
  menuItems: number
  stockItems: number
  telegram: boolean
}

export interface DashboardData {
  summary: DashboardSummary | null
  /** undefined = could not be read (older main process); null = no open shift. */
  shift: Shift | null | undefined
  unpaid: { count: number; balance: number } | null
  kitchen: KitchenStatus | null
  /** Only loaded for a restaurant without any sales yet (welcome checklist). */
  setup: SetupStatus | null
  /** Telegram bot token + chat configured (null = unknown). */
  telegram: boolean | null
}

const EMPTY: DashboardData = { summary: null, shift: undefined, unpaid: null, kitchen: null, setup: null, telegram: null }
const REFRESH_MS = 60_000

function settled<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined
}

/** No sale in the last 14 days and no history for the forecast: show the welcome checklist. */
export function isNewRestaurant(summary: DashboardSummary | null): boolean {
  if (!summary) return false
  return summary.forecastToday.method === 'none' && summary.sparkline.every((d) => d.orders === 0)
}

async function loadKitchen(): Promise<KitchenStatus | null> {
  const snapshot = await window.api.kds.getTickets('all')
  const now = Date.parse(snapshot.serverTime) || Date.now()
  const lateMs = snapshot.settings.lateMinutes * 60_000
  const open = snapshot.cards.filter((card) => (card.status === 'new' || card.status === 'in_progress') && !card.cancelledAt)
  return {
    open: open.length,
    late: open.filter((card) => now - Date.parse(card.timerStart) >= lateMs).length,
    lateMinutes: snapshot.settings.lateMinutes
  }
}

async function loadSetup(): Promise<SetupStatus> {
  const [menu, stock, telegram] = await Promise.allSettled([
    window.api.menu.getAll(),
    window.api.stock.getAll(),
    window.api.telegram.getConfig()
  ])
  const config = settled(telegram) as { token?: string; chatId?: string } | undefined
  return {
    menuItems: (settled(menu) as unknown[] | undefined)?.length ?? 0,
    stockItems: (settled(stock) as unknown[] | undefined)?.length ?? 0,
    telegram: Boolean(config?.token && config?.chatId)
  }
}

/**
 * Everything the admin home shows, loaded in parallel; each source may fail on its own (the page
 * renders what it has). Refreshes every minute while visible.
 */
export function useDashboardData(): { data: DashboardData; loading: boolean; error: boolean; refresh: () => Promise<void> } {
  const [data, setData] = useState<DashboardData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const [summary, shift, unpaid, kitchen, telegram] = await Promise.allSettled([
      window.api.insights.getDashboardSummary(),
      window.api.shifts.getCurrent(),
      window.api.payments.listUnpaid(),
      loadKitchen(),
      window.api.telegram.getConfig()
    ])
    const config = settled(telegram) as { token?: string; chatId?: string } | undefined
    const summaryValue = settled(summary) ?? null
    const unpaidRows = settled(unpaid)
    const setup = isNewRestaurant(summaryValue) ? await loadSetup().catch(() => null) : null
    if (!alive.current) return
    setError(summary.status === 'rejected')
    setData({
      summary: summaryValue,
      shift: shift.status === 'fulfilled' ? shift.value : undefined,
      unpaid: unpaidRows
        ? { count: unpaidRows.length, balance: unpaidRows.reduce((sum, row) => sum + (row.balance_due || 0), 0) }
        : null,
      kitchen: settled(kitchen) ?? null,
      setup,
      telegram: config ? Boolean(config.token && config.chatId) : null
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    return () => {
      alive.current = false
      clearInterval(id)
    }
  }, [refresh])

  return { data, loading, error, refresh }
}
