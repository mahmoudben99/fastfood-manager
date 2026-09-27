import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton, Input, Modal, Money, Select, controlClass, formatAmount, toast } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { errorText, localName, packIndividualTotal, type MenuItemLite, type Pack } from './promoTypes'

interface PackFormProps {
  /** null = new pack. Remount (key) per opening for fresh state. */
  pack: Pack | null
  menuItems: MenuItemLite[]
  onClose: () => void
  onSaved: () => void
}

type Line = { menu_item_id: number; quantity: number }

export function PackForm({ pack, menuItems, onClose, onSaved }: PackFormProps) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const currencySymbol = useAppStore((s) => s.currencySymbol)
  const [name, setName] = useState(pack?.name ?? '')
  const [nameAr, setNameAr] = useState(pack?.name_ar || '')
  const [nameFr, setNameFr] = useState(pack?.name_fr || '')
  const [price, setPrice] = useState(pack ? String(pack.pack_price) : '')
  const [emoji, setEmoji] = useState(pack?.emoji || '')
  const [lines, setLines] = useState<Line[]>(
    pack?.items?.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })) || []
  )
  const [saving, setSaving] = useState(false)

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const save = async () => {
    setSaving(true)
    const input = {
      name,
      name_ar: nameAr || undefined,
      name_fr: nameFr || undefined,
      pack_price: Number(price),
      emoji: emoji || undefined,
      items: lines.filter((i) => i.menu_item_id > 0)
    }
    try {
      if (pack) await window.api.packs.update(pack.id, input)
      else await window.api.packs.create(input)
      toast.success(t('promotions.toast.packSaved'))
      onSaved()
    } catch (error) {
      toast.error(t('promotions.toast.failed', { message: errorText(error) }))
    } finally {
      setSaving(false)
    }
  }

  const separately = packIndividualTotal(lines, menuItems)
  const packPrice = Number(price) || 0
  const itemOptions = [
    { value: '0', label: t('promotions.selectItem') },
    ...menuItems.map((m) => ({ value: String(m.id), label: `${localName(m, foodLanguage)} — ${formatAmount(m.price)} ${currencySymbol}` }))
  ]

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      size="lg"
      title={pack ? t('promotions.editPack') : t('promotions.newPack')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={save} loading={saving} disabled={!name || !price || lines.length === 0}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={t('promotions.packName')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={t('promotions.nameAr')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            <Input label={t('promotions.nameFr')} value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Input
              label={t('promotions.packPrice')}
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              step="0.01"
            />
          </div>
          <div>
            <label htmlFor="pack-emoji" className="mb-1.5 block text-sm font-medium text-ink-2">{t('promotions.emoji')}</label>
            {/* width via wrapper: controlClass() carries w-full and cn() does not merge classes */}
            <div className="w-20">
              <input
                id="pack-emoji"
                data-ui="input"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🍔"
                maxLength={2}
                className={controlClass({ size: 'lg', className: 'text-center' })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{t('promotions.itemsInPack')}</p>
            <Button
              variant="soft"
              size="md"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setLines((prev) => [...prev, { menu_item_id: 0, quantity: 1 }])}
            >
              {t('promotions.addItem')}
            </Button>
          </div>
          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-muted">
              {t('promotions.noItemsInPack')}
            </p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl bg-surface p-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      aria-label={t('promotions.selectItem')}
                      value={String(line.menu_item_id)}
                      onChange={(e) => updateLine(i, { menu_item_id: Number(e.target.value) })}
                      options={itemOptions}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={<Minus />}
                      label={t('orderHistory.edit.decrease')}
                      variant="secondary"
                      disabled={line.quantity <= 1}
                      onClick={() => updateLine(i, { quantity: Math.max(1, line.quantity - 1) })}
                    />
                    <span className="num w-8 text-center font-bold text-ink">{line.quantity}</span>
                    <IconButton
                      icon={<Plus />}
                      label={t('orderHistory.edit.increase')}
                      variant="secondary"
                      onClick={() => updateLine(i, { quantity: line.quantity + 1 })}
                    />
                  </div>
                  <IconButton
                    icon={<Trash2 />}
                    label={t('common.remove')}
                    variant="danger"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && packPrice > 0 && (
            <dl className="mt-3 space-y-1 rounded-xl bg-surface p-3 text-sm">
              <div className="flex justify-between gap-3 text-muted">
                <dt>{t('promotions.separately')}</dt>
                <dd><Money value={separately} /></dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold text-ink">
                <dt>{t('promotions.packPrice')}</dt>
                <dd><Money value={packPrice} /></dd>
              </div>
              {separately > packPrice && (
                <div className="flex justify-between gap-3 font-bold text-success-ink">
                  <dt>{t('promotions.customerSaves')}</dt>
                  <dd><Money value={separately - packPrice} /></dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>
    </Modal>
  )
}
