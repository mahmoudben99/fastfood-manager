import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { Button, Modal, SegmentedControl, cn } from '../../../components/ui'
import { cartTotals, useOrderStore, type ManualDiscount } from '../../../store/orderStore'
import { useTouchField } from '../touchKeyboard'
import { SignedMoney } from './SignedMoney'

/** Whole-order note (kitchen + receipt) with recent notes as one-tap chips. */
export function OrderNoteSheet({ suggestions, onClose }: { suggestions: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(() => useOrderStore.getState().notes)
  const field = useTouchField(value, setValue, 'text')
  const save = (): void => {
    useOrderStore.getState().setNotes(value.trim())
    onClose()
  }
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={t('pos.orderNote.title')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button><Button size="lg" onClick={save}>{t('common.save')}</Button></>}
    >
      <textarea
        {...field}
        data-ui="textarea"
        rows={3}
        autoFocus={!field.readOnly}
        placeholder={t('orders.notesPlaceholder')}
        className="w-full rounded-xl border border-line-strong bg-surface p-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      {suggestions.length > 0 && (
        <>
          <p className="pt-3 pb-1.5 text-xs font-semibold text-muted">{t('pos.orderNote.recent')}</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setValue(s)} className={cn('tap h-10 px-3 rounded-full border text-sm font-medium', value === s ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface-2 text-ink-2 hover:bg-surface-3')}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

const PERCENTS = [5, 10, 15, 20, 25, 50]
const AMOUNTS = [50, 100, 200, 500, 1000]

/** Manual discount (new orders). The main process asks for a manager PIN above the policy limit. */
export function DiscountSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const current = useOrderStore((s) => s.manualDiscount)
  const [mode, setMode] = useState<ManualDiscount['mode']>(current?.mode ?? 'percent')
  const [text, setText] = useState(current ? String(current.value) : '')
  const [needsPin, setNeedsPin] = useState(false)
  const field = useTouchField(text, setText, 'numeric')
  const value = Number(text.replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(value) && value > 0 && (mode === 'amount' || value <= 100)

  const preview = useMemo(() => {
    const s = useOrderStore.getState()
    return cartTotals({ ...s, manualDiscount: valid ? { mode, value, label: '' } : null })
  }, [mode, value, valid])

  useEffect(() => {
    const api = window.api.approvals
    if (!api?.check || preview.discount <= 0) {
      setNeedsPin(false)
      return
    }
    let alive = true
    api.check('discount', { subtotal: preview.subtotal, discount: preview.discount, allowance: preview.promoDiscount })
      .then((r) => alive && setNeedsPin(Boolean(r?.required)))
      .catch(() => alive && setNeedsPin(false))
    return () => { alive = false }
  }, [preview.discount, preview.subtotal, preview.promoDiscount])

  const apply = (): void => {
    if (!valid) return
    useOrderStore.getState().setManualDiscount({ mode, value, label: t('pos.discount.label') })
    onClose()
  }
  const remove = (): void => {
    useOrderStore.getState().setManualDiscount(null)
    onClose()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={t('pos.discount.title')}
      footer={
        <>
          {current && <Button variant="ghost" size="lg" className="me-auto text-danger-ink" onClick={remove}>{t('pos.discount.remove')}</Button>}
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={apply} disabled={!valid}>{t('pos.discount.apply')}</Button>
        </>
      }
    >
      <SegmentedControl
        fullWidth
        size="lg"
        value={mode}
        onChange={(m) => { setMode(m); setText('') }}
        options={[{ value: 'percent', label: t('pos.discount.percent') }, { value: 'amount', label: t('pos.discount.amount') }]}
      />
      <div className="grid grid-cols-3 gap-2 pt-4">
        {(mode === 'percent' ? PERCENTS : AMOUNTS).map((v) => (
          <button key={v} type="button" onClick={() => setText(String(v))} className={cn('tap h-14 rounded-xl border text-lg font-extrabold num', String(v) === text ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line-strong bg-surface text-ink hover:bg-surface-2')}>
            {mode === 'percent' ? `${v}%` : <bdi dir="ltr">{v}</bdi>}
          </button>
        ))}
      </div>
      <label className="block pt-4 pb-1.5 text-sm font-semibold text-ink-2" htmlFor="pos-discount-custom">{t('pos.discount.custom')}</label>
      <input
        id="pos-discount-custom"
        data-ui="input"
        inputMode="decimal"
        {...field}
        className="num w-full h-12 rounded-xl border border-line-strong bg-surface px-3.5 text-lg font-bold text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-2">{t('pos.discount.preview')}</span>
        <SignedMoney value={preview.discount} sign="−" styledSymbol className="text-lg font-extrabold text-success-ink" />
      </div>
      {needsPin && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-warning-ink">
          <ShieldCheck className="h-4 w-4" />
          {t('pos.discount.needsPin')}
        </p>
      )}
    </Modal>
  )
}
