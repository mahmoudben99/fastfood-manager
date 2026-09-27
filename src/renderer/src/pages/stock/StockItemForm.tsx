import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Button, Input, Modal, SegmentedControl, toast } from '../../components/ui'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { CurrencyTag, InlineNotice, parseAmount, useTouchKeyboard } from '../menu/catalogShared'
import { UNIT_LABELS, type StockItem } from './stockShared'

interface StockItemFormProps {
  item: StockItem | null
  onClose: () => void
  onSaved: () => Promise<unknown>
}

type Unit = 'kg' | 'liter' | 'unit'

/** Add / edit a stock item. The unit is locked while menu recipes use the item (v3.2.1 guard). */
export function StockItemForm({ item, onClose, onSaved }: StockItemFormProps) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const [name, setName] = useState(item?.name ?? '')
  const [nameAr, setNameAr] = useState(item?.name_ar ?? '')
  const [nameFr, setNameFr] = useState(item?.name_fr ?? '')
  const [unit, setUnit] = useState<Unit>((item?.unit_type as Unit) ?? 'kg')
  const [price, setPrice] = useState(item ? String(item.price_per_unit) : '')
  const [threshold, setThreshold] = useState(item ? String(item.alert_threshold) : '5')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  /** Active menu items whose recipe uses the edited stock item (locks the unit). */
  const [usage, setUsage] = useState<{ menu_item_id: number; menu_item_name: string }[]>([])

  useEffect(() => {
    if (!item) return
    window.api.stock.getRecipeUsage(item.id).then(setUsage).catch(() => setUsage([]))
  }, [item])

  const locked = !!item && usage.length > 0

  const save = async () => {
    if (saving) return
    const priceValue = parseAmount(price)
    const thresholdValue = threshold.trim() ? parseAmount(threshold) : 0
    if (!Number.isFinite(priceValue) || priceValue < 0) return setError(t('stock.invalidPrice'))
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0) return setError(t('stock.invalidThreshold'))
    setError('')
    setSaving(true)
    const data = {
      name: name.trim(),
      // null (not undefined) so a cleared translation is really removed.
      name_ar: nameAr.trim() || null,
      name_fr: nameFr.trim() || null,
      unit_type: unit,
      price_per_unit: priceValue,
      alert_threshold: thresholdValue
    }
    try {
      if (item) await window.api.stock.update(item.id, data)
      else await window.api.stock.create(data)
      toast.success(t('stock.saved', { name: data.name }))
      await onSaved()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t('stock.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={false}
      size="lg"
      title={item ? t('stock.editItem') : t('stock.addItem')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={save} loading={saving} disabled={!name.trim() || !price.trim()}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label={t('stock.name')} {...kb.bind(name, setName)} />
          <Input label={t('menu.nameAr')} dir="rtl" {...kb.bind(nameAr, setNameAr, 'text', true)} />
          <Input label={t('menu.nameFr')} {...kb.bind(nameFr, setNameFr)} />
        </div>

        <div>
          <p className="text-sm font-medium text-ink-2 mb-1.5 flex items-center gap-1.5">
            {t('stock.unitType')}
            {locked && <Lock className="h-3.5 w-3.5 text-muted" />}
          </p>
          <div className={locked ? 'pointer-events-none opacity-60' : undefined} aria-disabled={locked || undefined}>
            <SegmentedControl<Unit>
              fullWidth
              size="lg"
              value={unit}
              onChange={setUnit}
              options={(['kg', 'liter', 'unit'] as Unit[]).map((u) => ({ value: u, label: t(`stock.units.${u}`) }))}
            />
          </div>
          {locked && (
            <p className="mt-2 text-xs text-muted">
              {t('stock.unitLocked', {
                items: usage.slice(0, 8).map((u) => u.menu_item_name).join(', ') + (usage.length > 8 ? ` (+${usage.length - 8})` : '')
              })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={t('stock.pricePerUnitOf', { unit: UNIT_LABELS[unit] })}
            inputMode="decimal"
            className="num"
            trailing={<CurrencyTag />}
            {...kb.bind(price, setPrice, 'numeric')}
          />
          <Input
            label={t('stock.alertThreshold')}
            inputMode="decimal"
            className="num"
            title={t('stock.alertHint')}
            trailing={<span className="px-2 text-sm font-semibold text-muted">{UNIT_LABELS[unit]}</span>}
            {...kb.bind(threshold, setThreshold, 'numeric')}
          />
        </div>
        {error && <InlineNotice>{error}</InlineNotice>}
      </div>
      {kb.keyboard}
    </Modal>
  )
}
