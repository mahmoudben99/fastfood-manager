import { ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArchiveRestore, Ban, CookingPot, LayoutGrid, Plus, Search, UtensilsCrossed, X, Zap } from 'lucide-react'
import { Button, EmptyState, IconButton, Input, Skeleton, Toggle, cn } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { useFoodName, useTouchKeyboard } from './catalogShared'
import type { CategoryRow, ItemFacts, MenuRow } from './menuTypes'
import { MenuItemCard } from './MenuItemCard'

type View = 'all' | 'soldOut' | 'noRecipe' | number

interface MenuItemsSectionProps {
  loading: boolean
  items: MenuRow[]
  deletedItems: MenuRow[]
  categories: CategoryRow[]
  facts: Record<number, ItemFacts>
  autoSoldOut: boolean
  onAutoSoldOut: (enabled: boolean) => void
  showDeleted: boolean
  setShowDeleted: (value: boolean) => void
  onAdd: () => void
  onOpen: (item: MenuRow) => void
  onDelete: (item: MenuRow) => void
  onRestore: (item: MenuRow) => void
  onSoldOut: (item: MenuRow, soldOut: boolean) => void
}

/** Rail (categories in order-screen colours + quick views) · search · item cards. */
export function MenuItemsSection(props: MenuItemsSectionProps) {
  const { items, deletedItems, categories, facts, showDeleted } = props
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')

  const noRecipe = (item: MenuRow) => !!facts[item.id] && !facts[item.id].hasRecipe && item.is_combo !== 1
  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const item of items) map.set(item.category_id, (map.get(item.category_id) ?? 0) + 1)
    return map
  }, [items])
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const needle = search.trim().toLowerCase()

  const source = showDeleted ? deletedItems : items
  const shown = source.filter((item) => {
    if (needle && ![item.name, item.name_ar, item.name_fr].some((n) => n?.toLowerCase().includes(needle))) return false
    if (showDeleted) return true
    if (view === 'soldOut') return item.sold_out === 1
    if (view === 'noRecipe') return noRecipe(item)
    return view === 'all' || item.category_id === view
  })

  const pick = (next: View | 'deleted') => {
    props.setShowDeleted(next === 'deleted')
    if (next !== 'deleted') setView(next)
  }

  const railButton = (id: View | 'deleted', label: string, icon: ReactNode, count: number, color?: string) => {
    const active = id === 'deleted' ? showDeleted : !showDeleted && view === id
    return (
      <button
        key={String(id)}
        type="button"
        onClick={() => pick(id)}
        aria-pressed={active}
        className={cn(
          'tap relative w-full rounded-2xl ps-4 pe-3 flex items-center gap-3 text-start',
          typeof id === 'number' || id === 'all' ? 'min-h-14' : 'min-h-12',
          active ? 'bg-surface shadow-e2 text-ink dark:bg-surface-3' : 'text-ink-2 hover:bg-surface/70'
        )}
      >
        {color && <span className={cn('absolute start-0 top-3 bottom-3 rounded-e-full', active ? 'w-1.5' : 'w-1 opacity-60')} style={{ background: color }} />}
        <span className="text-2xl w-8 flex justify-center shrink-0">{icon}</span>
        <span className="flex-1 min-w-0 text-[15px] font-bold truncate">{label}</span>
        <span className="num text-xs font-bold text-muted">{count}</span>
      </button>
    )
  }
  const iconClass = 'h-5 w-5 text-muted'

  return (
    <div className="grid grid-cols-1 md:grid-cols-[11.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,1fr)] gap-4 xl:gap-5 items-start">
      <nav className="md:sticky md:top-0 rounded-3xl border border-line bg-surface-2/60 p-2 space-y-1" aria-label={t('menu.rail.label')}>
        {railButton('all', t('menu.rail.all'), <LayoutGrid className="h-6 w-6 text-muted" />, items.length)}
        {categories.map((c) => railButton(c.id, getName(c), c.icon || '•', counts.get(c.id) ?? 0, categoryColor(c.id)))}
        <div className="border-t border-line my-1.5" />
        {railButton('soldOut', t('menu.filters.soldOut'), <Ban className={iconClass} />, items.filter((i) => i.sold_out === 1).length)}
        {railButton('noRecipe', t('menu.filters.noRecipe'), <CookingPot className={iconClass} />, items.filter(noRecipe).length)}
        {railButton('deleted', t('menu.rail.deleted'), <ArchiveRestore className={iconClass} />, deletedItems.length)}
        <div className="border-t border-line mt-1.5 pt-1 px-2" title={t('menu.autoSoldOut.hint')}>
          <Toggle
            size="md"
            checked={props.autoSoldOut}
            onChange={props.onAutoSoldOut}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-warning-ink shrink-0" />
                {t('menu.autoSoldOut.label')}
              </span>
            }
          />
        </div>
      </nav>

      <div className="min-w-0 space-y-4">
        <Input
          leading={<Search />}
          placeholder={showDeleted ? t('menu.deletedTitle') : t('menu.search')}
          aria-label={t('menu.search')}
          trailing={search ? <IconButton size="sm" icon={<X />} label={t('common.close')} onClick={() => setSearch('')} /> : undefined}
          {...kb.bind(search, setSearch)}
        />

        {props.loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line-strong bg-surface">
            <EmptyState
              compact
              icon={showDeleted ? <ArchiveRestore /> : <UtensilsCrossed />}
              title={showDeleted ? t('menu.noDeletedItems') : items.length === 0 ? t('menu.noItems') : t('common.noResults')}
              description={!showDeleted && items.length === 0 ? t('menu.emptyBody') : undefined}
              action={!showDeleted && items.length === 0 ? <Button icon={<Plus className="h-4 w-4" />} onClick={props.onAdd}>{t('menu.addItem')}</Button> : undefined}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {shown.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                category={catById.get(item.category_id)}
                facts={facts[item.id]}
                deleted={showDeleted}
                onOpen={props.onOpen}
                onDelete={props.onDelete}
                onRestore={props.onRestore}
                onSoldOut={props.onSoldOut}
              />
            ))}
          </div>
        )}
      </div>
      {kb.keyboard}
    </div>
  )
}
