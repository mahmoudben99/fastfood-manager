import { memo, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown01, ArrowDownAZ, ArrowUp01, ArrowUpAZ, BarChart3, ChefHat, ClipboardList, Layers, LayoutGrid, Lock, Moon, Search, Sun, X
} from 'lucide-react'
import { IconButton, SegmentedControl, cn } from '../../../components/ui'
import { ShiftBar } from '../../../components/checkout'
import { useAppStore } from '../../../store/appStore'
import type { SortDirection, SortMode } from '../lib/menuGrid'
import { useTouchField } from '../touchKeyboard'

interface TopBarProps {
  searchRef: RefObject<HTMLInputElement | null>
  search: string
  onSearch: (value: string) => void
  sortMode: SortMode
  sortDirection: SortDirection
  onSort: (mode: SortMode) => void
  compact: boolean
  onToggleCompact: () => void
  ongoingCount: number
  readyCount: number
  onOpenHistory: () => void
  onOpenRecap: () => void
  onAdmin: () => void
}

/** Header aligned on the body grid: brand over the rail, search + view tools over the items, shift/orders over the ticket. */
export const TopBar = memo(function TopBar(props: TopBarProps) {
  const { t } = useTranslation()
  const restaurantName = useAppStore((s) => s.restaurantName)
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)
  const isTouch = useAppStore((s) => s.inputMode === 'touchscreen')
  const field = useTouchField(props.search, props.onSearch, 'text')

  const nameIcon = props.sortMode === 'name' && props.sortDirection === 'desc' ? <ArrowDownAZ /> : <ArrowUpAZ />
  const priceIcon = props.sortMode === 'price' && props.sortDirection === 'desc' ? <ArrowDown01 /> : <ArrowUp01 />

  return (
    <header className="col-span-3 grid grid-cols-subgrid items-center h-16 bg-surface border-b border-line">
      <div className="flex items-center gap-2.5 ps-4 pe-2 min-w-0 max-[1199px]:justify-center max-[1199px]:px-2">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-ember flex items-center justify-center shadow-glow">
          <ChefHat className="h-5 w-5" />
        </span>
        <span dir="auto" className="font-extrabold text-ink truncate leading-tight max-[1199px]:hidden">{restaurantName || t('pos.title')}</span>
      </div>

      <div className="flex items-center gap-2 px-3 min-w-0">
        <div className="relative flex-1 min-w-32 max-w-xl">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-faint" />
          <input
            ref={props.searchRef}
            type="text"
            data-ui="input"
            {...field}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={t('pos.search')}
            aria-label={t('pos.search')}
            className={cn(
              'w-full h-11 rounded-xl border border-line-strong bg-surface-2 ps-11 pe-11 text-base text-ink placeholder:text-faint',
              'focus:outline-none focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/15',
              isTouch && 'cursor-pointer'
            )}
          />
          {!props.search && !isTouch && (
            <kbd className="num pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 rounded-md border border-line-strong bg-surface px-1.5 py-0.5 text-xs font-bold text-muted">F4</kbd>
          )}
          {props.search && (
            <button
              type="button"
              onClick={() => props.onSearch('')}
              aria-label={t('common.close')}
              className="tap absolute end-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-3"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <SegmentedControl
          size="md"
          ariaLabel={t('pos.sort.label')}
          value={props.sortMode}
          onChange={props.onSort}
          options={[
            { value: 'name', label: <span className="max-[1279px]:sr-only">{t('pos.sort.name')}</span>, icon: nameIcon, ariaLabel: t('pos.sort.name') },
            { value: 'price', label: <span className="max-[1279px]:sr-only">{t('pos.sort.price')}</span>, icon: priceIcon, ariaLabel: t('pos.sort.price') }
          ]}
        />
        <IconButton
          icon={props.compact ? <Layers /> : <LayoutGrid />}
          label={props.compact ? t('pos.sort.compact') : t('pos.sort.expanded')}
          variant={props.compact ? 'soft' : 'ghost'}
          onClick={props.onToggleCompact}
        />
        <IconButton icon={<BarChart3 />} label={t('pos.recap.button')} onClick={props.onOpenRecap} className="ms-auto" />
        <IconButton icon={darkMode ? <Sun /> : <Moon />} label={t('pos.topbar.theme')} onClick={toggleDarkMode} />
      </div>

      <div className="flex items-center justify-end gap-2 pe-3 ps-2 min-w-0">
        <div className="min-w-0 flex justify-end">
          <ShiftBar compact />
        </div>
        <button
          type="button"
          onClick={props.onOpenHistory}
          className="tap relative inline-flex items-center gap-2 h-11 px-3.5 max-[1279px]:px-2.5 rounded-xl bg-surface-2 border border-line text-ink font-semibold hover:bg-surface-3 shrink-0"
        >
          <ClipboardList className="h-5 w-5 shrink-0 text-ink-2" />
          <span className="truncate max-[1279px]:sr-only">{t('orders.today')}</span>
          {props.ongoingCount > 0 && (
            <span className="num min-w-6 h-6 px-1.5 rounded-full bg-danger-strong text-white text-xs font-bold flex items-center justify-center max-[1279px]:absolute max-[1279px]:-top-2 max-[1279px]:-end-2 max-[1279px]:min-w-5 max-[1279px]:h-5 max-[1279px]:ring-2 max-[1279px]:ring-surface">
              {props.ongoingCount}
            </span>
          )}
          {props.readyCount > 0 && (
            <span title={t('pos.topbar.readyCount', { count: props.readyCount })} className="num inline-flex items-center gap-1 h-6 px-2 rounded-full bg-success-soft text-success-ink text-xs font-bold max-[1279px]:absolute max-[1279px]:-bottom-2 max-[1279px]:-end-2 max-[1279px]:h-5 max-[1279px]:px-1.5 max-[1279px]:ring-2 max-[1279px]:ring-surface">
              <ChefHat className="h-3.5 w-3.5" />
              {props.readyCount}
              <span className="sr-only">{t('pos.topbar.readyCount', { count: props.readyCount })}</span>
            </span>
          )}
        </button>
        <IconButton icon={<Lock />} label={t('nav.admin')} variant="secondary" onClick={props.onAdmin} />
      </div>
    </header>
  )
})
