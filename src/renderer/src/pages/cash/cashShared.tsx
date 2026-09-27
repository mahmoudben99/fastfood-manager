import { DependencyList, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { isBuiltinPaymentMethod, paymentMethodLabel, type CashLang, type PaymentMethodConfig } from '../../../../shared/cash'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { localToday } from '../../utils/localDate'
import { Money, cn } from '../../components/ui'

/** Helpers shared by the Cash & Shifts, Payments and Delivery admin pages (v4 wave 2). */

export function useCashLang(): CashLang {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return lang === 'ar' || lang === 'fr' ? lang : 'en'
}

let methodsCache: Promise<PaymentMethodConfig[]> | null = null

/** Configured payment methods, loaded once per session (call invalidatePaymentMethods after a save). */
export function usePaymentMethods(): PaymentMethodConfig[] | null {
  const [methods, setMethods] = useState<PaymentMethodConfig[] | null>(null)
  useEffect(() => {
    let alive = true
    methodsCache ??= window.api.payments.getMethods().catch(() => [])
    methodsCache.then((list) => { if (alive) setMethods(list) })
    return () => { alive = false }
  }, [])
  return methods
}

export function invalidatePaymentMethods(): void {
  methodsCache = null
}

/**
 * Payment-method name in the UI language: a custom label from the configured list wins, then the
 * built-in translation; `fallback` (e.g. the label stored in a Z report) covers removed methods.
 */
export function useMethodLabel(given?: PaymentMethodConfig[] | null): (id: string, fallback?: string) => string {
  const lang = useCashLang()
  const loaded = usePaymentMethods()
  const methods = given ?? loaded
  return useCallback(
    (id: string, fallback?: string) => {
      const config = methods?.find((method) => method.id === id)
      if (!config && fallback && !isBuiltinPaymentMethod(id)) return fallback
      return paymentMethodLabel(id, lang, config?.label)
    },
    [lang, methods]
  )
}

/** Message of a rejected window.api call without Electron's prefix and the stable tokens. */
export function errorText(error: unknown, fallback: string): string {
  return ipcErrorMessage(error, fallback).replace(/^(NO_OPEN_SHIFT|SHIFT_ALREADY_OPEN|BELOW_MIN_ORDER|CONSENT_REQUIRED):\s*/, '')
}

/** Stored timestamps are ISO (Z) or SQLite "YYYY-MM-DD HH:MM:SS" (UTC without a marker). */
export function parseStamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const s = value.trim()
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** "14:05" in local time, Latin digits in every language. */
export function fmtTime(value: string | null | undefined): string {
  const d = parseStamp(value)
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'
}

/** "27/09/2026" (from a timestamp or a YYYY-MM-DD business date). */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`
  const d = parseStamp(value)
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'
}

export function fmtDateTime(value: string | null | undefined): string {
  return value ? `${fmtDate(value)} ${fmtTime(value)}` : '—'
}

/** Whole minutes between two stamps (end = now). */
export function minutesBetween(from: string | null | undefined, to?: string | null, now = Date.now()): number {
  const start = parseStamp(from)
  if (!start) return 0
  const end = parseStamp(to ?? null)?.getTime() ?? now
  return Math.max(0, Math.floor((end - start.getTime()) / 60_000))
}

/** "5:20" hours:minutes duration. */
export function fmtDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`
}

/** YYYY-MM-DD `days` before today (local). */
export function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return localToday(d)
}

export { localToday }

/** Load data from window.api with loading/error state and a stable reload(). */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const result = await loadRef.current()
      if (mine === seq.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      if (mine === seq.current) setError(errorText(e, 'Error'))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload() }, deps)
  return { data, loading, error, reload }
}

/** Positive/negative money with an explicit word + colour (never colour alone). */
export function OverShort({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  const { t } = useTranslation()
  if (value === null || value === undefined) return <span className={cn('text-muted', className)}>—</span>
  const tone = value === 0 ? 'bg-success-soft text-success-ink' : value > 0 ? 'bg-info-soft text-info-ink' : 'bg-danger-soft text-danger-ink'
  const word = value === 0 ? t('cashAdmin.exact') : value > 0 ? t('cashAdmin.over') : t('cashAdmin.short')
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', tone, className)}>
      {word}
      {value !== 0 && <Money value={value} decimals={0} styledSymbol={false} />}
    </span>
  )
}

/** Label/value row used in ledgers and summaries. */
export function LedgerRow({
  label,
  value,
  strong = false,
  muted = false,
  sign
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
  muted?: boolean
  /** Leading operator glyph (+ − =). */
  sign?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2', strong && 'border-t border-dashed border-line-strong mt-1 pt-3')}>
      <span className={cn('flex items-center gap-2 text-sm', strong ? 'font-bold text-ink' : muted ? 'text-muted' : 'text-ink-2')}>
        {sign && <span className="num w-4 text-center text-faint font-bold" aria-hidden="true">{sign}</span>}
        {label}
      </span>
      <span className={cn('text-end', strong ? 'text-lg font-extrabold text-ink' : 'text-sm font-semibold text-ink')}>{value}</span>
    </div>
  )
}

/** Info icon with a tooltip: optional detail that would otherwise be a sentence on screen. */
export function Hint({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span title={text} aria-label={text} role="img" className={cn('inline-flex shrink-0 text-muted hover:text-ink cursor-help align-middle', className)}>
      <Info className="h-4 w-4" aria-hidden="true" />
    </span>
  )
}

/** Small uppercase-free section label inside cards. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      <h4 className="text-[13px] font-semibold text-muted">{children}</h4>
      {action}
    </div>
  )
}

/** Sticky table head cell / body cell classes (DESIGN §14). */
export const th = 'px-4 py-3 text-start text-xs font-semibold text-muted whitespace-nowrap'
export const thEnd = 'px-4 py-3 text-end text-xs font-semibold text-muted whitespace-nowrap'
export const td = 'px-4 py-3 text-sm text-ink-2'
export const tdEnd = 'px-4 py-3 text-sm text-end font-semibold text-ink'
