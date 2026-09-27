import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, FolderPlus, Search } from 'lucide-react'
import { Button, Input, Money, cn } from '../../components/ui'
import { categoryColor, categoryTint } from '../../theme/categoryColors'
import { useFoodName, useTouchKeyboard } from './catalogShared'
import { newChoice, type ChoiceDraft, type SlotDraft } from './comboLogic'
import type { CategoryRow, MenuRow } from './menuTypes'

interface ComboChoicePickerProps {
  slot: SlotDraft
  items: MenuRow[]
  categories: CategoryRow[]
  comboId: number | null
  onChange: (choices: ChoiceDraft[]) => void
  onDone: () => void
}

/** Inline (no nested modal) picker: tap items to offer them, or offer a whole category. */
export function ComboChoicePicker({ slot, items, categories, comboId, onChange, onDone }: ComboChoicePickerProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(categories[0]?.id ?? null)

  const sellable = items.filter((item) => !item.is_combo && item.id !== comboId)
  const needle = search.trim().toLowerCase()
  const shown = sellable.filter((item) =>
    needle
      ? [item.name, item.name_ar, item.name_fr].some((n) => n?.toLowerCase().includes(needle))
      : categoryId === null || item.category_id === categoryId
  )
  const hasItem = (id: number) => slot.choices.some((c) => c.menu_item_id === id)
  const hasCategory = (id: number) => slot.choices.some((c) => c.category_id === id)

  const toggleItem = (id: number) =>
    onChange(hasItem(id) ? slot.choices.filter((c) => c.menu_item_id !== id) : [...slot.choices, newChoice({ menu_item_id: id })])
  const toggleCategory = (id: number) =>
    onChange(hasCategory(id) ? slot.choices.filter((c) => c.category_id !== id) : [...slot.choices, newChoice({ category_id: id })])

  const category = categories.find((c) => c.id === categoryId)

  return (
    <div className="rounded-2xl border border-primary/40 bg-surface-2/60 p-3 space-y-3 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[12rem]">
          <Input leading={<Search />} placeholder={t('combos.picker.search')} aria-label={t('combos.picker.search')} {...kb.bind(search, setSearch)} />
        </div>
        <Button size="lg" onClick={onDone}>{t('combos.picker.done')}</Button>
      </div>

      {!needle && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {categories.map((c) => {
            const active = c.id === categoryId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  'tap relative shrink-0 min-h-11 rounded-xl ps-4 pe-3 flex items-center gap-2 text-sm font-semibold border overflow-hidden',
                  active ? 'bg-surface text-ink border-line-strong shadow-e1 dark:bg-surface-3' : 'bg-transparent text-ink-2 border-transparent hover:bg-surface'
                )}
              >
                <span className="absolute start-0 inset-y-2 w-1 rounded-e-full" style={{ background: categoryColor(c.id) }} />
                {c.icon && <span className="text-lg">{c.icon}</span>}
                {getName(c)}
                {hasCategory(c.id) && <Check className="h-4 w-4 text-primary-ink" />}
              </button>
            )
          })}
        </div>
      )}

      {!needle && category && (
        <button
          type="button"
          aria-pressed={hasCategory(category.id)}
          title={t('combos.picker.wholeCategoryHint')}
          onClick={() => toggleCategory(category.id)}
          className={cn(
            'tap w-full min-h-12 rounded-xl border-2 border-dashed px-4 flex items-center gap-3 text-start text-sm font-semibold',
            hasCategory(category.id) ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line-strong text-ink-2 hover:bg-surface'
          )}
        >
          {hasCategory(category.id) ? <Check className="h-5 w-5" /> : <FolderPlus className="h-5 w-5" />}
          <span className="flex-1">{t('combos.picker.wholeCategory', { category: getName(category) })}</span>
        </button>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
        {shown.map((item) => {
          const on = hasItem(item.id)
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleItem(item.id)}
              className={cn(
                'tap contain-card relative min-h-16 rounded-xl border text-start ps-2 pe-3 py-2 flex items-center gap-2',
                on ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-line-strong dark:bg-surface-2'
              )}
            >
              <span className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-xl" style={{ background: categoryTint(item.category_id, 20) }}>
                {item.emoji || '🍽️'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink leading-tight line-clamp-2">{getName(item)}</span>
                <span className="block text-xs text-muted"><Money value={item.price} decimals={0} /></span>
              </span>
              {on && (
                <span className="absolute top-1.5 end-1.5 h-5 w-5 rounded-full bg-primary text-on-primary flex items-center justify-center">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          )
        })}
        {shown.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted">{t('common.noResults')}</p>}
      </div>
      {kb.keyboard}
    </div>
  )
}
