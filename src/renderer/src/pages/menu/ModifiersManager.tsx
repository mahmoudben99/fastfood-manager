import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, ListTree, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import type { ModifierGroup } from '../../../../shared/catalog-types'
import { Badge, Button, EmptyState, IconButton, Input, SegmentedControl, Toggle, cn, toast } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { MoveButtons, formatDelta, moveItem, useFoodName, useTouchKeyboard } from './catalogShared'
import type { CategoryRow, ItemFacts, MenuRow, StockRow } from './menuTypes'
import { ModifierGroupEditor } from './ModifierGroupEditor'
import { KIND_CHIP } from './ModifierOptionEditor'
import { ruleText } from './ModifierSheetPreview'

interface ModifiersManagerProps {
  groups: ModifierGroup[]
  categories: CategoryRow[]
  items: MenuRow[]
  /** Per-item facts (item-level groups) to tell where a group is used. */
  facts: Record<number, ItemFacts>
  stockItems: StockRow[]
  /** Bumped by the page header's "New option group" button. */
  createRequest: number
  onChanged: () => Promise<unknown>
}

type View = 'library' | 'categories'
type Assignments = Record<number, { group_id: number; sort_order: number }[]>

/** Option-group library + "which groups each category shows, in which order". */
export function ModifiersManager({ groups, categories, items, facts, stockItems, createRequest, onChanged }: ModifiersManagerProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [view, setView] = useState<View>('library')
  const [search, setSearch] = useState('')
  const [assignments, setAssignments] = useState<Assignments>({})
  const [editor, setEditor] = useState<{ group: ModifierGroup | null; key: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const loadAssignments = useCallback(async () => {
    try {
      const rows = await Promise.all(categories.map((c) => window.api.modifiers.getCategoryAssignments(c.id)))
      setAssignments(Object.fromEntries(categories.map((c, i) => [c.id, rows[i]])))
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('modifiers.errors.loadFailed')))
    }
  }, [categories, t])

  useEffect(() => { void loadAssignments() }, [loadAssignments])
  // Only requests made while mounted open the editor (switching tabs must not replay one).
  const handledRequest = useRef(createRequest)
  useEffect(() => {
    if (createRequest === handledRequest.current) return
    handledRequest.current = createRequest
    setEditor({ group: null, key: Date.now() })
  }, [createRequest])

  const itemsUsing = (groupId: number) => Object.values(facts).filter((f) => f.itemGroupIds.includes(groupId)).length
  const categoriesOf = (groupId: number) => categories.filter((c) => assignments[c.id]?.some((row) => row.group_id === groupId))
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const needle = search.trim().toLowerCase()
  const shown = groups.filter(
    (g) => !needle || [g.name, g.name_ar, g.name_fr, ...g.options.map((o) => o.name)].some((n) => n?.toLowerCase().includes(needle))
  )

  const afterSave = async () => {
    await onChanged()
    await loadAssignments()
  }

  const setActive = async (group: ModifierGroup, active: boolean) => {
    try {
      await window.api.modifiers.updateGroup(group.id, { is_active: active })
      await onChanged()
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('modifiers.errors.saveFailed')))
    }
  }

  const writeCategory = async (categoryId: number, groupIds: number[]) => {
    setBusy(true)
    try {
      const rows = await window.api.modifiers.setCategoryAssignments(categoryId, groupIds.map((group_id, i) => ({ group_id, sort_order: i })))
      setAssignments((prev) => ({ ...prev, [categoryId]: rows }))
      await onChanged()
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('modifiers.errors.saveFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[16rem]">
          <Input
            leading={<Search />}
            placeholder={t('modifiers.search')}
            aria-label={t('modifiers.search')}
            trailing={search ? <IconButton size="sm" icon={<X />} label={t('common.close')} onClick={() => setSearch('')} /> : undefined}
            {...kb.bind(search, setSearch)}
          />
        </div>
        <SegmentedControl<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'library', label: t('modifiers.viewLibrary'), icon: <Layers /> },
            { value: 'categories', label: t('modifiers.viewCategories'), icon: <ListTree /> }
          ]}
        />
      </div>

      {view === 'library' && groups.length === 0 && (
        <EmptyState
          icon={<SlidersHorizontal />}
          title={t('modifiers.emptyTitle')}
          description={t('modifiers.emptyBody')}
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ group: null, key: Date.now() })}>{t('modifiers.newGroup')}</Button>}
        />
      )}

      {view === 'library' && groups.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] gap-4">
          {shown.map((group) => {
            const rule = ruleText({ is_required: group.is_required === 1, min_select: group.min_select, max_select: group.max_select })
            const cats = categoriesOf(group.id)
            const onItems = itemsUsing(group.id)
            const active = group.options.filter((o) => o.is_active === 1)
            return (
              <div
                key={group.id}
                className={cn('contain-card rounded-2xl border border-line bg-surface shadow-e1 flex flex-col', group.is_active !== 1 && 'opacity-75')}
              >
                <button type="button" onClick={() => setEditor({ group, key: Date.now() })} className="tap text-start p-4 pb-3 flex-1 flex flex-col justify-start rounded-t-2xl hover:bg-surface-2/50">
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
                      <SlidersHorizontal className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold text-ink truncate">{getName(group)}</p>
                      <p className="text-xs text-muted truncate">{[group.name, group.name_fr, group.name_ar].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Badge variant={group.is_required === 1 ? 'warning' : 'neutral'}>{t(rule.key, rule.params)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {active.slice(0, 7).map((option) => (
                      <span key={option.id} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', KIND_CHIP[option.kind])}>
                        {getName(option)}
                        {option.price_delta !== 0 && <bdi dir="ltr" className="num opacity-80">{formatDelta(option.price_delta)}</bdi>}
                        {option.is_default === 1 && <span aria-hidden="true">★</span>}
                      </span>
                    ))}
                    {active.length > 7 && <span className="rounded-lg px-2 py-1 text-xs font-semibold bg-surface-2 text-muted">+{active.length - 7}</span>}
                    {active.length === 0 && <span className="text-xs font-semibold text-warning-ink">{t('modifiers.noActiveOptions')}</span>}
                  </div>
                </button>
                <div className="flex items-center gap-3 border-t border-line px-4 py-2">
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-semibold text-muted">{t('modifiers.shownOn')}</span>
                    {cats.length === 0 && onItems === 0 && <span className="font-semibold text-warning-ink">{t('modifiers.nowhere')}</span>}
                    {cats.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1.5 font-semibold text-ink-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(c.id) }} />
                        {getName(c)}
                      </span>
                    ))}
                    {onItems > 0 && <span className="font-semibold text-ink-2">{t('modifiers.onItems', { count: onItems })}</span>}
                  </div>
                  <div className="w-auto">
                    <Toggle size="md" checked={group.is_active === 1} onChange={(v) => void setActive(group, v)} />
                  </div>
                </div>
              </div>
            )
          })}
          {shown.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted">{t('common.noResults')}</p>}
        </div>
      )}

      {view === 'categories' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] gap-4">
          {categories.map((category) => {
            const rows = assignments[category.id] ?? []
            const ids = rows.map((row) => row.group_id)
            const addable = groups.filter((g) => !ids.includes(g.id))
            const count = items.filter((item) => item.category_id === category.id).length
            return (
              <div key={category.id} className="relative rounded-2xl border border-line bg-surface shadow-e1 p-4 ps-5 overflow-hidden">
                <span className="absolute start-0 inset-y-0 w-1.5" style={{ background: categoryColor(category.id) }} />
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{category.icon}</span>
                  <p className="font-bold text-ink flex-1 truncate">{getName(category)}</p>
                  <Badge variant="neutral">{t('menu.categories.itemCount', { count })}</Badge>
                </div>
                <ol className="space-y-1.5">
                  {ids.map((groupId, index) => {
                    const group = byId.get(groupId)
                    if (!group) return null
                    const rule = ruleText({ is_required: group.is_required === 1, min_select: group.min_select, max_select: group.max_select })
                    return (
                      <li key={groupId} className="flex items-center gap-2 rounded-xl bg-surface-2/70 border border-line ps-3">
                        <span className="num w-5 text-sm font-bold text-muted">{index + 1}</span>
                        <div className="flex-1 min-w-0 py-1.5">
                          <p className="font-semibold text-ink truncate">{getName(group)}</p>
                          <p className="text-xs text-muted truncate">{t(rule.key, rule.params)}{group.is_active !== 1 ? ` · ${t('modifiers.inactive')}` : ''}</p>
                        </div>
                        <MoveButtons disabled={busy} canUp={index > 0} canDown={index < ids.length - 1} onUp={() => void writeCategory(category.id, moveItem(ids, index, -1))} onDown={() => void writeCategory(category.id, moveItem(ids, index, 1))} />
                        <IconButton icon={<X />} variant="danger" disabled={busy} label={t('modifiers.removeFromCategory')} onClick={() => void writeCategory(category.id, ids.filter((id) => id !== groupId))} />
                      </li>
                    )
                  })}
                  {ids.length === 0 && <li className="text-sm text-muted py-2">{t('modifiers.categoryEmpty')}</li>}
                </ol>
                {addable.length > 0 && (
                  <select
                    data-ui="select"
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && void writeCategory(category.id, [...ids, Number(e.target.value)])}
                    className="mt-3 w-full min-h-12 rounded-xl border border-dashed border-line-strong bg-surface px-3 text-sm font-semibold text-primary-ink dark:bg-surface-2"
                    aria-label={t('modifiers.addToCategory')}
                  >
                    <option value="">+ {t('modifiers.addToCategory')}</option>
                    {addable.map((g) => <option key={g.id} value={g.id}>{getName(g)}</option>)}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editor && (
        <ModifierGroupEditor
          key={editor.key}
          group={editor.group}
          categoryIds={editor.group ? categoriesOf(editor.group.id).map((c) => c.id) : []}
          categories={categories}
          stockItems={stockItems}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      )}
      {kb.keyboard}
    </div>
  )
}
