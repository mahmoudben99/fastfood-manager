import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Search, Trash2, Wallet } from 'lucide-react'
import { Button, Input, Money, SegmentedControl, cn } from '../components/ui'
import { categoryColor, categoryTint } from '../theme/categoryColors'

/**
 * Living blueprint of the v4 order screen (reference for wave 2, not wired to data):
 * category rail | photo/gradient tiles (fixed positions) | receipt ticket with perforated edges,
 * steppers, animated total, 64px pay button with a double-tap guard and quick tender.
 */

interface BpItem { id: number; cat: number; name: string; price: number; emoji: string }
const CATS = [
  { id: 1, name: 'Burgers', emoji: '🍔' },
  { id: 2, name: 'Pizza', emoji: '🍕' },
  { id: 3, name: 'Tacos', emoji: '🌮' },
  { id: 4, name: 'Drinks', emoji: '🥤' },
  { id: 5, name: 'Desserts', emoji: '🍰' }
]
const ITEMS: BpItem[] = [
  { id: 1, cat: 1, name: 'Cheeseburger', price: 300, emoji: '🍔' },
  { id: 2, cat: 1, name: 'Double Burger', price: 500, emoji: '🍔' },
  { id: 3, cat: 1, name: 'Chicken Burger', price: 400, emoji: '🍗' },
  { id: 4, cat: 1, name: 'Fries', price: 150, emoji: '🍟' },
  { id: 5, cat: 1, name: 'Menu Maxi', price: 750, emoji: '🍱' },
  { id: 6, cat: 1, name: 'Nuggets x6', price: 350, emoji: '🍗' },
  { id: 7, cat: 2, name: 'Margherita', price: 650, emoji: '🍕' },
  { id: 8, cat: 2, name: '4 Fromages', price: 950, emoji: '🧀' },
  { id: 9, cat: 3, name: 'Tacos Poulet', price: 450, emoji: '🌮' },
  { id: 10, cat: 4, name: 'Coca-Cola', price: 120, emoji: '🥤' },
  { id: 11, cat: 4, name: 'Jus Orange', price: 180, emoji: '🍊' },
  { id: 12, cat: 5, name: 'Tiramisu', price: 350, emoji: '🍰' }
]
const TENDERS = [500, 1000, 2000]

export function OrderBlueprint() {
  const { t } = useTranslation()
  const [cat, setCat] = useState(1)
  const [lines, setLines] = useState<{ id: number; qty: number }[]>([
    { id: 2, qty: 1 },
    { id: 4, qty: 2 }
  ])
  const [flashId, setFlashId] = useState<number | null>(null)
  const [orderType, setOrderType] = useState<'dine' | 'take' | 'delivery'>('dine')

  const qtyById = useMemo(() => new Map(lines.map((l) => [l.id, l.qty])), [lines])
  const total = lines.reduce((sum, l) => sum + (ITEMS.find((i) => i.id === l.id)?.price ?? 0) * l.qty, 0)
  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  const add = (id: number, delta = 1): void => {
    setLines((prev) => {
      const hit = prev.find((l) => l.id === id)
      if (!hit) return delta > 0 ? [...prev, { id, qty: 1 }] : prev
      return prev.map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    })
    if (delta > 0) setFlashId(id)
  }

  return (
    <div className="rounded-3xl border border-line bg-canvas overflow-hidden grid grid-cols-[168px_1fr_380px] h-[660px]">
      {/* Category rail: >=64px rows, colour bar + tint, fixed order (muscle memory) */}
      <nav className="border-e border-line bg-surface-2/60 p-2 space-y-1.5 overflow-y-auto">
        {CATS.map((c) => {
          const active = c.id === cat
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={cn(
                'tap relative w-full min-h-16 rounded-2xl ps-4 pe-2 flex items-center gap-3 text-start',
                active ? 'bg-surface shadow-e2 text-ink dark:bg-surface-3' : 'text-ink-2 hover:bg-surface/70'
              )}
            >
              <span
                className={cn('absolute start-0 top-3 bottom-3 rounded-e-full', active ? 'w-1.5' : 'w-1 opacity-60')}
                style={{ background: categoryColor(c.id) }}
              />
              <span className="text-2xl">{c.emoji}</span>
              <span className="text-[15px] font-bold truncate">{c.name}</span>
            </button>
          )
        })}
      </nav>

      {/* Item grid: colour block (or photo) + 2-line name + tabular price; qty badge when in cart */}
      <div className="flex flex-col min-w-0">
        <div className="p-4 pb-3">
          <Input leading={<Search />} placeholder={t('ui.sg.search')} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 grid grid-cols-3 xl:grid-cols-4 gap-3 content-start">
          {ITEMS.filter((i) => i.cat === cat).map((item) => {
            const qty = qtyById.get(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => add(item.id)}
                className="tap contain-card relative text-start rounded-2xl bg-surface border border-line shadow-e1 overflow-hidden hover:border-line-strong active:bg-surface-2"
              >
                <div
                  className="h-20 flex items-center justify-center text-4xl"
                  style={{ background: `linear-gradient(135deg, ${categoryTint(item.cat, 22)}, ${categoryTint(item.cat, 8)})` }}
                >
                  {item.emoji}
                </div>
                <span className="absolute top-0 inset-x-0 h-1" style={{ background: categoryColor(item.cat) }} />
                {qty && (
                  <span key={qty} dir="ltr" className="num absolute top-2.5 end-2.5 min-w-8 h-8 px-2 rounded-full bg-ember text-sm font-extrabold flex items-center justify-center shadow-glow animate-bump">
                    ×{qty}
                  </span>
                )}
                <div className="p-3 pt-2.5">
                  <p className="text-[15px] font-semibold text-ink leading-snug line-clamp-2 min-h-[2.6em]">{item.name}</p>
                  <p className="mt-1 text-lg font-extrabold text-ink">
                    <Money value={item.price} decimals={0} />
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Receipt ticket */}
      <aside className="border-s border-line bg-surface-2/50 dark:bg-canvas p-4 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="receipt-edge-top shrink-0" />
          <div className="flex-1 min-h-0 flex flex-col bg-surface px-4">
            <div className="flex items-center justify-between pt-1 pb-3">
              <div>
                <p className="text-xs font-semibold text-muted">{t('ui.sg.ticket')}</p>
                <p className="num text-lg font-extrabold text-ink">#0042</p>
              </div>
              <span className="text-sm font-semibold text-muted">{t('ui.sg.items', { count })}</span>
            </div>
            <SegmentedControl
              fullWidth
              size="sm"
              value={orderType}
              onChange={setOrderType}
              options={[
                { value: 'dine', label: t('ui.sg.dineIn') },
                { value: 'take', label: t('ui.sg.takeaway') },
                { value: 'delivery', label: t('ui.sg.delivery') }
              ]}
            />
            <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4 mt-3 border-t border-dashed border-line-strong">
              {lines.length === 0 && <p className="py-10 text-center text-sm text-muted">{t('ui.sg.emptyCart')}</p>}
              {lines.map((line) => {
                const item = ITEMS.find((i) => i.id === line.id)!
                return (
                  <div
                    key={`${line.id}-${flashId === line.id ? line.qty : 0}`}
                    className={cn('flex items-center gap-2 py-2.5 border-b border-line rounded-lg', flashId === line.id && 'flash')}
                  >
                    <div className="flex items-center rounded-xl border border-line bg-surface-2">
                      <button type="button" onClick={() => add(line.id, -1)} className="tap h-11 w-11 flex items-center justify-center text-ink-2" aria-label={t('common.remove')}>
                        {line.qty === 1 ? <Trash2 className="h-4 w-4 text-danger-ink" /> : <Minus className="h-4 w-4" />}
                      </button>
                      <span className="num w-6 text-center font-extrabold text-ink">{line.qty}</span>
                      <button type="button" onClick={() => add(line.id, 1)} className="tap h-11 w-11 flex items-center justify-center text-ink-2" aria-label={t('common.add')}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{item.name}</p>
                      {item.id === 2 && <p className="text-[13px] text-muted truncate">{t('ui.sg.allergens')}</p>}
                    </div>
                    <span className="text-sm font-bold text-ink">
                      <Money value={item.price * line.qty} decimals={0} />
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted">
                <span>{t('ui.sg.subtotal')}</span>
                <Money value={total} decimals={0} styledSymbol={false} />
              </div>
              <div className="flex items-end justify-between pt-2 border-t border-dashed border-line-strong">
                <span className="text-base font-bold text-ink">{t('ui.sg.total')}</span>
                <span className="text-total text-ink">
                  <Money value={total} decimals={0} animate />
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3">
              {TENDERS.map((v) => (
                <Button key={v} variant="secondary" size="lg" disabled={total === 0} className="px-2">
                  <Money value={v} decimals={0} />
                </Button>
              ))}
            </div>
            <div className="pt-2 pb-1">
              <Button size="touch" fullWidth icon={<Wallet />} disabled={total === 0} cooldownMs={800}>
                {t('ui.sg.pay')}
              </Button>
            </div>
          </div>
          <div className="receipt-edge shrink-0" />
        </div>
      </aside>
    </div>
  )
}
