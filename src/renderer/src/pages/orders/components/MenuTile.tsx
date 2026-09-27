import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Layers, SlidersHorizontal, X } from 'lucide-react'
import { Money, cn } from '../../../components/ui'
import { categoryColor, categoryTint } from '../../../theme/categoryColors'
import { channelPrice } from '../../../store/orderStore'
import { localName, sizeLabel } from '../lib/names'
import type { MenuItemData } from '../types'

export const moneyDecimals = (value: number): number => (Number.isInteger(value) ? 0 : 2)

interface TileProps {
  item: MenuItemData
  label: string
  price: number
  qty: number
  fallbackEmoji: string
  hasOptions: boolean
  /** Why the tile cannot be tapped (sold out / outside its hours); null = available. */
  blocked: 'sold_out' | 'unavailable' | null
  onTap: (item: MenuItemData) => void
  onCustomize: (item: MenuItemData) => void
}

const LONG_PRESS_MS = 500

function Media({ item, emoji, dim }: { item: MenuItemData; emoji: string; dim: boolean }) {
  return item.image_path ? (
    <img
      src={`app-image://${item.image_path}`}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn('h-20 w-full object-cover', dim && 'grayscale')}
    />
  ) : (
    <div
      className="h-20 flex items-center justify-center text-4xl select-none"
      style={{ background: `linear-gradient(135deg, ${categoryTint(item.category_id, 24)}, ${categoryTint(item.category_id, 8)})` }}
    >
      <span className={cn(dim && 'grayscale opacity-70')}>{emoji}</span>
    </div>
  )
}

/** One menu tile: tap adds (or opens the sheet), long-press / right-click / ⚙ opens the options sheet. */
export const MenuTile = memo(function MenuTile({ item, label, price, qty, fallbackEmoji, hasOptions, blocked, onTap, onCustomize }: TileProps) {
  const { t } = useTranslation()
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const isCombo = item.is_combo === 1
  const canCustomize = !blocked && (hasOptions || isCombo)

  const clearPress = (): void => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  return (
    <div className="relative contain-card">
      <button
        type="button"
        disabled={Boolean(blocked)}
        aria-label={blocked ? `${label} · ${t(blocked === 'sold_out' ? 'pos.tile.soldOut' : 'pos.tile.unavailable')}` : label}
        onPointerDown={() => {
          longPressed.current = false
          if (!canCustomize) return
          pressTimer.current = setTimeout(() => {
            longPressed.current = true
            onCustomize(item)
          }, LONG_PRESS_MS)
        }}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={(e) => {
          e.preventDefault()
          if (canCustomize) onCustomize(item)
        }}
        onClick={() => {
          if (longPressed.current) return
          onTap(item)
        }}
        className={cn(
          'tap relative w-full h-full text-start rounded-2xl bg-surface border border-line shadow-e1 overflow-hidden',
          'hover:border-line-strong active:bg-surface-2 disabled:cursor-not-allowed disabled:shadow-none',
          blocked && 'opacity-60'
        )}
      >
        <Media item={item} emoji={item.emoji || fallbackEmoji} dim={Boolean(blocked)} />
        <span className="absolute top-0 inset-x-0 h-1" style={{ background: categoryColor(item.category_id) }} />
        {isCombo && !blocked && (
          <span className="absolute top-2.5 start-2.5 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface text-primary-ink text-xs font-bold shadow-e1">
            <Layers className="h-3.5 w-3.5" />
            {t('pos.tile.combo')}
          </span>
        )}
        {blocked && (
          <span className="absolute top-12 inset-x-0 flex justify-center">
            <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-inverse text-on-inverse text-xs font-bold">
              <Ban className="h-3.5 w-3.5" />
              {t(blocked === 'sold_out' ? 'pos.tile.soldOut' : 'pos.tile.unavailable')}
            </span>
          </span>
        )}
        <div className={cn('p-3 pt-2.5', canCustomize && 'pe-12')}>
          <p className="text-[0.9375rem] font-semibold text-ink leading-snug line-clamp-2 min-h-[2.6em]">{label}</p>
          <p className="mt-1 text-lg font-extrabold text-ink">
            <Money value={price} decimals={moneyDecimals(price)} />
          </p>
        </div>
      </button>
      {qty > 0 && (
        <span
          key={qty}
          dir="ltr"
          aria-label={t('pos.tile.inCart', { count: qty })}
          className="num pointer-events-none absolute top-2.5 end-2.5 min-w-8 h-8 px-2 rounded-full bg-ember text-sm font-extrabold flex items-center justify-center shadow-glow animate-bump"
        >
          ×{qty}
        </span>
      )}
      {canCustomize && (
        <button
          type="button"
          onClick={() => onCustomize(item)}
          aria-label={t('pos.tile.customize', { name: label })}
          className="tap absolute bottom-2 end-2 h-10 w-10 rounded-xl bg-surface-2 border border-line text-ink-2 flex items-center justify-center hover:bg-surface-3"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
        </button>
      )}
    </div>
  )
})

interface GroupTileProps {
  groupKey: string
  label: string
  items: MenuItemData[]
  channel: string
  foodLanguage: string
  qty: number
  fallbackEmoji: string
  expanded: boolean
  blockedIds: Set<number>
  onExpand: (key: string | null) => void
  onPick: (item: MenuItemData) => void
}

/** 3+ sizes of one product folded into a tile; tap opens the size picker in place. */
export const SizeGroupTile = memo(function SizeGroupTile(props: GroupTileProps) {
  const { t } = useTranslation()
  const first = props.items[0]
  const prices = props.items.map((i) => channelPrice(i.price, i.channel_prices, props.channel))
  const sizes = props.items.map((i) => sizeLabel(localName(i, props.foodLanguage)))
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  if (props.expanded) {
    return (
      <div className="relative rounded-2xl bg-surface border-2 border-primary shadow-e3 p-2 animate-pop-in">
        <div className="flex items-center gap-2 ps-1 pb-2">
          <span className="text-xl">{first.emoji || props.fallbackEmoji}</span>
          <span className="flex-1 min-w-0 text-sm font-bold text-ink truncate">{props.label}</span>
          <button
            type="button"
            onClick={() => props.onExpand(null)}
            aria-label={t('common.close')}
            className="tap h-9 w-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {props.items.map((size, i) => {
            const blocked = props.blockedIds.has(size.id)
            return (
              <button
                key={size.id}
                type="button"
                disabled={blocked}
                onClick={() => props.onPick(size)}
                className="tap min-h-14 rounded-xl bg-primary-soft text-center px-1 py-1.5 hover:bg-primary-soft-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="block text-sm font-extrabold text-ink">{sizes[i]}</span>
                <span className="block text-[0.8125rem] font-bold text-ink-2">
                  <Money value={prices[i]} decimals={moneyDecimals(prices[i])} styledSymbol={false} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div className="relative contain-card">
      <button
        type="button"
        onClick={() => props.onExpand(props.groupKey)}
        className="tap relative w-full h-full text-start rounded-2xl bg-surface border border-line shadow-e1 overflow-hidden hover:border-line-strong active:bg-surface-2"
      >
        <Media item={first} emoji={first.emoji || props.fallbackEmoji} dim={false} />
        <span className="absolute top-0 inset-x-0 h-1" style={{ background: categoryColor(first.category_id) }} />
        <span className="absolute top-2.5 start-2.5 inline-flex gap-1">
          {sizes.slice(0, 4).map((s) => (
            <span key={s} className="h-6 min-w-6 px-1.5 rounded-md bg-surface text-[0.6875rem] font-extrabold text-ink-2 flex items-center justify-center shadow-e1">{s}</span>
          ))}
        </span>
        <div className="p-3 pt-2.5">
          <p className="text-[0.9375rem] font-semibold text-ink leading-snug line-clamp-2 min-h-[2.6em]">{props.label}</p>
          <p className="mt-1 text-base font-extrabold text-ink whitespace-nowrap">
            <Money value={min} decimals={moneyDecimals(min)} styledSymbol={false} />
            <span className="text-muted font-semibold"> – </span>
            <Money value={max} decimals={moneyDecimals(max)} />
          </p>
        </div>
      </button>
      {props.qty > 0 && (
        <span key={props.qty} dir="ltr" className="num pointer-events-none absolute top-2.5 end-2.5 min-w-8 h-8 px-2 rounded-full bg-ember text-sm font-extrabold flex items-center justify-center shadow-glow animate-bump">
          ×{props.qty}
        </span>
      )}
    </div>
  )
})
