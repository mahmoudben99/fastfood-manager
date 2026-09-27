/** Small live feeds of the order screen: print jobs, customer display, upsell suggestions. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UpsellSuggestion } from '../../../../../shared/insights'
import { cartTotals, useOrderStore } from '../../../store/orderStore'
import type { PrintJobData } from '../types'

export function usePrintJobs(): {
  attention: PrintJobData[]
  active: PrintJobData[]
  retry: (id: number) => Promise<string | null>
  dismiss: (id: number) => Promise<string | null>
} {
  const [jobs, setJobs] = useState<PrintJobData[]>([])
  useEffect(() => {
    window.api.printer.getPrintJobs().then((list: PrintJobData[]) => setJobs(list || [])).catch(() => setJobs([]))
    return window.api.printer.onPrintJobsChanged((list: PrintJobData[]) => setJobs(list || []))
  }, [])
  const attention = useMemo(() => jobs.filter((j) => j.status === 'attention'), [jobs])
  const active = useMemo(() => jobs.filter((j) => j.status === 'pending' || j.status === 'printing'), [jobs])
  const retry = useCallback(async (id: number) => {
    const result = await window.api.printer.retryPrintJob(id)
    return result?.success ? null : result?.error || 'retry_failed'
  }, [])
  const dismiss = useCallback(async (id: number) => {
    const result = await window.api.printer.cancelPrintJob(id)
    return result?.success ? null : result?.error || 'dismiss_failed'
  }, [])
  return { attention, active, retry, dismiss }
}

/**
 * Mirrors the cart on the customer display from the LIVE store (a subscription, so the display can
 * never lag one action behind the way render-time snapshots did). Coalesced to one push per frame.
 */
export function useCustomerDisplay(): void {
  useEffect(() => {
    let frame: number | null = null
    const push = (): void => {
      frame = null
      try {
        const s = useOrderStore.getState()
        if (s.items.length === 0) {
          void window.api.tablet.pushDisplayUpdate({ type: 'idle' })?.catch?.(() => {})
          return
        }
        const totals = cartTotals(s)
        const items = s.items.map((i) => ({
          name: i.name,
          qty: i.quantity,
          price: i.price,
          options: [...(i.modifiers || []).map((m) => m.name), ...(i.children || []).map((c) => c.name)]
        }))
        void window.api.tablet.pushDisplayUpdate({
          type: 'cart',
          items,
          subtotal: totals.subtotal,
          discount: totals.discount,
          total: totals.total,
          orderType: s.orderType,
          tableNumber: s.tableNumber
        })?.catch?.(() => {})
      } catch { /* display server may not be running */ }
    }
    const unsub = useOrderStore.subscribe((s, prev) => {
      if (s.items === prev.items && s.orderType === prev.orderType && s.tableNumber === prev.tableNumber &&
          s.deliveryFee === prev.deliveryFee && s.manualDiscount === prev.manualDiscount) return
      if (frame === null) frame = requestAnimationFrame(push)
    })
    return () => {
      unsub()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])
}

/** "62% also take Fries" for the current cart (cached model, debounced; ids already in the cart skipped). */
export function useUpsell(menuItemIds: number[], enabled: boolean): UpsellSuggestion[] {
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([])
  const key = useMemo(() => Array.from(new Set(menuItemIds)).sort((a, b) => a - b).join(','), [menuItemIds])
  const seq = useRef(0)
  useEffect(() => {
    const api = window.api.insights
    if (!enabled || !key || !api?.getUpsellSuggestions) {
      setSuggestions([])
      return
    }
    const ids = key.split(',').map(Number)
    const mine = ++seq.current
    const timer = setTimeout(() => {
      api.getUpsellSuggestions(ids, 3)
        .then((list) => {
          if (mine !== seq.current) return
          setSuggestions((list || []).filter((s) => !ids.includes(s.menuItemId)))
        })
        .catch(() => mine === seq.current && setSuggestions([]))
    }, 180)
    return () => clearTimeout(timer)
  }, [key, enabled])
  return suggestions
}
