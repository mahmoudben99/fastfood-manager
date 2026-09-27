import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import type { ModifierGroup } from '../../../../shared/catalog-types'
import { Badge, Button, Input, Modal, SegmentedControl, Toggle, cn, toast } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { InlineNotice, SectionLabel, Stepper, moveItem, useFoodName, useTouchKeyboard } from './catalogShared'
import type { CategoryRow, StockRow } from './menuTypes'
import {
  draftToResolved,
  groupToDraft,
  newOptionDraft,
  optionChanged,
  optionInput,
  validateGroupDraft,
  type GroupDraft,
  type OptionDraft
} from './modifierLogic'
import { ModifierOptionEditor } from './ModifierOptionEditor'
import { ModifierSheetPreview, ruleText } from './ModifierSheetPreview'
import { checkRecipeRows, isBlockingIssue } from './recipeUnits'

interface ModifierGroupEditorProps {
  /** null = create a new group. */
  group: ModifierGroup | null
  /** Categories currently showing the group. */
  categoryIds: number[]
  categories: CategoryRow[]
  stockItems: StockRow[]
  onClose: () => void
  onSaved: () => Promise<unknown>
}

/** Create / edit one option group: rules, options (with stock), where it shows, live preview. */
export function ModifierGroupEditor({ group, categoryIds, categories, stockItems, onClose, onSaved }: ModifierGroupEditorProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [draft, setDraft] = useState<GroupDraft>(() => groupToDraft(group, categoryIds))
  // Option ids that exist in the database (grows as a failed save creates some).
  const persistedIds = useRef<number[]>((group?.options ?? []).map((o) => o.id))
  const [originalCategories, setOriginalCategories] = useState<number[]>(categoryIds)
  const [expanded, setExpanded] = useState<string | null>(group ? null : draft.options[0]?.key ?? null)
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patch = (next: Partial<GroupDraft>) => setDraft((prev) => ({ ...prev, ...next }))
  const patchOption = (key: string, next: Partial<OptionDraft>) =>
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((option) => {
        if (option.key === key) return { ...option, ...next }
        // One-choice groups: a new default replaces the previous one.
        if (next.is_default && prev.max_select === 1) return { ...option, is_default: false }
        return option
      })
    }))

  const addOption = () => {
    const option = newOptionDraft()
    setDraft((prev) => ({ ...prev, options: [...prev.options, option] }))
    setExpanded(option.key)
  }

  const toggleCategory = (id: number) =>
    setDraft((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id) ? prev.categoryIds.filter((c) => c !== id) : [...prev.categoryIds, id]
    }))

  const setRequired = (required: boolean) =>
    setDraft((prev) => ({
      ...prev,
      is_required: required,
      min_select: required ? Math.max(1, prev.min_select) : 0,
      max_select: required && prev.max_select !== null && prev.max_select < 1 ? 1 : prev.max_select
    }))

  const syncCategories = async (groupId: number) => {
    for (const category of categories) {
      const before = originalCategories.includes(category.id)
      const after = draft.categoryIds.includes(category.id)
      if (before === after) continue
      const rows = await window.api.modifiers.getCategoryAssignments(category.id)
      const kept = rows.filter((row) => row.group_id !== groupId).map((row, i) => ({ group_id: row.group_id, sort_order: i }))
      const entries = after ? [...kept, { group_id: groupId, sort_order: kept.length }] : kept
      await window.api.modifiers.setCategoryAssignments(category.id, entries)
    }
    setOriginalCategories(draft.categoryIds)
  }

  const save = async () => {
    if (saving) return
    setShowErrors(true)
    const problem = validateGroupDraft(draft)
    if (problem) return setError(t(`modifiers.errors.${problem}`))
    const badRecipe = draft.options.find((o) => o.kind !== 'no' && checkRecipeRows(o.ingredients, stockItems).some(isBlockingIssue))
    if (badRecipe) {
      setExpanded(badRecipe.key)
      return setError(t('modifiers.errors.optionIngredients', { option: badRecipe.name }))
    }
    setError('')
    setSaving(true)
    // Work on a copy that records new ids as they are created, so a retry never duplicates rows.
    const working: GroupDraft = { ...draft, options: [...draft.options] }
    try {
      const input = {
        name: working.name.trim(),
        name_ar: working.name_ar.trim() || null,
        name_fr: working.name_fr.trim() || null,
        is_required: working.is_required,
        min_select: working.is_required ? Math.max(1, working.min_select) : 0,
        max_select: working.max_select,
        allow_quantity: working.allow_quantity,
        is_active: working.is_active
      }
      const saved = working.id ? await window.api.modifiers.updateGroup(working.id, input) : await window.api.modifiers.createGroup(input)
      working.id = saved.id
      const keptIds = new Set(working.options.map((o) => o.id).filter((id): id is number => id !== null))
      for (const id of [...persistedIds.current]) {
        if (keptIds.has(id)) continue
        await window.api.modifiers.deleteOption(id)
        persistedIds.current = persistedIds.current.filter((known) => known !== id)
      }
      const originalOrder = [...persistedIds.current]
      for (let i = 0; i < working.options.length; i++) {
        const option = working.options[i]
        const originalIndex = option.id === null ? -1 : originalOrder.indexOf(option.id)
        if (option.id !== null && !optionChanged(option, i, originalIndex)) continue
        const payload = optionInput(option, i)
        const result = option.id === null
          ? await window.api.modifiers.createOption(saved.id, payload)
          : await window.api.modifiers.updateOption(option.id, payload)
        working.options[i] = { ...option, id: result.id }
        if (!persistedIds.current.includes(result.id)) persistedIds.current.push(result.id)
      }
      await syncCategories(saved.id)
      toast.success(t('modifiers.saved', { name: input.name }))
      await onSaved()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t('modifiers.errors.saveFailed')))
    } finally {
      setDraft((prev) => ({ ...prev, id: working.id, options: prev.options.map((o, i) => ({ ...o, id: working.options[i]?.key === o.key ? working.options[i].id : o.id })) }))
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft.id) return onClose()
    setSaving(true)
    try {
      await window.api.modifiers.deleteGroup(draft.id)
      toast.success(t('modifiers.deleted', { name: draft.name }))
      await onSaved()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t('modifiers.errors.saveFailed')))
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  const rule = ruleText({ is_required: draft.is_required, min_select: draft.min_select, max_select: draft.max_select })
  const footer = confirmDelete ? (
    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
      <p className="me-auto text-sm font-semibold text-danger-ink">{t('modifiers.confirmDelete', { name: draft.name })}</p>
      <Button variant="secondary" size="lg" onClick={() => setConfirmDelete(false)} disabled={saving}>{t('common.cancel')}</Button>
      <Button variant="danger" size="lg" onClick={remove} loading={saving}>{t('common.delete')}</Button>
    </div>
  ) : (
    <>
      {draft.id && (
        <Button variant="ghost" size="lg" className="me-auto text-danger-ink" icon={<Trash2 className="h-5 w-5" />} onClick={() => setConfirmDelete(true)}>
          {t('modifiers.deleteGroup')}
        </Button>
      )}
      <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
      <Button size="lg" onClick={save} loading={saving} disabled={!draft.name.trim()}>{t('common.save')}</Button>
    </>
  )

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={false}
      size="2xl"
      title={group ? t('modifiers.editTitle') : t('modifiers.newTitle')}
      footer={footer}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="space-y-6 min-w-0">
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label={t('menu.name')} placeholder={t('modifiers.namePlaceholder')} error={showErrors && !draft.name.trim() ? t('modifiers.errors.groupName') : undefined} {...kb.bind(draft.name, (v) => patch({ name: v }))} />
              <Input label={t('menu.nameAr')} dir="rtl" {...kb.bind(draft.name_ar, (v) => patch({ name_ar: v }), 'text', true)} />
              <Input label={t('menu.nameFr')} {...kb.bind(draft.name_fr, (v) => patch({ name_fr: v }))} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface-2/50 p-4 space-y-4">
            <SectionLabel action={<Badge variant={draft.is_required ? 'warning' : 'neutral'}>{t(rule.key, rule.params)}</Badge>}>{t('modifiers.rules')}</SectionLabel>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <SegmentedControl<'optional' | 'required'>
                size="lg"
                value={draft.is_required ? 'required' : 'optional'}
                onChange={(v) => setRequired(v === 'required')}
                options={[
                  { value: 'optional', label: t('modifiers.optional') },
                  { value: 'required', label: t('modifiers.required') }
                ]}
              />
              {draft.is_required && (
                <Stepper
                  label={t('modifiers.minLabel')}
                  value={Math.max(1, draft.min_select)}
                  min={1}
                  max={draft.max_select ?? 50}
                  onChange={(v) => patch({ min_select: v })}
                />
              )}
              {draft.max_select !== null && (
                <Stepper
                  label={t('modifiers.maxLabel')}
                  value={draft.max_select}
                  min={Math.max(1, draft.is_required ? draft.min_select : 1)}
                  max={50}
                  onChange={(v) => patch({ max_select: v })}
                />
              )}
              <div className="w-44">
                <Toggle
                  size="md"
                  checked={draft.max_select === null}
                  onChange={(noLimit) => patch({ max_select: noLimit ? null : Math.max(1, draft.is_required ? draft.min_select : 1) })}
                  label={t('modifiers.noLimit')}
                />
              </div>
            </div>
            {draft.is_required && !draft.options.some((o) => o.is_default && o.is_active) && (
              <InlineNotice tone="warning">{t('modifiers.noDefaultWarning')}</InlineNotice>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-line pt-1">
              <Toggle checked={draft.allow_quantity} onChange={(v) => patch({ allow_quantity: v })} label={t('modifiers.allowQuantity')} />
              <Toggle checked={draft.is_active} onChange={(v) => patch({ is_active: v })} label={t('modifiers.active')} />
            </div>
          </section>

          <section>
            <SectionLabel
              action={<Button variant="soft" icon={<Plus className="h-4 w-4" />} onClick={addOption}>{t('modifiers.addOption')}</Button>}
            >
              {t('modifiers.options')} <span className="num text-muted font-semibold">({draft.options.length})</span>
            </SectionLabel>
            <div className="space-y-2">
              {draft.options.map((option, index) => (
                <ModifierOptionEditor
                  key={option.key}
                  option={option}
                  index={index}
                  count={draft.options.length}
                  expanded={expanded === option.key}
                  onToggle={() => setExpanded(expanded === option.key ? null : option.key)}
                  onChange={(next) => patchOption(option.key, next)}
                  onMove={(delta) => setDraft((prev) => ({ ...prev, options: moveItem(prev.options, index, delta) }))}
                  onRemove={() => setDraft((prev) => ({ ...prev, options: prev.options.filter((o) => o.key !== option.key) }))}
                  stockItems={stockItems}
                  showErrors={showErrors}
                />
              ))}
              {draft.options.length === 0 && <InlineNotice tone="warning">{t('modifiers.errors.noOptions')}</InlineNotice>}
            </div>
          </section>

          <section>
            <SectionLabel>{t('modifiers.showOn')}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const on = draft.categoryIds.includes(category.id)
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCategory(category.id)}
                    className={cn(
                      'tap relative min-h-12 ps-4 pe-4 rounded-xl border flex items-center gap-2 font-semibold text-sm',
                      on ? 'bg-primary-soft border-primary text-primary-ink' : 'bg-surface border-line-strong text-ink-2 hover:bg-surface-2 dark:bg-surface-2'
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(category.id) }} />
                    {category.icon && <span className="text-lg">{category.icon}</span>}
                    {getName(category)}
                  </button>
                )
              })}
              {categories.length === 0 && <p className="text-sm text-muted">{t('menu.categories.empty')}</p>}
            </div>
          </section>

          {error && <InlineNotice>{error}</InlineNotice>}
        </div>

        <aside className="lg:sticky lg:top-0 self-start space-y-2">
          <p className="text-sm font-semibold text-ink-2">{t('modifiers.preview.heading')}</p>
          <ModifierSheetPreview groups={[draftToResolved(draft)].filter((g) => g.options.length > 0)} />
        </aside>
      </div>
      {kb.keyboard}
    </Modal>
  )
}
