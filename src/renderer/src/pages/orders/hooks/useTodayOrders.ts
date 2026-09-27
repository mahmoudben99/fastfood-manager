import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OrderData } from '../types'

export interface TodayOrders {
  orders: OrderData[]
  ongoingCount: number
  /** Order ids whose every kitchen ticket is ready on the KDS. */
  readyIds: Set<number>
  /** Recent order / line notes (autocomplete chips in the note fields). */
  noteSuggestions: string[]
  reload: () => Promise<void>
  /** Queue for the customer display ("preparing" / "ready" numbers). */
  pushQueue: () => void
}

const isOngoing = (o: OrderData): boolean => o.status === 'preparing' || o.status === 'pending'

/**
 * Today's orders, loaded once and refreshed on tablet / remote orders and after each save
 * (v3 called orders.getToday three times on mount). KDS "ready" state is live via onReadyChanged.
 */
export function useTodayOrders(): TodayOrders {
  const [orders, setOrders] = useState<OrderData[]>([])
  const [readyIds, setReadyIds] = useState<Set<number>>(() => new Set())
  const alive = useRef(true)

  const pushQueueFrom = useCallback((list: OrderData[]) => {
    try {
      const preparing = list.filter(isOngoing).reverse().map((o) => o.daily_number)
      const ready = list.filter((o) => o.status === 'completed').slice(0, 10).reverse().map((o) => o.daily_number)
      void window.api.tablet.pushDisplayUpdate({ type: 'queue', preparing, ready })?.catch?.(() => {})
    } catch { /* display server may not be running */ }
  }, [])

  const reload = useCallback(async () => {
    try {
      const list = ((await window.api.orders.getToday()) || []) as OrderData[]
      if (alive.current) setOrders(list)
    } catch { /* keep the previous list */ }
  }, [])

  const pushQueue = useCallback(() => {
    window.api.orders.getToday().then((list: OrderData[]) => {
      if (alive.current) setOrders(list || [])
      pushQueueFrom(list || [])
    }).catch(() => {})
  }, [pushQueueFrom])

  useEffect(() => {
    alive.current = true
    void reload()
    const unsubs: (() => void)[] = []
    unsubs.push(window.api.tablet.onNewOrder(() => void reload()))
    if (window.api.remote) unsubs.push(window.api.remote.onRemoteOrder(() => void reload()))
    const kds = window.api.kds
    if (kds?.getReadyOrders) {
      kds.getReadyOrders().then((ids) => alive.current && setReadyIds(new Set(ids || []))).catch(() => {})
      if (kds.onReadyChanged) {
        unsubs.push(kds.onReadyChanged((event) => {
          setReadyIds((prev) => {
            if (prev.has(event.orderId) === event.ready) return prev
            const next = new Set(prev)
            if (event.ready) next.add(event.orderId)
            else next.delete(event.orderId)
            return next
          })
        }))
      }
    }
    return () => {
      alive.current = false
      unsubs.forEach((u) => u())
    }
  }, [reload])

  const ongoingCount = useMemo(() => orders.filter(isOngoing).length, [orders])

  const noteSuggestions = useMemo(() => {
    const seen = new Set<string>()
    for (const order of orders) {
      if (order.notes?.trim()) seen.add(order.notes.trim())
      for (const item of order.items || []) if (item.notes?.trim()) seen.add(item.notes.trim())
      if (seen.size >= 12) break
    }
    return Array.from(seen).slice(0, 12)
  }, [orders])

  return { orders, ongoingCount, readyIds, noteSuggestions, reload, pushQueue }
}
