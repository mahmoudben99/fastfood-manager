import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CookingPot, FileText, PackageOpen, SlidersHorizontal, Store } from 'lucide-react'
import type { ModifierGroup } from '../../../../shared/catalog-types'
import { Button, Modal, Tabs, toast } from '../../components/ui'
import { AvailabilityEditor, ChannelPricesEditor } from '../../components/catalog-ext'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { InlineNotice, parseAmount, useFoodName } from './catalogShared'
import { ComboBuilder } from './ComboBuilder'
import { comboToDrafts, slotsToInput, validateSlots, type SlotDraft } from './comboLogic'
import { ItemDetailsTab, type DetailField } from './ItemDetailsTab'
import { ItemOptionsTab } from './ItemOptionsTab'
import type { CategoryRow, MenuRow, StockRow } from './menuTypes'
import type { ItemAssignment } from './modifierLogic'
import { RecipeEditor } from './RecipeEditor'
import { presetSizeRows, type SizeRow } from './SizeRows'
import { checkRecipeRows, isBlockingIssue, parseQuantity, recipeFingerprint, scaleRecipe, type RecipeRow } from './recipeUnits'

export const toRecipeRows = (ingredients: any[] | undefined): RecipeRow[] =>
  (ingredients || []).map((i: any) => ({ stock_item_id: i.stock_item_id, quantity: String(i.quantity), unit: i.unit }))

export type FormTab = 'details' | 'recipe' | 'options' | 'channels' | 'combo'

interface MenuItemFormProps {
  /** Full item from menu.getById (with ingredients) when editing; null to create. */
  item: MenuRow | null
  /** New item that starts as a combo (Combos tab → "New combo"). */
  startAsCombo?: boolean
  initialTab?: FormTab
  /** Highlight recipe problems immediately (e.g. right after a restore). */
  validateOnOpen: boolean
  categories: CategoryRow[]
  stockItems: StockRow[]
  /** Active menu items (combo choices). */
  items: MenuRow[]
  library: ModifierGroup[]
  onClose: () => void
  /** Called after anything was written, so the page can reload. */
  onSaved: () => Promise<unknown>
}

const assignmentKey = (rows: ItemAssignment[]) =>
  JSON.stringify([...rows].sort((a, b) => a.group_id - b.group_id).map((r) => [r.group_id, r.sort_order, r.excluded]))

export function MenuItemForm(props: MenuItemFormProps) {
  const { item, categories, stockItems, onClose, onSaved } = props
  const { t } = useTranslation()
  const getName = useFoodName()
  const initialRows = useMemo(() => toRecipeRows(item?.ingredients), [item])
  const [savedId, setSavedId] = useState<number | null>(item?.id ?? null)
  const [tab, setTab] = useState<FormTab>(props.initialTab ?? 'details')
  const [fields, setFields] = useState<Record<DetailField, string>>({
    name: item?.name ?? '',
    name_ar: item?.name_ar ?? '',
    name_fr: item?.name_fr ?? '',
    price: item ? String(item.price) : ''
  })
  const [category, setCategory] = useState(item ? String(item.category_id) : String(categories[0]?.id ?? ''))
  const [imagePath, setImagePath] = useState(item?.image_path ?? '')
  const [emoji, setEmoji] = useState(item?.emoji ?? '')
  const [rows, setRows] = useState<RecipeRow[]>(initialRows)
  const [originalRecipe] = useState(recipeFingerprint(initialRows))
  const [deletedStockNames] = useState<Record<number, string>>(() =>
    Object.fromEntries((item?.ingredients || []).map((i) => [i.stock_item_id, i.stock_item_name || `#${i.stock_item_id}`]))
  )
  const [multiSize, setMultiSize] = useState(false)
  const [sizes, setSizes] = useState<SizeRow[]>([])
  const wasComboInitially = item?.is_combo === 1
  const [wasCombo, setWasCombo] = useState(wasComboInitially)
  const [isCombo, setIsCombo] = useState(wasComboInitially || !!props.startAsCombo)
  const [slots, setSlots] = useState<SlotDraft[]>([])
  const [savedSlots, setSavedSlots] = useState('[]')
  const [assignments, setAssignments] = useState<ItemAssignment[]>([])
  const [savedAssignments, setSavedAssignments] = useState(assignmentKey([]))
  const [loading, setLoading] = useState(!!item)
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(props.validateOnOpen)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!item) return
    let alive = true
    Promise.all([window.api.modifiers.getItemAssignments(item.id), item.is_combo === 1 ? window.api.combos.get(item.id) : Promise.resolve(null)])
      .then(([rowsFromDb, combo]) => {
        if (!alive) return
        setAssignments(rowsFromDb)
        setSavedAssignments(assignmentKey(rowsFromDb))
        const drafts = comboToDrafts(combo)
        setSlots(drafts)
        setSavedSlots(JSON.stringify(slotsToInput(drafts)))
      })
      .catch((err) => alive && setError(ipcErrorMessage(err, t('menu.loadFailed'))))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [item, t])

  const setField = (field: DetailField, value: string) => setFields((prev) => ({ ...prev, [field]: value }))
  const recipeIssues = checkRecipeRows(rows, stockItems)
  const recipeDirty = !item || recipeFingerprint(rows) !== originalRecipe
  const sizesMode = multiSize && !item
  const price = parseAmount(fields.price)
  const categoryRow = categories.find((c) => String(c.id) === category)

  const close = () => {
    if (!saving) onClose()
  }

  const baseData = () => ({
    name: fields.name.trim(),
    // null (not undefined) so a cleared translation, photo or emoji is really removed.
    name_ar: fields.name_ar.trim() || null,
    name_fr: fields.name_fr.trim() || null,
    category_id: Number(category),
    image_path: imagePath || null,
    emoji: emoji.trim() || null
  })

  /** Multi-size create: one item per size. Returns the ids created (partial on failure). */
  const createSizes = async (): Promise<number[] | null> => {
    const filled = sizes.filter((s) => s.label.trim() && s.price.trim())
    for (const size of filled) {
      const multiplier = parseQuantity(size.multiplier || '1')
      const problem = !(parseAmount(size.price) >= 0)
        ? t('menu.sizes.invalidPrice', { size: size.label })
        : !Number.isFinite(multiplier) || multiplier <= 0
          ? t('menu.sizes.invalidMultiplier', { size: size.label })
          : ''
      if (problem) {
        setError(problem)
        return null
      }
    }
    const base = baseData()
    const created: SizeRow[] = []
    const ids: number[] = []
    for (const size of filled) {
      const label = size.label.trim()
      try {
        const row = await window.api.menu.create({
          ...base,
          name: `${base.name} ${label}`,
          name_ar: base.name_ar ? `${base.name_ar} ${label}` : null,
          name_fr: base.name_fr ? `${base.name_fr} ${label}` : null,
          price: parseAmount(size.price),
          ingredients: scaleRecipe(rows, parseQuantity(size.multiplier || '1'))
        })
        created.push(size)
        ids.push(row.id)
      } catch (err) {
        const reason = ipcErrorMessage(err, t('menu.saveFailed'))
        // Drop the sizes that were saved so pressing Save again cannot create duplicates.
        setSizes((prev) => prev.filter((s) => !created.includes(s)))
        setError(created.length ? t('menu.sizes.partialFailure', { created: created.map((s) => s.label).join(', '), size: label, error: reason }) : reason)
        if (created.length) await onSaved()
        return null
      }
    }
    return ids
  }

  const handleSave = async () => {
    if (saving || loading) return
    setError('')
    setShowErrors(true)
    const fail = (where: FormTab, message: string) => {
      setTab(where)
      setError(message)
    }
    if (!fields.name.trim() || !category) return fail('details', t('menu.form.nameRequired'))
    if (!sizesMode && !(price >= 0)) return fail('details', t('menu.invalidPrice'))
    if (recipeDirty && recipeIssues.some(isBlockingIssue)) return fail('recipe', t('menu.recipe.fixErrors'))
    if (isCombo && !sizesMode) {
      const problem = validateSlots(slots)
      if (problem) return fail('combo', t(`combos.errors.${problem.key}`, problem.params))
    }

    setSaving(true)
    try {
      let ids: number[]
      if (sizesMode) {
        const created = await createSizes()
        if (!created) return
        ids = created
      } else {
        const data: Record<string, unknown> = { ...baseData(), price }
        // Only send the recipe when it changed: a price edit must not re-validate an old recipe.
        if (recipeDirty) data.ingredients = scaleRecipe(rows, 1)
        const row = savedId ? await window.api.menu.update(savedId, data) : await window.api.menu.create(data)
        setSavedId(row.id)
        ids = [row.id]
      }
      if (assignmentKey(assignments) !== savedAssignments || (sizesMode && assignments.length)) {
        const entries = assignments.map((r) => ({ group_id: r.group_id, sort_order: r.sort_order, excluded: r.excluded }))
        for (const id of ids) await window.api.modifiers.setItemAssignments(id, entries)
        setSavedAssignments(assignmentKey(assignments))
      }
      const comboInput = JSON.stringify(slotsToInput(slots))
      if (isCombo && !sizesMode && (!wasCombo || comboInput !== savedSlots)) {
        const saved = await window.api.combos.save(ids[0], slotsToInput(slots))
        setSlots(comboToDrafts(saved))
        setSavedSlots(JSON.stringify(slotsToInput(comboToDrafts(saved))))
        setWasCombo(true)
      } else if (!isCombo && wasCombo) {
        await window.api.combos.remove(ids[0])
        setWasCombo(false)
      }
      toast.success(t('menu.form.saved', { name: fields.name.trim() }))
      await onSaved()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t('menu.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadImage = async () => {
    try {
      const path = await window.api.menu.uploadImage()
      if (path) setImagePath(path)
    } catch (err) {
      setError(ipcErrorMessage(err, t('menu.saveFailed')))
    }
  }

  const tabs = [
    { id: 'details' as const, label: t('menu.form.tabs.details'), icon: <FileText /> },
    { id: 'recipe' as const, label: t('menu.form.tabs.recipe'), icon: <CookingPot />, count: rows.length },
    { id: 'options' as const, label: t('menu.form.tabs.options'), icon: <SlidersHorizontal /> },
    { id: 'channels' as const, label: t('menu.form.tabs.channels'), icon: <Store /> },
    ...(isCombo && !sizesMode ? [{ id: 'combo' as const, label: t('menu.form.tabs.combo'), icon: <PackageOpen />, count: slots.length }] : [])
  ]
  const shownTab = tabs.some((x) => x.id === tab) ? tab : 'details'
  const previewItem = { name: fields.name || t('menu.form.untitled'), name_ar: fields.name_ar, name_fr: fields.name_fr, price: price >= 0 ? price : 0, emoji: emoji || categoryRow?.icon }
  const canSave = !!fields.name.trim() && !!category && (sizesMode ? sizes.some((s) => s.label && s.price) : !!fields.price.trim())

  return (
    <Modal
      isOpen
      onClose={close}
      closeOnBackdrop={false}
      size="2xl"
      title={item ? t('menu.editItem') : isCombo ? t('combos.newCombo') : t('menu.addItem')}
      description={item ? getName(item) : undefined}
      footer={
        <>
          {error && <p className="me-auto max-w-xl text-sm font-semibold text-danger-ink" role="alert">{error}</p>}
          <Button variant="secondary" size="lg" onClick={close} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={handleSave} loading={saving} disabled={!canSave || loading} cooldownMs={600}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Tabs tabs={tabs} value={shownTab} onChange={setTab} className="-mt-2 mb-5" />
      <div className="min-h-[26rem]">
      {shownTab === 'details' && (
        <ItemDetailsTab
          isNew={!item}
          fields={fields}
          setField={setField}
          category={category}
          setCategory={setCategory}
          categories={categories}
          emoji={emoji}
          setEmoji={setEmoji}
          imagePath={imagePath}
          setImagePath={setImagePath}
          onUploadImage={handleUploadImage}
          multiSize={multiSize}
          setMultiSize={(v) => {
            setMultiSize(v)
            if (v && sizes.length === 0) setSizes(presetSizeRows())
          }}
          sizes={sizes}
          setSizes={setSizes}
          hasRecipe={rows.length > 0}
          isCombo={isCombo}
          setIsCombo={setIsCombo}
          wasCombo={wasCombo}
          showErrors={showErrors}
        />
      )}
      {shownTab === 'recipe' && (
        <div className="space-y-3">
          {isCombo && <InlineNotice tone="info">{t('menu.form.comboRecipeHint')}</InlineNotice>}
          <RecipeEditor
            rows={rows}
            onChange={setRows}
            stockItems={stockItems}
            issues={recipeIssues}
            showErrors={showErrors && recipeDirty}
            getName={getName}
            deletedStockNames={deletedStockNames}
          />
        </div>
      )}
      {shownTab === 'options' && (
        <ItemOptionsTab library={props.library} category={categoryRow} rows={assignments} onChange={setAssignments} preview={previewItem} />
      )}
      {shownTab === 'channels' && (
        <div className="space-y-6">
          <ChannelPricesEditor menuItemId={savedId} basePrice={price >= 0 ? price : 0} />
          <AvailabilityEditor target={{ kind: 'menu_item', id: savedId }} />
        </div>
      )}
      {shownTab === 'combo' && (
        <ComboBuilder
          comboId={savedId}
          comboPrice={price >= 0 ? price : 0}
          slots={slots}
          onChange={setSlots}
          items={props.items}
          categories={categories}
          showErrors={showErrors}
        />
      )}
      </div>
    </Modal>
  )
}
