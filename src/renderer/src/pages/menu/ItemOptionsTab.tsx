import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag, X } from 'lucide-react'
import type { ModifierGroup } from '../../../../shared/catalog-types'
import { Badge, IconButton, Toggle } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { MoveButtons, SectionLabel, moveItem, useFoodName } from './catalogShared'
import type { CategoryRow } from './menuTypes'
import { ITEM_SORT_BASE, resolveGroupsLocal, type ItemAssignment } from './modifierLogic'
import { ModifierSheetPreview, ruleText } from './ModifierSheetPreview'

interface ItemOptionsTabProps {
  library: ModifierGroup[]
  category: CategoryRow | undefined
  rows: ItemAssignment[]
  onChange: (rows: ItemAssignment[]) => void
  preview: { name: string; name_ar?: string | null; name_fr?: string | null; price: number; emoji?: string | null }
}

/**
 * Which option groups this item shows: the category's groups (each can be hidden for this item)
 * plus groups added only for this item, with a live copy of the cashier's option sheet.
 */
export function ItemOptionsTab({ library, category, rows, onChange, preview }: ItemOptionsTabProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const [categoryRows, setCategoryRows] = useState<{ group_id: number; sort_order: number }[]>([])
  const byId = new Map(library.map((g) => [g.id, g]))

  useEffect(() => {
    let alive = true
    if (!category) {
      setCategoryRows([])
      return
    }
    window.api.modifiers
      .getCategoryAssignments(category.id)
      .then((result) => alive && setCategoryRows(result))
      .catch(() => alive && setCategoryRows([]))
    return () => {
      alive = false
    }
  }, [category?.id])

  const categoryIds = new Set(categoryRows.map((row) => row.group_id))
  const excluded = new Set(rows.filter((row) => row.excluded).map((row) => row.group_id))
  const own = rows.filter((row) => !row.excluded && !categoryIds.has(row.group_id)).sort((a, b) => a.sort_order - b.sort_order)
  const addable = library.filter((g) => !categoryIds.has(g.id) && !own.some((row) => row.group_id === g.id))

  const setShown = (groupId: number, shown: boolean) => {
    const rest = rows.filter((row) => row.group_id !== groupId)
    onChange(shown ? rest : [...rest, { group_id: groupId, sort_order: 0, excluded: true }])
  }

  const writeOwn = (ordered: number[]) => {
    const others = rows.filter((row) => row.excluded || categoryIds.has(row.group_id))
    onChange([...others, ...ordered.map((group_id, i) => ({ group_id, sort_order: ITEM_SORT_BASE + i, excluded: false }))])
  }
  const ownIds = own.map((row) => row.group_id)

  const ruleOf = (group: ModifierGroup) => {
    const rule = ruleText({ is_required: group.is_required === 1, min_select: group.min_select, max_select: group.max_select })
    return t(rule.key, rule.params)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
      <div className="space-y-6 min-w-0">
        <section>
          <SectionLabel>
            <span className="inline-flex items-center gap-2">
              {category && <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(category.id) }} />}
              {t('modifiers.item.fromCategory', { category: category ? getName(category) : '—' })}
            </span>
          </SectionLabel>
          <div className="space-y-2">
            {categoryRows.map((row) => {
              const group = byId.get(row.group_id)
              if (!group) return null
              const shown = !excluded.has(group.id)
              return (
                <div key={group.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface ps-4 pe-2">
                  <div className="flex-1 min-w-0 py-2">
                    <p className={shown ? 'font-semibold text-ink truncate' : 'font-semibold text-muted line-through truncate'}>{getName(group)}</p>
                    <p className="text-xs text-muted truncate">
                      {ruleOf(group)} · {t('modifiers.item.optionCount', { count: group.options.filter((o) => o.is_active === 1).length })}
                      {group.is_active !== 1 ? ` · ${t('modifiers.inactive')}` : ''}
                    </p>
                  </div>
                  <div className="w-44 shrink-0">
                    <Toggle size="md" checked={shown} onChange={(v) => setShown(group.id, v)} label={shown ? t('modifiers.item.shown') : t('modifiers.item.hidden')} />
                  </div>
                </div>
              )
            })}
            {categoryRows.length === 0 && (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-muted">{t('modifiers.item.noCategoryGroups')}</p>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>{t('modifiers.item.own')}</SectionLabel>
          <ol className="space-y-2">
            {own.map((row, index) => {
              const group = byId.get(row.group_id)
              if (!group) return null
              return (
                <li key={row.group_id} className="flex items-center gap-2 rounded-xl border border-line bg-surface ps-3">
                  <span className="num w-5 text-sm font-bold text-muted">{index + 1}</span>
                  <div className="flex-1 min-w-0 py-2">
                    <p className="font-semibold text-ink truncate">{getName(group)}</p>
                    <p className="text-xs text-muted truncate">{ruleOf(group)}</p>
                  </div>
                  {group.is_active !== 1 && <Badge variant="neutral">{t('modifiers.inactive')}</Badge>}
                  <MoveButtons canUp={index > 0} canDown={index < own.length - 1} onUp={() => writeOwn(moveItem(ownIds, index, -1))} onDown={() => writeOwn(moveItem(ownIds, index, 1))} />
                  <IconButton icon={<X />} variant="danger" label={t('modifiers.item.remove')} onClick={() => writeOwn(ownIds.filter((id) => id !== row.group_id))} />
                </li>
              )
            })}
          </ol>
          {addable.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {addable.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => writeOwn([...ownIds, group.id])}
                  className="tap min-h-12 rounded-xl border border-dashed border-line-strong bg-surface px-4 flex items-center gap-2 text-sm font-semibold text-primary-ink hover:bg-primary-soft dark:bg-surface-2"
                >
                  <Tag className="h-4 w-4" />+ {getName(group)}
                </button>
              ))}
            </div>
          ) : (
            library.length === 0 && <p className="text-sm text-muted">{t('modifiers.item.noLibrary')}</p>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-0 self-start space-y-2">
        <p className="text-sm font-semibold text-ink-2">{t('modifiers.preview.heading')}</p>
        <ModifierSheetPreview item={preview} groups={resolveGroupsLocal(library, categoryRows, rows)} />
      </aside>
    </div>
  )
}
