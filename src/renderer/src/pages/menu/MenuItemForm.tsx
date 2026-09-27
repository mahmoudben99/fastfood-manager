import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { RecipeEditor } from './RecipeEditor'
import { SizeRows, presetSizeRows, type SizeRow } from './SizeRows'
import {
  checkRecipeRows,
  isBlockingIssue,
  parseQuantity,
  recipeFingerprint,
  scaleRecipe,
  type RecipeRow
} from './recipeUnits'

export const toRecipeRows = (ingredients: any[] | undefined): RecipeRow[] =>
  (ingredients || []).map((i: any) => ({ stock_item_id: i.stock_item_id, quantity: String(i.quantity), unit: i.unit }))

type Field = 'formName' | 'formNameAr' | 'formNameFr' | 'formPrice'

interface MenuItemFormProps {
  /** Full item from menu.getById (with ingredients) when editing; null to create. */
  item: any | null
  /** Highlight recipe problems immediately (e.g. right after a restore). */
  validateOnOpen: boolean
  categories: any[]
  stockItems: any[]
  getName: (item: any) => string
  isTouch: boolean
  onClose: () => void
  /** Called after anything was written, so the page can reload. */
  onSaved: () => Promise<unknown>
}

export function MenuItemForm({ item, validateOnOpen, categories, stockItems, getName, isTouch, onClose, onSaved }: MenuItemFormProps) {
  const { t } = useTranslation()
  const initialRows = toRecipeRows(item?.ingredients)
  const [fields, setFields] = useState<Record<Field, string>>({
    formName: item?.name ?? '',
    formNameAr: item?.name_ar ?? '',
    formNameFr: item?.name_fr ?? '',
    formPrice: item ? String(item.price) : ''
  })
  const [formCategory, setFormCategory] = useState(item ? String(item.category_id) : categories[0]?.id?.toString() || '')
  const [formImagePath, setFormImagePath] = useState<string>(item?.image_path || '')
  const [formEmoji, setFormEmoji] = useState<string>(item?.emoji || '')
  const [rows, setRows] = useState<RecipeRow[]>(initialRows)
  const [originalRecipe] = useState(recipeFingerprint(initialRows))
  const [deletedStockNames] = useState<Record<number, string>>(() =>
    Object.fromEntries((item?.ingredients || []).map((i: any) => [i.stock_item_id, i.stock_item_name || `#${i.stock_item_id}`]))
  )
  const [formError, setFormError] = useState('')
  const [showValidation, setShowValidation] = useState(validateOnOpen)
  const [saving, setSaving] = useState(false)
  const [multiSize, setMultiSize] = useState(false)
  const [formSizes, setFormSizes] = useState<SizeRow[]>([])
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: Field; type: 'numeric' | 'text' } | null>(null)

  const setField = (field: Field, value: string) => setFields((prev) => ({ ...prev, [field]: value }))
  const recipeIssues = checkRecipeRows(rows, stockItems)
  const recipeDirty = !item || recipeFingerprint(rows) !== originalRecipe

  const close = () => {
    if (saving) return
    setKeyboardTarget(null)
    onClose()
  }

  const baseData = () => ({
    name: fields.formName.trim(),
    // null (not undefined) so a cleared translation or emoji is really removed.
    name_ar: fields.formNameAr.trim() || null,
    name_fr: fields.formNameFr.trim() || null,
    category_id: Number(formCategory),
    image_path: formImagePath || null,
    emoji: formEmoji.trim() || null
  })

  const createSizes = async (): Promise<boolean> => {
    const sizes = formSizes.filter((s) => s.label.trim() && s.price.trim())
    for (const size of sizes) {
      const price = Number(size.price)
      const multiplier = parseQuantity(size.multiplier || '1')
      if (!Number.isFinite(price) || price < 0) {
        setFormError(t('menu.sizes.invalidPrice', { size: size.label }))
        return false
      }
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        setFormError(t('menu.sizes.invalidMultiplier', { size: size.label }))
        return false
      }
    }
    const base = baseData()
    const created: SizeRow[] = []
    for (const size of sizes) {
      const label = size.label.trim()
      try {
        await window.api.menu.create({
          ...base,
          name: `${base.name} ${label}`,
          name_ar: base.name_ar ? `${base.name_ar} ${label}` : null,
          name_fr: base.name_fr ? `${base.name_fr} ${label}` : null,
          price: Number(size.price),
          ingredients: scaleRecipe(rows, parseQuantity(size.multiplier || '1'))
        })
        created.push(size)
      } catch (err) {
        const reason = ipcErrorMessage(err, t('menu.saveFailed'))
        // Drop the sizes that were saved so pressing Save again cannot create duplicates.
        setFormSizes((prev) => prev.filter((s) => !created.includes(s)))
        setFormError(
          created.length
            ? t('menu.sizes.partialFailure', { created: created.map((s) => s.label).join(', '), size: label, error: reason })
            : reason
        )
        if (created.length) await onSaved()
        return false
      }
    }
    return true
  }

  const handleSave = async () => {
    if (saving) return
    setFormError('')
    if (recipeDirty && recipeIssues.some(isBlockingIssue)) {
      setShowValidation(true)
      setFormError(t('menu.recipe.fixErrors'))
      return
    }
    const sizesMode = multiSize && !item
    const price = Number(fields.formPrice)
    if (!sizesMode && (!Number.isFinite(price) || price < 0)) {
      setFormError(t('menu.invalidPrice'))
      return
    }

    setSaving(true)
    try {
      if (sizesMode) {
        if (!(await createSizes())) return
      } else {
        const data: Record<string, unknown> = { ...baseData(), price }
        // Only send the recipe when it changed: a price edit must not re-validate an old recipe.
        if (recipeDirty) data.ingredients = scaleRecipe(rows, 1)
        if (item) await window.api.menu.update(item.id, data)
        else await window.api.menu.create(data)
      }
      await onSaved()
      setKeyboardTarget(null)
      onClose()
    } catch (err) {
      setFormError(ipcErrorMessage(err, t('menu.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadImage = async () => {
    try {
      const path = await window.api.menu.uploadImage()
      if (path) setFormImagePath(path)
    } catch (err) {
      setFormError(ipcErrorMessage(err, t('menu.saveFailed')))
    }
  }

  const textField = (field: Field, label: string, type: 'text' | 'numeric' = 'text', extra: Record<string, unknown> = {}) => (
    <Input
      label={label}
      value={fields[field]}
      readOnly={isTouch}
      onClick={isTouch ? () => setKeyboardTarget({ field, type }) : undefined}
      onChange={isTouch ? undefined : (e) => setField(field, e.target.value)}
      {...extra}
    />
  )

  const canSave =
    !!fields.formName.trim() &&
    !!formCategory &&
    (multiSize && !item ? formSizes.some((s) => s.label && s.price) : !!fields.formPrice)

  return (
    <>
      <Modal isOpen onClose={close} title={item ? t('menu.editItem') : t('menu.addItem')} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {textField('formName', t('menu.name'))}
            {textField('formNameAr', t('menu.nameAr'), 'text', { dir: 'rtl' })}
            {textField('formNameFr', t('menu.nameFr'))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!multiSize &&
              textField('formPrice', t('menu.price'), 'numeric', {
                type: isTouch ? 'text' : 'number',
                inputMode: 'numeric',
                step: '0.01',
                min: '0'
              })}
            <Select
              label={t('menu.category')}
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              options={categories.map((c: any) => ({ value: String(c.id), label: `${c.icon ? c.icon + ' ' : ''}${getName(c)}` }))}
            />
          </div>

          {/* Multi-size toggle (only for new items) */}
          {!item && (
            <button
              type="button"
              onClick={() => {
                const next = !multiSize
                setMultiSize(next)
                if (next && formSizes.length === 0) setFormSizes(presetSizeRows())
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                multiSize
                  ? 'bg-orange-100 text-orange-700 border-2 border-orange-400'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <Layers className="h-4 w-4" />
              {t('menu.sizes.toggle')}
            </button>
          )}

          {multiSize && !item && <SizeRows sizes={formSizes} onChange={setFormSizes} hasRecipe={rows.length > 0} />}

          {/* Emoji */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('menu.emoji')}</label>
            <div className="flex items-center gap-2">
              <input
                value={formEmoji}
                onChange={(e) => setFormEmoji(e.target.value)}
                placeholder="🍔"
                className="w-16 h-10 border rounded-lg text-center text-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                maxLength={8}
              />
              <span className="text-xs text-gray-400">{t('menu.emojiHint')}</span>
            </div>
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('menu.image')}</label>
            <div className="flex items-center gap-3">
              {formImagePath && <img src={`app-image://${formImagePath}`} className="w-16 h-16 rounded-lg object-cover" />}
              <Button variant="secondary" size="sm" onClick={handleUploadImage}>
                {t('menu.uploadImage')}
              </Button>
            </div>
          </div>

          <RecipeEditor
            rows={rows}
            onChange={setRows}
            stockItems={stockItems}
            issues={recipeIssues}
            showErrors={showValidation && recipeDirty}
            getName={getName}
            deletedStockNames={deletedStockNames}
          />

          {formError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{formError}</p>
          )}

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={close} disabled={saving} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!canSave} className="flex-1">
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type={keyboardTarget.type}
          value={fields[keyboardTarget.field]}
          onChange={(value) => setField(keyboardTarget.field, value)}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </>
  )
}
