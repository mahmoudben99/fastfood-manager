import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Clock, Split, Wallet } from 'lucide-react'
import type { PaymentMethodConfig } from '../../../../shared/cash'
import { Button, Modal, Money, Skeleton, toast } from '../ui'
import type { PaymentSheetProps } from './contracts'
import { isApprovalOpen, useApprovalStore } from './approval'
import { REFERENCE_METHODS, Z_SHEET, errorText, methodName } from './methods'
import { useNumpadKeys } from './Numpad'
import { CardPad, CashPad, MethodList, SplitLines } from './PaymentParts'
import { applyKey, buildPayments, commitPart, tenderView, type TenderState } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'

// Methods + rounding step survive between openings so the sheet opens instantly after the first time.
let cachedMethods: PaymentMethodConfig[] | null = null
let cachedStep = 0

const fresh = (total: number, step: number): TenderState => ({
  total: Math.max(0, Math.round(total)),
  lines: [],
  method: 'cash',
  entry: '',
  reference: '',
  step
})

/**
 * Checkout payment sheet: enabled methods, cash quick tenders + numpad with a huge change due,
 * cash rounding (setting cash_rounding), split across methods, slip reference for cards /
 * BaridiPay / transfer, optional "pay later / COD". Enter = confirm, Esc = cancel.
 * Resolves the `payments` lines for orders.create.
 */
export function PaymentSheet({ open, total, onCancel, onConfirm, allowPayLater, busy }: PaymentSheetProps) {
  const { t, i18n } = useTranslation()
  const kb = useTouchKeyboard()
  const [methods, setMethods] = useState<PaymentMethodConfig[] | null>(cachedMethods)
  const [state, setState] = useState<TenderState>(() => fresh(total, cachedStep))
  const sheetRef = useRef<HTMLDivElement>(null)

  // Every opening starts clean (and picks up setting changes in the background).
  useEffect(() => {
    if (!open) return
    setState(fresh(total, cachedStep))
    // Take the focus off the Pay button behind the sheet so Enter confirms here.
    requestAnimationFrame(() => sheetRef.current?.focus({ preventScroll: true }))
    let alive = true
    Promise.all([window.api.payments.getMethods(), window.api.payments.previewCash(0)])
      .then(([all, preview]) => {
        if (!alive) return
        cachedMethods = all.filter((method) => method.enabled)
        cachedStep = preview?.step ?? 0
        setMethods(cachedMethods)
        setState((current) => ({ ...current, step: cachedStep }))
      })
      .catch((error) => {
        if (!alive) return
        // Cash always works, even if the settings could not be read.
        setMethods((current) => current ?? [{ id: 'cash', enabled: true, builtin: true }])
        toast.error(t('checkout.pay.loadError'), { description: errorText(error, '') })
      })
    return () => {
      alive = false
    }
  }, [open, total, t])

  const view = useMemo(() => tenderView(state), [state])
  const payments = useMemo(() => buildPayments(state), [state])
  const currentMethod = methods?.find((method) => method.id === state.method)
  const label = currentMethod ? methodName(currentMethod, i18n.language) : methodName(state.method, i18n.language)
  const approvalOpen = useApprovalStore((s) => s.request !== null)
  const blocked = busy || approvalOpen

  const confirm = (): void => {
    if (busy || isApprovalOpen() || !payments) return
    onConfirm(payments)
  }
  const split = (): void => {
    if (busy || !view.canSplit) return
    setState((current) => {
      const next = commitPart(current)
      // After a part payment the rest usually goes on another method: cash if it was a card, else a card.
      const other = methods?.find((method) => method.id !== current.method)?.id ?? current.method
      return { ...next, method: current.method === 'cash' ? other : 'cash' }
    })
  }
  const setEntry = (entry: string): void => setState((current) => ({ ...current, entry }))

  useNumpadKeys(open && !blocked, (key) => setState((current) => ({ ...current, entry: applyKey(current.entry, key) })), confirm, sheetRef)

  const guardedCancel = (): void => {
    if (busy || isApprovalOpen()) return
    kb.close()
    onCancel()
  }

  if (!open) return null
  // Portal + own layer: the sheet may open over the order screen's other sheets / drawers (z-50).
  return createPortal(
    <Modal
      isOpen={open}
      onClose={guardedCancel}
      zIndex={Z_SHEET}
      size="xl"
      closeOnBackdrop={false}
      title={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5" data-testid="pay-due">
          <span>{view.paid > 0 ? t('checkout.pay.remaining') : t('checkout.pay.amountDue')}</span>
          <span className="text-total text-ink"><Money value={view.balance} decimals={0} /></span>
          {view.paid > 0 && (
            <span className="text-sm font-semibold text-muted">
              / <Money value={state.total} decimals={0} styledSymbol={false} />
            </span>
          )}
        </span>
      }
      description={
        state.method === 'cash' && view.rounding !== 0 && view.balance > 0 ? (
          <span className="font-semibold text-info-ink">
            {t('checkout.pay.rounded', { step: state.step })} <Money value={view.due} decimals={0} styledSymbol={false} />{' '}
            (<bdi dir="ltr">{view.rounding > 0 ? '+' : ''}{view.rounding}</bdi>)
          </span>
        ) : undefined
      }
      footer={
        <>
          <div className="me-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="lg" onClick={guardedCancel} disabled={busy}>
              {t('common.cancel')}
            </Button>
            {allowPayLater && (
              <Button variant="outline" size="lg" icon={<Clock className="h-5 w-5" />} disabled={busy} cooldownMs={800} onClick={() => onConfirm([])} data-testid="pay-later">
                {t('checkout.pay.payLater')}
              </Button>
            )}
          </div>
          {view.canSplit && (
            <Button variant="soft" size="lg" icon={<Split className="h-5 w-5" />} onClick={split} disabled={busy} data-testid="pay-split" title={t('checkout.pay.addPartHint')}>
              {t('checkout.pay.addPart')}
            </Button>
          )}
          <Button
            size="touch"
            icon={<Wallet className="h-6 w-6" />}
            onClick={confirm}
            disabled={!payments}
            loading={busy}
            cooldownMs={800}
            className="min-w-56"
            data-testid="pay-confirm"
          >
            {t('checkout.pay.confirm')}
          </Button>
        </>
      }
    >
      <div ref={sheetRef} tabIndex={-1} className="grid gap-5 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] outline-none" data-testid="payment-sheet">
        <div className="space-y-3 min-w-0">
          {methods ? (
            <MethodList methods={methods} value={state.method} onChange={(method) => setState((current) => ({ ...current, method, entry: '', reference: '' }))} />
          ) : (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          )}
          <SplitLines
            lines={state.lines}
            busy={busy}
            onRemove={(index) => setState((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}
          />
        </div>

        <div className="min-w-0">
          {view.balance === 0 && state.lines.length > 0 ? (
            <div className="h-full min-h-60 grid place-items-center rounded-2xl bg-success-soft text-center p-6">
              <p className="text-lg font-bold text-success-ink">{t('checkout.pay.allPaid')}</p>
            </div>
          ) : state.method === 'cash' ? (
            <CashPad view={view} entry={state.entry} setEntry={setEntry} disabled={busy} />
          ) : (
            <CardPad
              view={view}
              methodLabel={label}
              entry={state.entry}
              setEntry={setEntry}
              showReference={REFERENCE_METHODS.has(state.method) || !currentMethod?.builtin}
              referenceField={kb.field('reference', state.reference, (reference) => setState((current) => ({ ...current, reference })))}
              disabled={busy}
            />
          )}
        </div>
      </div>
      {kb.keyboard}
    </Modal>,
    document.body
  )
}
