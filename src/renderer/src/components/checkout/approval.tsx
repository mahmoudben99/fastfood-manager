import { FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react'
import { parseApprovalError, type ApprovalAction, type ApprovalInput } from '../../../../shared/cash'
import { Button, Modal, cn } from '../ui'
import { Numpad, SideKey, keepFocus, useNumpadKeys } from './Numpad'
import type { NumpadKey } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'
import type { WithApproval } from './contracts'
import { Z_APPROVAL } from './methods'

interface ApprovalRequest {
  action: ApprovalAction
  /** Pre-filled reason (caller's opts.reason). */
  reason: string
  /** The last PIN was wrong. */
  invalid: boolean
  /** Bumped on each wrong PIN (drives the shake). */
  attempt: number
  /** The call is being retried with the PIN. */
  busy: boolean
  resolve: (value: ApprovalInput | null) => void
}

interface ApprovalState {
  request: ApprovalRequest | null
}

/** Open approval prompt (null = none). Other checkout dialogs ignore Esc/Enter while one is open. */
export const useApprovalStore = create<ApprovalState>(() => ({ request: null }))

export const isApprovalOpen = (): boolean => useApprovalStore.getState().request !== null

function ask(action: ApprovalAction, reason: string | undefined, invalid: boolean): Promise<ApprovalInput | null> {
  return new Promise((resolve) => {
    const current = useApprovalStore.getState().request
    if (current) {
      // Retry after a wrong PIN: keep the same dialog (reason stays, PIN is cleared, it shakes).
      current.resolve(null)
      useApprovalStore.setState({
        request: { ...current, invalid, attempt: current.attempt + (invalid ? 1 : 0), busy: false, resolve }
      })
    } else {
      useApprovalStore.setState({
        request: { action, reason: reason ?? '', invalid, attempt: invalid ? 1 : 0, busy: false, resolve }
      })
    }
  })
}

function close(): void {
  useApprovalStore.setState({ request: null })
}

/**
 * Runs `run` once; if the main process answers APPROVAL_REQUIRED/INVALID (parseApprovalError),
 * shows the manager PIN + reason dialog (<ApprovalHost/> in App.tsx) and retries with the approval
 * until it succeeds (a wrong PIN shakes and asks again). Resolves null if the dialog is cancelled.
 * Any other error closes the dialog and rejects as usual.
 */
export const withApproval: WithApproval = async (run, opts) => {
  try {
    return await run()
  } catch (error) {
    const first = parseApprovalError(error)
    if (!first) throw error
    const action = opts?.action ?? first.action
    let invalid = false
    for (;;) {
      const approval = await ask(action, opts?.reason, invalid)
      if (!approval) {
        close()
        return null
      }
      try {
        const result = await run(approval)
        close()
        return result
      } catch (retryError) {
        if (!parseApprovalError(retryError)) {
          close()
          throw retryError
        }
        invalid = true
      }
    }
  }
}

/** Ask for a PIN before a call that never refuses on its own (e.g. revealing the expected cash). */
export function withApprovalFirst<T>(action: ApprovalAction, run: (approval: ApprovalInput) => Promise<T>, reason?: string): Promise<T | null> {
  return withApproval<T>(
    (approval) => (approval ? run(approval) : Promise.reject(new Error(`APPROVAL_REQUIRED:${action}`))),
    { action, reason }
  )
}

function shake(element: HTMLElement | null): void {
  if (!element || typeof element.animate !== 'function') return
  const reduced = document.documentElement.classList.contains('perf') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) return
  element.animate(
    [
      { transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' },
      { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }
    ],
    { duration: 380, easing: 'ease-out' }
  )
}

/** Global manager-approval dialog: mount once (App.tsx). */
export function ApprovalHost() {
  const request = useApprovalStore((s) => s.request)
  if (!request) return null
  // Own top layer on <body>: above the order screen's sheets, drawers and other z-50 modals.
  return createPortal(<ApprovalDialog request={request} />, document.body)
}

function ApprovalDialog({ request }: { request: ApprovalRequest }) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState(request.reason)
  const pinRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // The PIN field takes the focus (touch tills too: it is read-only there, so no OS keyboard).
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0)
    return () => clearTimeout(timer)
  }, [])

  // A wrong PIN: clear it, shake, focus again.
  useEffect(() => {
    if (request.attempt === 0) return
    setPin('')
    shake(pinRef.current)
    inputRef.current?.focus()
  }, [request.attempt])

  // PINs may start with 0, so no amount-style normalisation here.
  const press = (key: NumpadKey): void =>
    setPin((value) => (key === 'back' ? value.slice(0, -1) : key === 'clear' ? '' : (value + key).slice(0, 12)))
  useNumpadKeys(!request.busy, press, () => submit(), formRef)

  const quick = t(`checkout.approval.reasons.${request.action}`, { returnObjects: true }) as unknown
  const quickReasons = Array.isArray(quick) ? (quick as string[]) : []
  const ready = pin.length > 0 && reason.trim().length > 0 && !request.busy

  const cancel = (): void => {
    if (request.busy) return
    request.resolve(null)
    close()
  }
  const submit = (event?: FormEvent): void => {
    event?.preventDefault()
    if (!ready) return
    useApprovalStore.setState({ request: { ...request, busy: true } })
    request.resolve({ pin, reason: reason.trim() })
  }

  return (
    <Modal
      isOpen
      onClose={cancel}
      zIndex={Z_APPROVAL}
      size="md"
      closeOnBackdrop={false}
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary-ink" />
          {t('checkout.approval.title')}
        </span>
      }
      description={t(`checkout.approval.actions.${request.action}`)}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={cancel} disabled={request.busy}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" icon={<KeyRound className="h-5 w-5" />} onClick={() => submit()} disabled={!ready} loading={request.busy}>
            {t('checkout.approval.approve')}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-4" data-testid="approval-dialog">
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            {quickReasons.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setReason(label)}
                onMouseDown={keepFocus}
                aria-pressed={reason === label}
                className={cn(
                  'tap min-h-11 px-3.5 rounded-full border text-sm font-semibold',
                  reason === label
                    ? 'bg-inverse text-on-inverse border-transparent'
                    : 'bg-surface-2 text-ink-2 border-line hover:bg-surface-3'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            data-ui="input"
            placeholder={t('checkout.approval.otherReason')}
            maxLength={200}
            className="w-full min-h-12 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            {...kb.field('reason', reason, setReason)}
          />
        </div>

        <div ref={pinRef}>
          <input
            id="approval-pin"
            ref={inputRef}
            type="password"
            autoComplete="off"
            aria-label={t('checkout.approval.pinHint')}
            placeholder={t('checkout.approval.pinHint')}
            readOnly={kb.isTouch}
            inputMode={kb.isTouch ? 'none' : 'numeric'}
            value={pin}
            onChange={(event) => setPin(event.target.value.slice(0, 64))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
            aria-invalid={request.invalid || undefined}
            className={cn(
              'num w-full min-h-12 rounded-xl border-2 bg-surface-2 px-4 text-center text-2xl tracking-[0.4em] text-ink placeholder:text-base placeholder:tracking-normal placeholder:text-faint',
              'focus:outline-none focus:border-primary',
              request.invalid ? 'border-danger' : 'border-line-strong'
            )}
          />
          {request.invalid && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-danger-ink">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {t('checkout.approval.wrongPin')}
            </p>
          )}
        </div>

        <Numpad
          size="sm"
          disabled={request.busy}
          onKey={press}
          side={<SideKey tone="danger" onClick={() => setPin('')} label={t('checkout.pad.clear')}>C</SideKey>}
        />
      </form>
      {kb.keyboard}
    </Modal>
  )
}
