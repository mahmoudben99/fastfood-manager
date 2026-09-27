import { ReactNode } from 'react'
import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from './cn'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastOptions {
  description?: ReactNode
  /** e.g. { label: t('ui.undo'), onClick: restoreLine } — prefer Undo toasts over confirm dialogs. */
  action?: { label: string; onClick: () => void }
  /** ms; default 3000 (error 6000, with an action 5000). 0 = stays until dismissed. */
  duration?: number
  /** Same id replaces the existing toast instead of stacking a duplicate. */
  id?: string
}

interface ToastItem extends ToastOptions {
  id: string
  kind: ToastKind
  title: ReactNode
}

interface ToastState {
  toasts: ToastItem[]
  push: (t: ToastItem) => void
  dismiss: (id: string) => void
}

const MAX_TOASTS = 4
let seq = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== t.id), t].slice(-MAX_TOASTS) })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}))

function show(kind: ToastKind, title: ReactNode, opts: ToastOptions = {}): string {
  const id = opts.id ?? `t${++seq}`
  const duration = opts.duration ?? (opts.action ? 5000 : kind === 'error' ? 6000 : 3000)
  const prev = timers.get(id)
  if (prev) clearTimeout(prev)
  useToastStore.getState().push({ ...opts, id, kind, title })
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        useToastStore.getState().dismiss(id)
      }, duration)
    )
  }
  return id
}

function dismiss(id: string): void {
  const prev = timers.get(id)
  if (prev) clearTimeout(prev)
  timers.delete(id)
  useToastStore.getState().dismiss(id)
}

/** Imperative, app-wide toasts. Works outside React (stores, IPC listeners). Needs <Toaster /> once. */
export const toast = {
  success: (title: ReactNode, opts?: ToastOptions) => show('success', title, opts),
  error: (title: ReactNode, opts?: ToastOptions) => show('error', title, opts),
  warning: (title: ReactNode, opts?: ToastOptions) => show('warning', title, opts),
  info: (title: ReactNode, opts?: ToastOptions) => show('info', title, opts),
  dismiss
}

/** Hook form of the same API (for components that prefer hooks). */
export function useToast(): typeof toast {
  return toast
}

const kindStyle: Record<ToastKind, { icon: ReactNode; tile: string; bar: string }> = {
  success: { icon: <CheckCircle2 />, tile: 'bg-success-soft text-success-ink', bar: 'bg-success' },
  error: { icon: <AlertCircle />, tile: 'bg-danger-soft text-danger-ink', bar: 'bg-danger' },
  warning: { icon: <AlertTriangle />, tile: 'bg-warning-soft text-warning-ink', bar: 'bg-warning' },
  info: { icon: <Info />, tile: 'bg-info-soft text-info-ink', bar: 'bg-info' }
}

/** Mount once near the app root. Top-end corner under the header (mirrors in RTL), newest last. */
export function Toaster() {
  const { t } = useTranslation()
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null
  return (
    <div className="fixed top-[4.5rem] end-4 z-[1000] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none">
      {toasts.map((item) => {
        const style = kindStyle[item.kind]
        return (
          <div
            key={item.id}
            role={item.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto relative overflow-hidden flex items-start gap-3 rounded-2xl bg-surface border border-line shadow-e3 p-3 pe-2 animate-slide-in-end"
          >
            <span className={cn('absolute inset-y-0 start-0 w-1', style.bar)} aria-hidden="true" />
            <div className={cn('ms-1 h-9 w-9 shrink-0 rounded-xl flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5', style.tile)}>
              {style.icon}
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm font-semibold text-ink leading-snug">{item.title}</p>
              {item.description && <p className="mt-0.5 text-sm text-muted leading-snug">{item.description}</p>}
            </div>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick()
                  dismiss(item.id)
                }}
                className="tap shrink-0 self-center min-h-10 px-3 rounded-xl text-sm font-bold text-primary-ink hover:bg-primary-soft"
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={t('common.close')}
              className="tap shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
