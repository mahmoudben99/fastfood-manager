import { ReactNode, useEffect } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Escape / backdrop close; off while a dialog is stacked on top or input is unsaved. */
  dismissible?: boolean
  labelledBy?: string
  children: ReactNode
}

/**
 * Side sheet from the inline-end edge (mirrors in RTL). Flat overlay, no blur. The page behind
 * stays in place so staff keep their scroll position in the list.
 */
export function Drawer({ open, onClose, dismissible = true, labelledBy, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-overlay animate-fade-in"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="absolute inset-y-0 end-0 flex w-full max-w-[40rem] flex-col border-s border-line bg-canvas shadow-e4 animate-slide-in-end"
      >
        {children}
      </aside>
    </div>
  )
}

/** Scrolling middle of the drawer. */
export function DrawerBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">{children}</div>
}

/** Sticky action area at the bottom of the drawer. */
export function DrawerFooter({ children }: { children: ReactNode }) {
  return <footer className="space-y-2 border-t border-line bg-surface p-4">{children}</footer>
}
