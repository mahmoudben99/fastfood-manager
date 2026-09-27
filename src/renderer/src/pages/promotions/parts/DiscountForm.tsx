import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search } from 'lucide-react'
import { Button, Input, Modal, Money, SegmentedControl, cn, toast } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { errorText, localName, type MenuItemLite, type Promo } from './promoTypes'

interface DiscountFormProps {
  /** null = new discount. Remount (key) per opening for fresh state. */
  promo: Promo | null
  menuItems: MenuItemLite[]
  onClose: () => void
  onSaved: () => void
}

export function DiscountForm({ promo, menuItems, onClose, onSaved }: DiscountFormProps) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const currencySymbol = useAppStore((s) => s.currencySymbol)
  const [name, setName] = useState(promo?.name ?? '')
  const [nameAr, setNameAr] = useState(promo?.name_ar || '')
  const [nameFr, setNameFr] = useState(promo?.name_fr || '')
  const [type, setType] = useState<'percentage' | 'fixed'>(promo?.type ?? 'percentage')
  const [value, setValue] = useState(promo ? String(promo.discount_value) : '')
  const [appliesTo, setAppliesTo] = useState<'all' | 'specific'>(promo?.applies_to ?? 'all')
  const [itemIds, setItemIds] = useState<number[]>(promo?.menu_item_ids || [])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return menuItems
    return menuItems.filter((item) =>
      [item.name, item.name_ar, item.name_fr].some((n) => n?.toLowerCase().includes(q))
    )
  }, [menuItems, query])

  const toggleItem = (itemId: number) =>
    setItemIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]))

  const save = async () => {
    setSaving(true)
    const input = {
      name,
      name_ar: nameAr || undefined,
      name_fr: nameFr || undefined,
      type,
      discount_value: Number(value),
      applies_to: appliesTo,
      menu_item_ids: appliesTo === 'specific' ? itemIds : undefined
    }
    try {
      if (promo) await window.api.promotions.update(promo.id, input)
      else await window.api.promotions.create(input)
      toast.success(t('promotions.toast.discountSaved'))
      onSaved()
    } catch (error) {
      toast.error(t('promotions.toast.failed', { message: errorText(error) }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      size="lg"
      title={promo ? t('promotions.editDiscount') : t('promotions.newDiscount')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={save} loading={saving} disabled={!name || !value}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={t('promotions.name')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={t('promotions.nameAr')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            <Input label={t('promotions.nameFr')} value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-2">{t('promotions.discountType')}</p>
            <SegmentedControl
              fullWidth
              value={type}
              onChange={setType}
              ariaLabel={t('promotions.discountType')}
              options={[
                { value: 'percentage', label: t('promotions.percentage') },
                { value: 'fixed', label: t('promotions.fixedAmount') }
              ]}
            />
          </div>
          <Input
            label={type === 'percentage' ? t('promotions.discountPercent') : t('promotions.discountAmount')}
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            step="0.01"
            min="0"
            max={type === 'percentage' ? '100' : undefined}
            trailing={<span className="pe-2 text-sm font-semibold">{type === 'percentage' ? '%' : currencySymbol}</span>}
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">{t('promotions.appliesTo')}</p>
          <SegmentedControl
            fullWidth
            value={appliesTo}
            onChange={setAppliesTo}
            ariaLabel={t('promotions.appliesTo')}
            options={[
              { value: 'all', label: t('promotions.allMenuItems') },
              { value: 'specific', label: t('promotions.specificItemsOnly') }
            ]}
          />
        </div>

        {appliesTo === 'specific' && (
          <div className="rounded-2xl border border-line bg-surface-2 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{t('promotions.selectItems')}</p>
              <span className="num text-xs font-semibold text-primary-ink">
                {t('promotions.selectedCount', { count: itemIds.length })}
              </span>
            </div>
            <Input leading={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('promotions.searchItems')} />
            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
              {visibleItems.map((item) => {
                const checked = itemIds.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      'tap flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start',
                      checked ? 'bg-primary-soft text-primary-ink' : 'bg-surface text-ink hover:bg-surface-3'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                        checked ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface'
                      )}
                    >
                      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium"><bdi>{localName(item, foodLanguage)}</bdi></span>
                    <span className="shrink-0 text-xs text-muted"><Money value={item.price} /></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
