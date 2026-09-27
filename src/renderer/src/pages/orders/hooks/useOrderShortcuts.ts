import { useEffect, useRef } from 'react'

export interface ShortcutHandlers {
  /** Any sheet / modal owns the keyboard (it handles its own Escape). */
  overlayOpen: boolean
  onCycleType: () => void
  onPay: () => void
  onHistory: () => void
  onFocusSearch: (typed?: string) => void
  /** Escape: `fromField` = pressed inside a text field (blur it rather than clear the cart). */
  onEscape: (fromField: boolean) => void
  onClearCart: () => void
  /** 1 = All, 2… = categories in rail order. */
  onCategoryKey: (n: number) => void
}

/**
 * F1 order type · F2 pay · F3 today's orders · F4 search · 1-9 categories · Del clear · Esc back out
 * · typing anywhere starts a search. Bound once; handlers are read from a ref so the listener never
 * sees a stale closure, and nothing acts "through" an open sheet (F2 once saved a stale price edit).
 */
export function useOrderShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const h = ref.current
      const target = e.target as HTMLElement | null
      const isInput = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (h.overlayOpen) return

      if (e.key === 'Escape') {
        h.onEscape(isInput)
        return
      }
      if (e.key === 'F1') { e.preventDefault(); h.onCycleType(); return }
      if (e.key === 'F2') {
        e.preventDefault()
        if (!e.repeat) h.onPay()
        return
      }
      if (e.key === 'F3') { e.preventDefault(); h.onHistory(); return }
      if (e.key === 'F4') { e.preventDefault(); h.onFocusSearch(); return }
      if (isInput || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === 'Delete') { e.preventDefault(); h.onClearCart(); return }
      if (e.key >= '1' && e.key <= '9') { h.onCategoryKey(Number(e.key)); return }
      if (e.key.length === 1 && e.key !== ' ') {
        e.preventDefault()
        h.onFocusSearch(e.key)
      }
    }
    // Capture phase: runs BEFORE a sheet's own Escape handler closes it. In the bubble phase React
    // could re-render between the two listeners and this handler would see "no overlay" and clear the cart.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
