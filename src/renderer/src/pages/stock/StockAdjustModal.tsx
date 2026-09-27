import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, SlidersHorizontal, Wrench } from 'lucide-react'
import { Button, Input, Modal, Money, toast } from '../../components/ui'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { CurrencyTag, InlineNotice, parseAmount, useFoodName, useTouchKeyboard } from '../menu/catalogShared'
import { UNIT_LABELS, formatQty, type AdjustKind, type StockItem } from './stockShared'

interface StockAdjustModalProps {
  item: StockItem
  kind: AdjustKind
  onClose: () => void
  onSaved: () => Promise<unknown>
}

const ICONS = { fix: Wrench, adjust: SlidersHorizontal, purchase: ShoppingBag }

/** Purchase (adds stock + cost), Adjust (waste/consumption) or Fix (wrong input, re-costs). */
export function StockAdjustModal({ item, kind, onClose, onSaved }: StockAdjustModalProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  // Stock goes negative when more is sold than was recorded. A correction cannot be negative,
  // so start from 0 and let the user type the real counted quantity.
  const [quantity, setQuantity] = useState(kind === 'purchase' ? '' : String(Math.max(0, item.quantity)))
  const [reason, setReason] = useState('')
  const [price, setPrice] = useState(String(item.price_per_unit))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const Icon = ICONS[kind]
  const unit = UNIT_LABELS[item.unit_type] || item.unit_type
  const qtyValue = parseAmount(quantity)
  const priceValue = parseAmount(price)

  const save = async () => {
    if (saving) return
    if (kind === 'purchase' ? !(qtyValue > 0) : !(qtyValue >= 0)) {
      return setError(kind === 'purchase' ? t('stock.invalidPurchaseQuantity') : t('stock.invalidQuantity'))
    }
    if (kind === 'purchase' && !(priceValue >= 0)) return setError(t('stock.invalidPrice'))
    setError('')
    setSaving(true)
    try {
      if (kind === 'fix') await window.api.stock.fix(item.id, qtyValue, reason)
      else if (kind === 'adjust') await window.api.stock.adjust(item.id, qtyValue, reason)
      else await window.api.stock.addPurchase(item.id, qtyValue, priceValue)
      toast.success(t(`stock.done.${kind}`, { name: getName(item) }))
      await onSaved()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t('stock.adjustFailed')))
    } finally {
      setSaving(false)
    }
  }

  const title = kind === 'fix' ? t('stock.fixTitle') : kind === 'adjust' ? t('stock.adjustTitle') : t('stock.purchaseTitle')
  const after = kind === 'purchase' ? item.quantity + (qtyValue > 0 ? qtyValue : 0) : qtyValue >= 0 ? qtyValue : null

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={false}
      title={title}
      description={getName(item)}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={save} loading={saving} icon={<Icon className="h-5 w-5" />} cooldownMs={600}>
            {kind === 'purchase' ? t('stock.purchase') : t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {kind !== 'purchase' && <InlineNotice tone="info">{kind === 'fix' ? t('stock.fixDesc') : t('stock.adjustDesc')}</InlineNotice>}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-2 border border-line px-4 py-3">
            <p className="text-xs font-semibold text-muted">{t('stock.currentQty')}</p>
            <p className={item.quantity < 0 ? 'num text-xl font-extrabold text-danger-ink' : 'num text-xl font-extrabold text-ink'}>
              <bdi dir="ltr">{formatQty(item)}</bdi>
            </p>
          </div>
          <div className="rounded-2xl bg-primary-soft/60 border border-line px-4 py-3">
            <p className="text-xs font-semibold text-muted">{t('stock.afterChange')}</p>
            <p className="num text-xl font-extrabold text-ink">
              <bdi dir="ltr">{after === null ? '—' : formatQty(item, after)}</bdi>
            </p>
          </div>
        </div>
        {kind !== 'purchase' && item.quantity < 0 && (
          <InlineNotice tone="warning">{t('stock.negativeStockNote', { qty: formatQty(item) })}</InlineNotice>
        )}
        <Input
          label={kind === 'purchase' ? t('stock.purchaseQty') : t('stock.newQuantity')}
          inputMode="decimal"
          inputSize="lg"
          className="num font-bold"
          trailing={<span className="px-2 text-sm font-semibold text-muted">{unit}</span>}
          {...kb.bind(quantity, setQuantity, 'numeric')}
        />
        {kind === 'purchase' ? (
          <>
            <Input label={t('stock.purchasePrice')} inputMode="decimal" className="num" trailing={<CurrencyTag />} {...kb.bind(price, setPrice, 'numeric')} />
            {qtyValue > 0 && priceValue >= 0 && (
              <div className="flex items-center justify-between rounded-2xl bg-surface-2 border border-line px-4 py-3">
                <span className="text-sm font-semibold text-ink-2">{t('stock.totalCost')}</span>
                <Money value={qtyValue * priceValue} className="text-xl font-extrabold text-ink" />
              </div>
            )}
          </>
        ) : (
          <Input label={t('stock.reason')} placeholder={t('stock.reasonPlaceholder')} {...kb.bind(reason, setReason)} />
        )}
        {error && <InlineNotice>{error}</InlineNotice>}
      </div>
      {kb.keyboard}
    </Modal>
  )
}
