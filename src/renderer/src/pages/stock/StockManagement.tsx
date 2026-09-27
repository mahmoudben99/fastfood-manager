import { ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Ban, CheckCircle2, Package, PackageX, Pencil, Plus, Search, ShoppingBag, SlidersHorizontal, Wallet, Wrench, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Badge, Button, EmptyState, IconButton, Input, Money, PageHeader, Skeleton, StatCard, Tabs, cn, toast } from '../../components/ui'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { useFoodName, useTouchKeyboard } from '../menu/catalogShared'
import { StockAdjustModal } from './StockAdjustModal'
import { StockItemForm } from './StockItemForm'
import { formatQty, stockLevel, stockStatus, type AdjustKind, type StockItem, type StockStatus } from './stockShared'

type View = 'all' | 'restock'

const STATUS_BADGE: Record<StockStatus, { variant: 'success' | 'warning' | 'danger'; icon: ReactNode }> = {
  ok: { variant: 'success', icon: <CheckCircle2 /> },
  low: { variant: 'warning', icon: <AlertTriangle /> },
  out: { variant: 'danger', icon: <Ban /> }
}
const BAR: Record<StockStatus, string> = { ok: 'bg-success', low: 'bg-warning', out: 'bg-danger' }

export function StockManagement() {
  const { t } = useTranslation()
  const getName = useFoodName()
  const language = useAppStore((s) => s.language)
  const kb = useTouchKeyboard()
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ item: StockItem | null; key: number } | null>(null)
  const [adjust, setAdjust] = useState<{ item: StockItem; kind: AdjustKind } | null>(null)

  const loadData = useCallback(async () => {
    try {
      setItems(await window.api.stock.getAll())
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('stock.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** The name in the UI language, when it differs from the food-language name. */
  const secondName = (item: StockItem): string => {
    const ui = language === 'ar' ? item.name_ar : language === 'fr' ? item.name_fr : item.name
    return ui && ui !== getName(item) ? ui : ''
  }

  const needs = items.filter((i) => stockStatus(i) !== 'ok')
  const outCount = items.filter((i) => stockStatus(i) === 'out').length
  const value = items.reduce((sum, i) => sum + Math.max(0, i.quantity) * i.price_per_unit, 0)
  const needle = search.trim().toLowerCase()
  const shown = (view === 'restock' ? needs : items)
    .filter((i) => !needle || [i.name, i.name_ar, i.name_fr].some((n) => n?.toLowerCase().includes(needle)))
    // Restock view: most urgent first (out, then lowest fill).
    .sort((a, b) => (view === 'restock' ? stockLevel(a) - stockLevel(b) : 0))

  return (
    <div>
      <PageHeader
        icon={<Package />}
        title={t('stock.page.title')}
        actions={
          <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setForm({ item: null, key: Date.now() })}>
            {t('stock.addItem')}
          </Button>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3 mb-5">
        <StatCard loading={loading} label={t('stock.stats.items')} value={items.length} icon={<Package />} tone="neutral" />
        <StatCard loading={loading} label={t('stock.stats.low')} value={needs.length - outCount} icon={<AlertTriangle />} tone={needs.length - outCount ? 'warning' : 'success'} />
        <StatCard loading={loading} label={t('stock.stats.out')} value={outCount} icon={<PackageX />} tone={outCount ? 'danger' : 'success'} />
        <StatCard loading={loading} label={t('stock.stats.value')} value={<Money value={value} decimals={0} />} icon={<Wallet />} tone="primary" />
      </div>

      {needs.length > 0 && (
        <div className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-warning-ink shrink-0" />
          <div className="flex-1 min-w-[14rem]">
            <p className="font-bold text-warning-ink">{t('stock.alert.title', { count: needs.length })}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {needs.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAdjust({ item, kind: 'purchase' })}
                  className="tap min-h-9 rounded-lg bg-surface px-2.5 flex items-center gap-1.5 text-xs font-semibold text-ink border border-line hover:border-line-strong"
                >
                  <span className={cn('h-2 w-2 rounded-full', BAR[stockStatus(item)])} />
                  {getName(item)}
                  <bdi dir="ltr" className="num text-muted">{formatQty(item)}</bdi>
                </button>
              ))}
            </div>
          </div>
          {view !== 'restock' && (
            <Button variant="secondary" size="lg" onClick={() => setView('restock')}>{t('stock.alert.show')}</Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs<View>
          variant="pills"
          value={view}
          onChange={setView}
          tabs={[
            { id: 'all', label: t('stock.allStock'), count: items.length },
            { id: 'restock', label: t('stock.lowStock'), icon: <AlertTriangle />, count: needs.length }
          ]}
        />
        <div className="flex-1 min-w-[14rem]">
          <Input
            leading={<Search />}
            placeholder={t('stock.search')}
            aria-label={t('stock.search')}
            trailing={search ? <IconButton size="sm" icon={<X />} label={t('common.close')} onClick={() => setSearch('')} /> : undefined}
            {...kb.bind(search, setSearch)}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line shadow-e1 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={view === 'restock' ? <CheckCircle2 /> : <Package />}
            title={view === 'restock' ? t('stock.allGood') : items.length === 0 ? t('stock.noItems') : t('common.noResults')}
            description={items.length === 0 ? t('stock.emptyBody') : undefined}
            action={items.length === 0 ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ item: null, key: Date.now() })}>{t('stock.addItem')}</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b border-line text-xs text-muted">
                <tr>
                  <th className="text-start font-semibold px-4 py-3">{t('stock.name')}</th>
                  <th className="text-start font-semibold px-4 py-3">{t('stock.currentQty')}</th>
                  <th className="text-end font-semibold px-4 py-3 hidden xl:table-cell">{t('stock.pricePerUnit')}</th>
                  <th className="text-end font-semibold px-4 py-3 hidden 2xl:table-cell">{t('stock.value')}</th>
                  <th className="text-start font-semibold px-4 py-3">{t('stock.status')}</th>
                  <th className="text-end font-semibold px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((item) => {
                  const status = stockStatus(item)
                  const badge = STATUS_BADGE[status]
                  return (
                    <tr key={item.id} className={cn(status === 'out' && 'bg-danger-soft/30', status === 'low' && 'bg-warning-soft/30')}>
                      <td className="relative px-4 py-2.5">
                        {status !== 'ok' && <span className={cn('absolute start-0 inset-y-2 w-1 rounded-e-full', BAR[status])} />}
                        <p className="font-semibold text-ink">{getName(item)}</p>
                        {secondName(item) && <p className="text-xs text-muted">{secondName(item)}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className={cn('num font-bold', item.quantity < 0 ? 'text-danger-ink' : 'text-ink')}>
                          <bdi dir="ltr">{formatQty(item)}</bdi>
                        </p>
                        <div className="mt-1 h-1.5 w-32 rounded-full bg-surface-3 overflow-hidden">
                          <div className={cn('h-full rounded-full', BAR[status])} style={{ width: `${stockLevel(item) * 100}%` }} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted" title={t('stock.alertThreshold')}>
                          ⚑ <bdi dir="ltr" className="num">{formatQty(item, item.alert_threshold)}</bdi>
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-end text-ink-2 hidden xl:table-cell"><Money value={item.price_per_unit} /></td>
                      <td className="px-4 py-2.5 text-end font-semibold text-ink hidden 2xl:table-cell"><Money value={Math.max(0, item.quantity) * item.price_per_unit} decimals={0} /></td>
                      <td className="px-4 py-2.5">
                        <Badge variant={badge.variant} icon={badge.icon}>{t(`stock.${status}`)}</Badge>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant={status === 'ok' ? 'secondary' : 'soft'}
                            size="md"
                            className="min-h-11 whitespace-nowrap"
                            icon={<ShoppingBag className="h-4 w-4" />}
                            title={t('stock.restock')}
                            aria-label={t('stock.restock')}
                            onClick={() => setAdjust({ item, kind: 'purchase' })}
                          >
                            <span className="hidden xl:inline">{t('stock.restock')}</span>
                          </Button>
                          <IconButton icon={<SlidersHorizontal />} label={t('stock.adjust')} onClick={() => setAdjust({ item, kind: 'adjust' })} />
                          <IconButton icon={<Wrench />} label={t('stock.fix')} onClick={() => setAdjust({ item, kind: 'fix' })} />
                          <IconButton icon={<Pencil />} label={t('common.edit')} onClick={() => setForm({ item, key: Date.now() })} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && <StockItemForm key={form.key} item={form.item} onClose={() => setForm(null)} onSaved={loadData} />}
      {adjust && <StockAdjustModal item={adjust.item} kind={adjust.kind} onClose={() => setAdjust(null)} onSaved={loadData} />}
      {kb.keyboard}
    </div>
  )
}
