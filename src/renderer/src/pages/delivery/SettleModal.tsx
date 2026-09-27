import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HandCoins } from 'lucide-react'
import type { DriverSettlementPreview } from '../../../../shared/delivery'
import { Button, Input, Modal, Money, formatAmount, toast } from '../../components/ui'
import { useAppStore } from '../../store/appStore'
import { OverShort, errorText, fmtDate } from '../cash/cashShared'

interface SettleTarget {
  driver: { id: number; name: string }
  preview: DriverSettlementPreview
}

/** Count the cash a driver hands back; the difference is recorded against the driver, not the drawer. */
export function SettleModal({ target, onClose, onDone }: { target: SettleTarget | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const symbol = useAppStore((s) => s.currencySymbol)
  const [collected, setCollected] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    setCollected(String(target.preview.expectedCash))
    setNote('')
    setError('')
  }, [target])

  const expected = target?.preview.expectedCash ?? 0
  const value = Number(collected)
  const valid = collected !== '' && Number.isInteger(value) && value >= 0
  const diff = valid ? value - expected : null

  const submit = async (): Promise<void> => {
    if (!target) return
    if (!valid) return setError(t('cashAdmin.errors.wholeAmount'))
    setBusy(true)
    setError('')
    try {
      await window.api.delivery.settleDriver({ driver_id: target.driver.id, collected_cash: value, note: note.trim() || undefined })
      toast.success(t('delivery.settle.done', { name: target.driver.name }))
      onDone()
      onClose()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={target !== null}
      onClose={busy ? () => {} : onClose}
      size="lg"
      closeOnBackdrop={false}
      title={t('delivery.settle.title', { name: target?.driver.name ?? '' })}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button size="lg" loading={busy} cooldownMs={800} icon={<HandCoins className="h-5 w-5" />} onClick={submit}>{t('delivery.settle.confirm')}</Button>
        </>
      }
    >
      {target && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-[13px] font-semibold text-muted mb-2">{t('delivery.drivers.orders', { count: target.preview.orders.length })}</p>
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {target.preview.orders.map((o) => (
                <li key={o.orderId} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-bold text-ink num">#{o.dailyNumber}</span>
                    <span className="text-xs text-muted num"> · {fmtDate(o.orderDate)}</span>
                  </span>
                  <span className="text-end">
                    {o.balanceDue > 0 ? (
                      <span className="font-semibold text-ink"><Money value={o.balanceDue} decimals={0} /></span>
                    ) : (
                      <span className="text-xs font-semibold text-success-ink">{t('delivery.card.paid')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {target.preview.deliveryFees > 0 && (
              <p className="mt-3 text-xs text-muted">{t('delivery.settle.fees', { fees: `${formatAmount(target.preview.deliveryFees, 0)} ${symbol}` })}</p>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-2 border border-line px-5 py-4">
              <p className="text-xs font-semibold text-muted">{t('delivery.drivers.expected')}</p>
              <p className="text-total text-ink"><Money value={expected} decimals={0} /></p>
            </div>
            <Input label={t('delivery.drivers.collected')} type="number" inputMode="numeric" min={0} step={1} inputSize="lg" value={collected}
              onChange={(e) => setCollected(e.target.value)} autoFocus />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink-2">{t('cashAdmin.report.overShort')}</span>
              <OverShort value={diff} className="text-sm px-3 py-1" />
            </div>
            <Input label={t('cashAdmin.note')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            {target.preview.outForDelivery > 0 && (
              <p className="text-xs font-medium text-warning-ink bg-warning-soft rounded-xl px-3 py-2">{t('delivery.settle.stillOut', { count: target.preview.outForDelivery })}</p>
            )}
            {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
