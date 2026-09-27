import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutGrid } from 'lucide-react'
import { cn } from '../../../components/ui'
import { categoryColor } from '../../../theme/categoryColors'
import type { CategoryData } from '../types'

interface CategoryRailProps {
  categories: CategoryData[]
  counts: Map<number, number>
  total: number
  active: number | null
  onSelect: (id: number | null) => void
  foodLanguage: string
  showKeys: boolean
}

const nameOf = (cat: CategoryData, lang: string): string =>
  (lang === 'ar' && cat.name_ar) || (lang === 'fr' && cat.name_fr) || cat.name

/** Fixed-order category rail (muscle memory): colour bar + emoji + name + item count, ≥64px rows. */
export const CategoryRail = memo(function CategoryRail({ categories, counts, total, active, onSelect, foodLanguage, showKeys }: CategoryRailProps) {
  const { t } = useTranslation()
  const row = (key: string, isActive: boolean, onClick: () => void, icon: ReactNode, label: string, count: number, color: string | null, hotkey: number) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'tap relative w-full min-h-16 rounded-2xl ps-4 pe-2 py-2 flex items-center gap-3 text-start',
        'max-[1199px]:flex-col max-[1199px]:justify-center max-[1199px]:gap-1 max-[1199px]:px-1.5 max-[1199px]:text-center',
        isActive ? 'bg-surface shadow-e2 text-ink dark:bg-surface-3' : 'text-ink-2 hover:bg-surface/70'
      )}
    >
      <span
        className={cn('absolute start-0 top-3 bottom-3 rounded-e-full', isActive ? 'w-1.5' : 'w-1 opacity-60')}
        style={{ background: color ?? 'var(--ink-2)' }}
      />
      <span className="text-2xl leading-none w-7 text-center shrink-0 [&_svg]:h-6 [&_svg]:w-6 [&_svg]:mx-auto">{icon}</span>
      <span className="min-w-0 flex-1 max-[1199px]:flex-none max-[1199px]:w-full">
        <span className="block text-[0.9375rem] font-bold leading-snug line-clamp-2 max-[1199px]:text-[0.8125rem] max-[1199px]:leading-tight">{label}</span>
        <span className="num block text-xs font-semibold text-muted max-[1199px]:hidden">{count}</span>
      </span>
      {showKeys && hotkey <= 9 && (
        <kbd className="num self-start mt-0.5 text-[0.6875rem] font-semibold text-faint max-[1199px]:hidden">{hotkey}</kbd>
      )}
    </button>
  )

  return (
    <nav aria-label={t('pos.categories')} className="min-h-0 overflow-y-auto border-e border-line bg-surface-2/60 p-2 space-y-1.5 no-scrollbar">
      {row('all', active === null, () => onSelect(null), <LayoutGrid className="text-ink-2" />, t('pos.all'), total, null, 1)}
      {categories.map((cat, index) =>
        row(
          String(cat.id),
          active === cat.id,
          () => onSelect(cat.id),
          cat.icon || '🍽️',
          nameOf(cat, foodLanguage),
          counts.get(cat.id) || 0,
          categoryColor(cat.id),
          index + 2
        )
      )}
    </nav>
  )
})
