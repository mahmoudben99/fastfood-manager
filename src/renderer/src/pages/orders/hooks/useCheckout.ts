import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cashBreakdown, normalizeCashRounding } from '../../../../../shared/cash'
import { withApproval, type OrderPaymentInput } from '../../../components/checkout'
import { toast } from '../../../components/ui'
import { cartTotals, useOrderStore } from '../../../store/orderStore'
import {
  buildCreateInput, buildUpdateInfo, classifyError, deliveryAddressMissing, duplicateMatchesCheckout, updateLineInputs,
  type CheckoutError
} from '../lib/checkout'
import type { MenuItemData, OrderWorker } from '../types'

export interface SuccessInfo {
  orderId: number
  orderNumber: number
  /** Lines with no kitchen worker (combo parents never print, so they are not counted). */
  unassignedCount: number
  /** Documents the order transaction already queued: printing those again is a reprint. */
  autoPrinted: string[]
  change: number | null
  unpaid: boolean
  workers: OrderWorker[]
}

export type Validation = 'table' | 'phone' | 'address' | null
type Attempt = { kind: 'create'; payments: OrderPaymentInput[] | undefined } | { kind: 'update' }

const MILESTONES = [500, 250, 100, 50, 10]

/**
 * Pay / save flow: validation, payment sheet, idempotent create (same source_request_id for a
 * retried cart), edits, manager approval, and the v4 error tokens (NO_OPEN_SHIFT, BELOW_MIN_ORDER,
 * sold out, APPROVAL_*). The cart is only cleared after a confirmed save.
 */
export function useCheckout(deps: {
  onNeedDelivery: () => void
  afterSave: () => void
  refreshMenu: () => Promise<MenuItemData[]>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [validation, setValidation] = useState<Validation>(null)
  const [error, setError] = useState<CheckoutError | null>(null)
  const [success, setSuccess] = useState<SuccessInfo | null>(null)
  const [shiftPrompt, setShiftPrompt] = useState(false)
  const [milestone, setMilestone] = useState<number | null>(null)
  const submitting = useRef(false)
  const requestId = useRef<string | null>(null)
  const lastAttempt = useRef<Attempt | null>(null)
  const roundingStep = useRef(0)
  const [cashStep, setCashStep] = useState(0)
  const depsRef = useRef(deps)
  depsRef.current = deps

  useEffect(() => {
    window.api.settings.get('cash_rounding').then((v: string) => {
      roundingStep.current = normalizeCashRounding(v)
      setCashStep(roundingStep.current)
    }).catch(() => {})
    // A cleared cart starts a new idempotency scope; a retried cart keeps its token.
    return useOrderStore.subscribe((s) => {
      if (s.items.length === 0) requestId.current = null
    })
  }, [])

  useEffect(() => {
    if (!validation) return
    const timer = setTimeout(() => setValidation(null), 2500)
    return () => clearTimeout(timer)
  }, [validation])

  const validate = useCallback((): boolean => {
    const s = useOrderStore.getState()
    if (s.items.length === 0) return false
    if (s.orderType === 'local' && !s.tableNumber.trim()) {
      setValidation('table')
      return false
    }
    // Direct delivery needs the customer's phone; platform orders (Yassir…) are reached through the platform.
    const phoneMissing = s.channel === null && !s.customerPhone.trim()
    if (s.orderType === 'delivery' && (phoneMissing || deliveryAddressMissing(s.delivery))) {
      setValidation(phoneMissing ? 'phone' : 'address')
      depsRef.current.onNeedDelivery()
      return false
    }
    if (s.items.some((i) => i.unavailable)) {
      setError({ kind: 'generic', message: t('pos.error.soldOut') })
      return false
    }
    return true
  }, [t])

  /** After a failure: flag cart lines whose item is now sold out / unavailable. */
  const flagUnavailable = useCallback(async () => {
    const menu = await depsRef.current.refreshMenu()
    const blocked = new Set(menu.filter((m) => m.sold_out || m.available_now === false || m.available_now === 0).map((m) => m.id))
    const cart = useOrderStore.getState().items
    if (cart.some((i) => blocked.has(i.menu_item_id) && i.order_item_id === undefined)) {
      useOrderStore.getState().markUnavailable(new Set(cart.filter((i) => i.order_item_id === undefined && blocked.has(i.menu_item_id)).map((i) => i.menu_item_id)))
      return true
    }
    return false
  }, [])

  const handleFailure = useCallback(async (err: unknown, attempt: Attempt) => {
    lastAttempt.current = attempt
    const classified = classifyError(err)
    if (classified.kind === 'no_shift') {
      setError(classified)
      setShiftPrompt(true)
      return
    }
    if (classified.kind === 'generic' && (await flagUnavailable())) {
      setError({ kind: 'generic', message: t('pos.error.soldOut') })
      return
    }
    setError(classified)
  }, [flagUnavailable, t])

  const finishCreate = useCallback(async (order: any, payments: OrderPaymentInput[] | undefined) => {
    const cash = payments?.find((p) => p.method === 'cash' && p.tendered !== undefined)
    const change = cash ? cashBreakdown(cash.amount ?? (Number(order.total) || 0), cash.tendered, roundingStep.current).change : null
    let workers: OrderWorker[] = []
    try { workers = (await window.api.printer.getOrderWorkers(order.id)) || [] } catch { /* none */ }
    const items: any[] = Array.isArray(order.items) ? order.items : []
    setSuccess({
      orderId: order.id,
      orderNumber: order.daily_number,
      unassignedCount: items.filter((i) => i.worker_id == null && i.line_kind !== 'combo').length,
      autoPrinted: Array.isArray(order.auto_print_documents) ? order.auto_print_documents : [],
      change,
      unpaid: Array.isArray(payments) && payments.length === 0,
      workers
    })
    if (MILESTONES.includes(order.daily_number)) {
      setMilestone(order.daily_number)
      setTimeout(() => setMilestone(null), 4000)
    }
    useOrderStore.getState().clearOrder()
    requestId.current = null
    void useOrderStore.getState().loadActivePromos()
    void depsRef.current.refreshMenu()
    depsRef.current.afterSave()
  }, [])

  const submitCreate = useCallback(async (payments: OrderPaymentInput[] | undefined, opts: { ignoreMinOrder?: boolean } = {}) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    const attempt: Attempt = { kind: 'create', payments }
    try {
      const s = useOrderStore.getState()
      requestId.current = requestId.current ?? crypto.randomUUID()
      const input = buildCreateInput(s, requestId.current, payments, opts)
      const expectedDiscount = cartTotals(s).discount
      const order = await withApproval((approval) => window.api.orders.create({ ...input, approval }), { action: 'discount' })
      if (order === null) {
        toast.info(t('pos.error.approvalCancelled'))
        return
      }
      setPaymentOpen(false)
      if (order.duplicate && !duplicateMatchesCheckout(order, input, expectedDiscount)) {
        setError({ kind: 'generic', message: t('pos.error.duplicate', { number: order.daily_number }) })
        return
      }
      await finishCreate(order, payments)
    } catch (err) {
      console.error('Failed to place order:', err)
      setPaymentOpen(false)
      await handleFailure(err, attempt)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }, [finishCreate, handleFailure, t])

  const submitUpdate = useCallback(async (opts: { ignoreMinOrder?: boolean } = {}) => {
    const s = useOrderStore.getState()
    if (!s.editingOrderId || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const orderId = s.editingOrderId
      // Legacy orders have no trustworthy promotion snapshot: the stored discount is kept (undefined).
      const updated = await withApproval((approval) =>
        window.api.orders.updateItems(orderId, updateLineInputs(s.items), undefined, undefined, buildUpdateInfo(s, opts) as any, approval))
      if (updated === null) {
        toast.info(t('pos.error.approvalCancelled'))
        return
      }
      if (!updated || updated.status === 'completed' || updated.status === 'cancelled') {
        const reason = !updated ? 'not_found' : updated.status
        setError({ kind: 'edit_rejected', reason, message: '' })
        return
      }
      toast.success(t('pos.success.updated', { number: s.editingOrderDailyNumber ?? orderId }))
      useOrderStore.getState().clearOrder()
      void useOrderStore.getState().loadActivePromos()
      depsRef.current.afterSave()
    } catch (err) {
      console.error('Failed to update order:', err)
      await handleFailure(err, { kind: 'update' })
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }, [handleFailure, t])

  /** Pay button / F2: edits save directly; new orders open the payment sheet. */
  const pay = useCallback(() => {
    if (submitting.current || !validate()) return
    setError(null)
    if (useOrderStore.getState().editingOrderId) void submitUpdate()
    else setPaymentOpen(true)
  }, [submitUpdate, validate])

  /** One-tap cash: the order is saved with the cash handed over; the change shows on the success card. */
  const quickTender = useCallback((tendered: number) => {
    if (submitting.current || !validate()) return
    void submitCreate([{ method: 'cash', tendered }])
  }, [submitCreate, validate])

  const retry = useCallback((opts: { ignoreMinOrder?: boolean } = {}) => {
    const attempt = lastAttempt.current
    setShiftPrompt(false)
    if (!attempt) return
    if (attempt.kind === 'update') void submitUpdate(opts)
    else void submitCreate(attempt.payments, opts)
  }, [submitCreate, submitUpdate])

  return {
    cashStep,
    busy,
    paymentOpen,
    validation,
    error,
    success,
    shiftPrompt,
    milestone,
    pay,
    quickTender,
    confirmPayment: (payments: OrderPaymentInput[]) => void submitCreate(payments),
    closePayment: () => setPaymentOpen(false),
    retry,
    acceptBelowMin: () => retry({ ignoreMinOrder: true }),
    dismissError: () => setError(null),
    closeSuccess: () => setSuccess(null),
    openShiftPrompt: () => setShiftPrompt(true),
    closeShiftPrompt: () => setShiftPrompt(false)
  }
}

export type Checkout = ReturnType<typeof useCheckout>
