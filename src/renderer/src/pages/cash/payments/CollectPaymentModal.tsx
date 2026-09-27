import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HandCoins, Plus, X } from 'lucide-react'
import { cashBreakdown, normalizeCashRounding, type OrderPaymentInput, type PaymentMethodConfig } from '../../../../../shared/cash'
import { Button, IconButton, Input, Modal, Money, Select, toast } from '../../../components/ui'
import { errorText, useMethodLabel } from '../cashShared'

export interface CollectTarget {
  id: number
  daily_number: number
  order_date: string
  total: number
  paid: number
  balance_due: number
  customer_name: string | null
}

interface Line {
  method: string
  amount: string
  tendered: string
  reference: string
}

const MAX_LINES = 4

/** Collect a pay-later / partial balance; split across methods, cash change and rounding shown live. */
export function CollectPaymentModal({ order, methods, onClose, onDone }: {
  order: CollectTarget | null
  methods: PaymentMethodConfig[] | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const methodLabel = useMethodLabel(methods)
  const enabled = (methods ?? []).filter((m) => m.enabled)
  const [lines, setLines] = useState<Line[]>([])
  const [step, setStep] = useState<0 | 5 | 10>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!order) return
    setError('')
    setLines([{ method: 'cash', amount: String(order.balance_due), tendered: '', reference: '' }])
    window.api.settings.get('cash_rounding').then((v: string | null) => setStep(normalizeCashRounding(v))).catch(() => setStep(0))
  }, [order])

  const sum = useMemo(() => lines.reduce((a, l) => a + (Number(l.amount) || 0), 0), [lines])
  const remaining = (order?.balance_due ?? 0) - sum
  const patch = (i: number, p: Partial<Line>): void => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))

  /** New line for the rest; when nothing is left, the last line is split in two halves. */
  const split = (): void => setLines((ls) => {
    const method = enabled.find((m) => !ls.some((l) => l.method === m.id))?.id ?? 'cash'
    if (remaining > 0) return [...ls, { method, amount: String(remaining), tendered: '', reference: '' }]
    const last = ls[ls.length - 1]
    const amount = Number(last.amount) || 0
    if (amount < 2) return ls
    const half = Math.floor(amount / 2)
    return [...ls.slice(0, -1), { ...last, amount: String(amount - half) }, { method, amount: String(half), tendered: '', reference: '' }]
  })

  const submit = async (): Promise<void> => {
    if (!order) return
    setError('')
    const payload: OrderPaymentInput[] = []
    for (const l of lines) {
      const amount = Number(l.amount)
      if (!Number.isInteger(amount) || amount < 1) return setError(t('cashAdmin.errors.wholeAmount'))
      const line: OrderPaymentInput = { method: l.method, amount }
      if (l.method === 'cash' && l.tendered !== '') {
        const tendered = Number(l.tendered)
        if (!Number.isInteger(tendered) || !cashBreakdown(amount, tendered, step).sufficient) return setError(t('cashAdmin.collect.notEnough'))
        line.tendered = tendered
      }
      if (l.method !== 'cash' && l.reference.trim()) line.reference = l.reference.trim().slice(0, 100)
      payload.push(line)
    }
    if (remaining < 0) return setError(t('cashAdmin.collect.tooMuch'))
    setBusy(true)
    try {
      const summary = await window.api.payments.add(order.id, payload)
      toast.success(
        summary.balanceDue <= 0 ? t('cashAdmin.collect.paidInFull', { number: order.daily_number }) : t('cashAdmin.collect.partial', { number: order.daily_number }),
        summary.balanceDue > 0 ? { description: `${t('cashAdmin.balanceDue')}: ${summary.balanceDue}` } : undefined
      )
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
      isOpen={order !== null}
      onClose={busy ? () => {} : onClose}
      size="lg"
      closeOnBackdrop={false}
      title={order ? t('cashAdmin.collect.title', { number: order.daily_number }) : ''}
      description={order?.customer_name || undefined}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button size="lg" loading={busy} cooldownMs={800} icon={<HandCoins className="h-5 w-5" />} onClick={submit} disabled={sum <= 0}>
            {t('cashAdmin.collect.confirm')}
          </Button>
        </>
      }
    >
      {order && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              [t('cashAdmin.total'), order.total],
              [t('cashAdmin.paid'), order.paid],
              [t('cashAdmin.balanceDue'), order.balance_due]
            ].map(([label, value], i) => (
              <div key={i} className={i === 2 ? 'rounded-2xl bg-warning-soft px-4 py-3' : 'rounded-2xl bg-surface-2 px-4 py-3'}>
                <p className={i === 2 ? 'text-xs font-semibold text-warning-ink' : 'text-xs font-semibold text-muted'}>{label}</p>
                <p className="text-xl font-extrabold text-ink"><Money value={Number(value)} decimals={0} /></p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => {
              const cash = l.method === 'cash'
              const breakdown = cash && l.tendered !== '' ? cashBreakdown(Number(l.amount) || 0, Number(l.tendered), step) : null
              return (
                <div key={i} className="rounded-2xl border border-line bg-surface p-4 grid sm:grid-cols-[1fr_9rem_10rem_auto] gap-3 items-end">
                  <Select
                    label={t('cashAdmin.method')}
                    value={l.method}
                    onChange={(e) => patch(i, { method: e.target.value })}
                    options={enabled.map((m) => ({ value: m.id, label: methodLabel(m.id) }))}
                  />
                  <Input
                    label={t('cashAdmin.amount')}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={l.amount}
                    onChange={(e) => patch(i, { amount: e.target.value })}
                  />
                  {cash ? (
                    <Input
                      label={t('cashAdmin.collect.tendered')}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={l.tendered}
                      placeholder={t('cashAdmin.optional')}
                      onChange={(e) => patch(i, { tendered: e.target.value })}
                    />
                  ) : (
                    <Input
                      label={t('cashAdmin.collect.reference')}
                      value={l.reference}
                      maxLength={100}
                      placeholder={t('cashAdmin.optional')}
                      onChange={(e) => patch(i, { reference: e.target.value })}
                    />
                  )}
                  {lines.length > 1 ? (
                    <IconButton icon={<X />} label={t('common.remove')} variant="ghost" size="lg" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
                  ) : <span />}
                  {breakdown && (
                    <p className="sm:col-span-4 text-sm">
                      {breakdown.sufficient ? (
                        <span className="font-semibold text-success-ink">
                          {t('cashAdmin.collect.change')} <Money value={breakdown.change ?? 0} decimals={0} />
                        </span>
                      ) : (
                        <span className="font-semibold text-danger-ink">{t('cashAdmin.collect.notEnough')}</span>
                      )}
                      {breakdown.rounding !== 0 && (
                        <span className="text-muted"> · {t('cashAdmin.collect.rounded', { due: breakdown.due })}</span>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="soft"
              icon={<Plus className="h-4 w-4" />}
              disabled={lines.length >= MAX_LINES}
              onClick={split}
            >
              {t('cashAdmin.collect.split')}
            </Button>
            <p className="text-sm">
              <span className="text-muted">{t('cashAdmin.collect.leftAfter')} </span>
              <span className={remaining < 0 ? 'font-bold text-danger-ink' : 'font-bold text-ink'}><Money value={remaining} decimals={0} /></span>
            </p>
          </div>
          {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
