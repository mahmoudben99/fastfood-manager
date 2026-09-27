import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Loader2, Phone, Repeat, Search, UserPlus, X } from 'lucide-react'
import type { CustomerRecord, LastOrderResult } from '../../../../shared/customer-lookup'
import { Badge, Button, IconButton, Money, cn, toast } from '../ui'
import type { CustomerLookupProps } from './contracts'
import { localName, relativeDay } from './format'
import { errorText } from './methods'
import { isCompletePhone, samePhone, toRepeatLines } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'

type Selected = { kind: 'known'; customer: CustomerRecord } | { kind: 'new'; phone: string }

const initial = (name: string | null | undefined): string => (name?.trim()?.[0] ?? '#').toUpperCase()
const qty = (quantity: number): string => (quantity > 1 ? `${quantity}× ` : '')

/**
 * Find a customer by phone or name (customers.search). Shows visits and the last order;
 * "Repeat last order" re-adds its lines (options + combo picks), skipping what is sold out or
 * no longer on the menu with a notice. A complete phone number with one exact match is picked
 * automatically (caller-ID style); an unknown complete number can be used as a new customer.
 */
export function CustomerLookup({ phone, onSelect, onRepeatOrder, onClear, autoFocus }: CustomerLookupProps) {
  const { t, i18n } = useTranslation()
  const kb = useTouchKeyboard()
  const [query, setQuery] = useState(phone ?? '')
  const [results, setResults] = useState<CustomerRecord[]>([])
  const [searched, setSearched] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [last, setLast] = useState<LastOrderResult | null>(null)
  const [repeating, setRepeating] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const pick = (customer: CustomerRecord): void => {
    setSelected({ kind: 'known', customer })
    setResults([])
    setLast(null)
    kb.close()
    onSelectRef.current({
      id: customer.id, phone: customer.phone, name: customer.name, consent_at: customer.consent_at, order_count: customer.order_count
    })
    if (customer.order_count > 0) {
      window.api.customers.getLastOrder(customer.id).then(setLast).catch(() => setLast(null))
    }
  }
  const pickNew = (): void => {
    const number = query.trim()
    if (!isCompletePhone(number)) return
    setSelected({ kind: 'new', phone: number })
    setResults([])
    kb.close()
    onSelectRef.current({ phone: number })
  }
  const clear = (): void => {
    setSelected(null)
    setQuery('')
    setLast(null)
    onClear?.()
  }

  // A phone typed elsewhere on the order screen pre-fills the search.
  useEffect(() => {
    if (phone === undefined) return
    if (selected && (selected.kind === 'new' ? selected.phone : selected.customer.phone) === phone) return
    setSelected(null)
    setQuery(phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])

  // Debounced search while nothing is selected.
  useEffect(() => {
    if (selected) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched('')
      return
    }
    let stale = false
    setLoading(true)
    const timer = setTimeout(() => {
      window.api.customers.search(q)
        .then((rows: CustomerRecord[]) => {
          if (stale) return
          const list = (rows ?? []).slice(0, 6)
          setResults(list)
          setSearched(q)
          const exact = isCompletePhone(q) ? list.filter((row) => samePhone(row.phone, q)) : []
          if (exact.length === 1) pick(exact[0])
        })
        .catch(() => !stale && setResults([]))
        .finally(() => !stale && setLoading(false))
    }, 220)
    return () => {
      stale = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selected])

  const repeat = async (): Promise<void> => {
    if (!onRepeatOrder || selected?.kind !== 'known') return
    setRepeating(true)
    try {
      // Fresh read: availability may have changed since the customer was picked.
      const latest = await window.api.customers.getLastOrder(selected.customer.id)
      setLast(latest)
      const lines = toRepeatLines(latest.lines)
      if (lines.length > 0) {
        onRepeatOrder(lines)
        toast.success(t('checkout.customer.repeated', { count: lines.length }))
      }
      if (latest.skipped.length > 0) {
        toast.warning(t('checkout.customer.skipped', { count: latest.skipped.length }), {
          description: latest.skipped.map((line) => `${line.name} — ${t(`checkout.customer.skip.${line.reason}`)}`).join(' · '),
          duration: 8000
        })
      }
      if (latest.trimmed.length > 0) {
        toast.info(t('checkout.customer.trimmed'), { description: latest.trimmed.join(', '), duration: 6000 })
      }
    } catch (error) {
      toast.error(t('checkout.customer.repeatError'), { description: errorText(error, '') })
    } finally {
      setRepeating(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (results[0]) pick(results[0])
    else pickNew()
  }

  const sep = i18n.language === 'ar' ? '، ' : ', '

  if (selected) {
    const customer = selected.kind === 'known' ? selected.customer : null
    const number = customer?.phone ?? (selected.kind === 'new' ? selected.phone : '')
    return (
      <div className="rounded-2xl border border-line bg-surface p-3 shadow-e1 dark:bg-surface-2" data-testid="customer-card">
        <div className="flex items-start gap-3">
          <span className="h-12 w-12 shrink-0 rounded-full bg-primary-soft text-primary-ink grid place-items-center text-lg font-extrabold">
            {customer ? initial(customer.name) : <UserPlus className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-ink truncate">{customer?.name || t('checkout.customer.noName')}</p>
            <p className="text-sm text-muted flex flex-wrap items-center gap-x-2">
              <bdi dir="ltr" className="num font-semibold text-ink-2">{number}</bdi>
              {customer ? (
                <>
                  <span>· {t('checkout.customer.visits', { count: customer.order_count })}</span>
                  {customer.last_order_date && <span>· {relativeDay(customer.last_order_date, i18n.language)}</span>}
                </>
              ) : (
                <Badge variant="info" size="sm">{t('checkout.customer.new')}</Badge>
              )}
              {customer?.consent_at && (
                <Badge variant="success" size="sm" icon={<BadgeCheck className="h-3.5 w-3.5" />}>{t('checkout.customer.consentOnFile')}</Badge>
              )}
            </p>
          </div>
          <IconButton icon={<X />} label={t('checkout.customer.change')} onClick={clear} size="lg" />
        </div>
        {last?.order && (
          <div className="mt-3 border-t border-dashed border-line-strong pt-3">
            <p className="text-sm font-semibold text-ink-2 flex flex-wrap items-center gap-x-2">
              <span>{t('checkout.customer.lastOrder', { number: last.order.daily_number })}</span>
              <span className="text-muted font-normal">· {relativeDay(last.order.created_at, i18n.language)}</span>
              <span className="ms-auto text-ink font-bold"><Money value={last.order.total} decimals={0} /></span>
            </p>
            <p className="mt-0.5 text-sm text-muted line-clamp-2">
              {last.lines.map((line, index) => (
                <span key={`l${index}`}>
                  {index > 0 && sep}
                  <bdi>{qty(line.quantity)}{localName(line, i18n.language)}</bdi>
                </span>
              ))}
              {last.skipped.map((line, index) => (
                <span key={`s${index}`}>
                  {(index > 0 || last.lines.length > 0) && sep}
                  <bdi>{qty(line.quantity)}{line.name}</bdi> ({t(`checkout.customer.skip.${line.reason}`)})
                </span>
              ))}
            </p>
            {onRepeatOrder && (
              <Button
                variant="soft"
                size="lg"
                fullWidth
                className="mt-3"
                icon={<Repeat className="h-5 w-5" />}
                onClick={repeat}
                loading={repeating}
                disabled={last.lines.length === 0}
                cooldownMs={800}
              >
                {last.lines.length === 0 ? t('checkout.customer.nothingToRepeat') : t('checkout.customer.repeat')}
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  const showNew = isCompletePhone(query) && !results.some((row) => samePhone(row.phone, query))
  const noMatch = searched.length >= 3 && results.length === 0 && !loading && !showNew

  return (
    <div className="space-y-2" data-testid="customer-lookup">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-faint">
          {/^[\d\s+]+$/.test(query) && query ? <Phone className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </span>
        <input
          data-ui="input"
          autoFocus={autoFocus && !kb.isTouch}
          aria-label={t('checkout.customer.search')}
          placeholder={t('checkout.customer.search')}
          onKeyDown={onKeyDown}
          className="w-full min-h-13 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 ps-11 pe-11 text-lg text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          {...kb.field('customer-search', query, setQuery)}
        />
        {loading && <Loader2 className="absolute end-3.5 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted" />}
      </div>
      {(results.length > 0 || showNew) && (
        <div role="listbox" aria-label={t('checkout.customer.results')} className="rounded-2xl border border-line bg-surface divide-y divide-line overflow-hidden shadow-e2 dark:bg-surface-2">
          {results.map((row) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(row)}
              className="tap w-full min-h-14 flex items-center gap-3 px-3 text-start hover:bg-surface-2 dark:hover:bg-surface-3"
            >
              <span className="h-9 w-9 shrink-0 rounded-full bg-surface-3 text-ink-2 grid place-items-center font-bold">{initial(row.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink truncate">{row.name || t('checkout.customer.noName')}</span>
                <bdi dir="ltr" className="num block text-xs text-muted">{row.phone}</bdi>
              </span>
              <span className="text-end text-xs text-muted shrink-0">
                <span className="block font-semibold text-ink-2">{t('checkout.customer.visits', { count: row.order_count })}</span>
                {row.last_order_date && <span className="block">{relativeDay(row.last_order_date, i18n.language)}</span>}
              </span>
            </button>
          ))}
          {showNew && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={pickNew}
              className="tap w-full min-h-14 flex items-center gap-3 px-3 text-start text-primary-ink hover:bg-primary-soft"
            >
              <span className="h-9 w-9 shrink-0 rounded-full bg-primary-soft grid place-items-center"><UserPlus className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">
                {t('checkout.customer.useNew')} <bdi dir="ltr" className="num">{query.trim()}</bdi>
              </span>
            </button>
          )}
        </div>
      )}
      {noMatch && <p className={cn('px-1 text-sm text-muted')}>{t('checkout.customer.noMatch')}</p>}
      {kb.keyboard}
    </div>
  )
}
