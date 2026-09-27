import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchX, UtensilsCrossed } from 'lucide-react'
import { EmptyState, cn } from '../../../components/ui'
import { activeChannel, channelPrice, useOrderStore } from '../../../store/orderStore'
import { buildGrid, simplifiedLabels, type SortDirection, type SortMode } from '../lib/menuGrid'
import { matchesQuery } from '../lib/names'
import type { CategoryData, MenuItemData } from '../types'
import type { ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import { MenuTile, SizeGroupTile } from './MenuTile'

interface MenuGridProps {
  items: MenuItemData[]
  categories: CategoryData[]
  activeCategory: number | null
  search: string
  sortMode: SortMode
  sortDirection: SortDirection
  compact: boolean
  foodLanguage: string
  isTouch: boolean
  groupsById: Map<number, ResolvedModifierGroup[]>
  catalogVersion: number
  onTap: (item: MenuItemData) => void
  onCustomize: (item: MenuItemData) => void
}

export function blockedReason(item: MenuItemData): 'sold_out' | 'unavailable' | null {
  if (item.sold_out) return 'sold_out'
  if (item.available_now === false || item.available_now === 0) return 'unavailable'
  return null
}

/** Item grid in fixed positions; each tile re-renders only when its own quantity/price changes. */
export const MenuGrid = memo(function MenuGrid(props: MenuGridProps) {
  const { t } = useTranslation()
  const channel = useOrderStore(activeChannel)
  const cartItems = useOrderStore((s) => s.items)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { onTap } = props
  const pickSize = useCallback((item: MenuItemData) => {
    setExpanded(null)
    onTap(item)
  }, [onTap])

  const qtyById = useMemo(() => {
    const map = new Map<number, number>()
    for (const line of cartItems) map.set(line.menu_item_id, (map.get(line.menu_item_id) || 0) + line.quantity)
    return map
  }, [cartItems])

  const labels = useMemo(() => simplifiedLabels(props.items, props.foodLanguage), [props.items, props.foodLanguage])
  const emojiByCategory = useMemo(() => new Map(props.categories.map((c) => [c.id, c.icon || '🍽️'])), [props.categories])
  const blockedIds = useMemo(() => new Set(props.items.filter((i) => blockedReason(i)).map((i) => i.id)), [props.items])

  const visible = useMemo(() => {
    const q = props.search.trim()
    return props.items.filter((i) => (props.activeCategory === null || i.category_id === props.activeCategory) && (!q || matchesQuery(i, q)))
  }, [props.items, props.activeCategory, props.search])

  const entries = useMemo(
    () => buildGrid(visible, { compact: props.compact && !props.search.trim(), sortMode: props.sortMode, sortDirection: props.sortDirection, foodLanguage: props.foodLanguage, labels }),
    [visible, props.compact, props.search, props.sortMode, props.sortDirection, props.foodLanguage, labels]
  )

  if (entries.length === 0) {
    return (
      <div className="flex-1 grid place-items-center">
        <EmptyState
          icon={props.search.trim() ? <SearchX /> : <UtensilsCrossed />}
          title={props.search.trim() ? t('pos.noMatch', { query: props.search.trim() }) : t('menu.noItems')}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6" style={{ contain: 'strict' }}>
      <div
        className={cn(
          'grid gap-3 content-start',
          props.isTouch ? 'grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] min-[1600px]:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]'
        )}
      >
        {entries.map((entry) => {
          if (entry.type === 'single') {
            const item = entry.item
            return (
              <MenuTile
                key={entry.key}
                item={item}
                label={entry.label}
                price={channelPrice(item.price, item.channel_prices, channel)}
                qty={qtyById.get(item.id) || 0}
                fallbackEmoji={emojiByCategory.get(item.category_id) || '🍽️'}
                hasOptions={(props.groupsById.get(item.id)?.length || 0) > 0}
                blocked={blockedReason(item)}
                onTap={props.onTap}
                onCustomize={props.onCustomize}
              />
            )
          }
          const qty = entry.items.reduce((sum, i) => sum + (qtyById.get(i.id) || 0), 0)
          return (
            <SizeGroupTile
              key={entry.key}
              groupKey={entry.key}
              label={entry.label}
              items={entry.items}
              channel={channel}
              foodLanguage={props.foodLanguage}
              qty={qty}
              fallbackEmoji={emojiByCategory.get(entry.items[0].category_id) || '🍽️'}
              expanded={expanded === entry.key}
              blockedIds={blockedIds}
              onExpand={setExpanded}
              onPick={pickSize}
            />
          )
        })}
      </div>
    </div>
  )
})
