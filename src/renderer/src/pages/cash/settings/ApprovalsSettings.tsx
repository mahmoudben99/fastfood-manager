import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, KeyRound, ShieldCheck } from 'lucide-react'
import type { ApprovalAction, ApprovalPolicy } from '../../../../../shared/cash'
import { Badge, Button, Card, Input, Modal, Skeleton, Toggle, cn, toast } from '../../../components/ui'
import { Hint, errorText } from '../cashShared'

const ACTIONS: ApprovalAction[] = ['cancel_order', 'void_line', 'discount', 'pay_out', 'refund']

interface Draft {
  enabled: boolean
  actions: ApprovalAction[]
  discountPercent: string
  blindClose: boolean
  pin: string
  pinConfirm: string
  clearPin: boolean
}

const fromPolicy = (p: ApprovalPolicy): Draft => ({
  enabled: p.enabled, actions: p.actions.filter((a) => a !== 'view_expected'), discountPercent: String(p.discountPercent),
  blindClose: p.blindClose, pin: '', pinConfirm: '', clearPin: false
})

/**
 * Manager approvals (anti-theft) + blind close + manager PIN. Stored only through
 * approvals.savePolicy / setManagerPin, which re-check the admin password.
 */
export function ApprovalsSettings() {
  const { t } = useTranslation()
  const [policy, setPolicy] = useState<ApprovalPolicy | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.approvals.getPolicy().then((p) => { setPolicy(p); setDraft(fromPolicy(p)) }).catch(() => {})
  }, [])

  const set = (patch: Partial<Draft>): void => setDraft((d) => (d ? { ...d, ...patch } : d))
  const dirty = Boolean(policy && draft && (JSON.stringify(fromPolicy(policy)) !== JSON.stringify(draft)))

  const validate = (): string | null => {
    if (!draft) return null
    const pct = Number(draft.discountPercent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return t('cashAdmin.approvals.percentInvalid')
    if (draft.pin && !/^\d{4,8}$/.test(draft.pin)) return t('cashAdmin.approvals.pinInvalid')
    if (draft.pin !== draft.pinConfirm) return t('cashAdmin.approvals.pinMismatch')
    if (draft.enabled && !policy?.hasManagerPin && !draft.pin) return t('cashAdmin.approvals.pinNeeded')
    return null
  }

  const askPassword = (): void => {
    const problem = validate()
    if (problem) return void toast.error(problem)
    setPassword('')
    setError('')
    setAsking(true)
  }

  const save = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      let next = await window.api.approvals.savePolicy(password, {
        enabled: draft.enabled, actions: draft.actions, discountPercent: Number(draft.discountPercent), blindClose: draft.blindClose
      })
      if (draft.pin) next = await window.api.approvals.setManagerPin(password, draft.pin)
      else if (draft.clearPin) next = await window.api.approvals.setManagerPin(password, '')
      setPolicy(next)
      setDraft(fromPolicy(next))
      setAsking(false)
      toast.success(t('cashAdmin.saved'))
    } catch (err) {
      setError(errorText(err, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={t('cashAdmin.approvals.title')}
      icon={<ShieldCheck />}
      actions={dirty ? <Button size="sm" onClick={askPassword}>{t('common.save')}</Button> : undefined}
    >
      {!draft || !policy ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-5">
          <Toggle checked={draft.enabled} onChange={(v) => set({ enabled: v })} label={<span className="inline-flex items-center gap-1.5">{t('cashAdmin.approvals.enabled')}<Hint text={t('cashAdmin.approvals.enabledHint')} /></span>} />
          <div className={cn('space-y-3', !draft.enabled && 'opacity-50 pointer-events-none')} aria-disabled={!draft.enabled}>
            <p className="text-[13px] font-semibold text-muted">{t('cashAdmin.approvals.which')}</p>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => {
                const on = draft.actions.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => set({ actions: on ? draft.actions.filter((x) => x !== a) : [...draft.actions, a] })}
                    className={cn(
                      'tap min-h-11 px-4 rounded-xl border text-sm font-semibold inline-flex items-center gap-2',
                      on ? 'bg-primary-soft text-primary-ink border-primary/40' : 'bg-surface text-ink-2 border-line hover:bg-surface-2'
                    )}
                  >
                    <span className={cn('h-4 w-4 rounded border flex items-center justify-center', on ? 'bg-primary border-primary text-on-primary' : 'border-line-strong')}>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    {t(`cashAdmin.approvals.actions.${a}`)}
                  </button>
                )
              })}
            </div>
            <div className="w-56">
              <Input
                label={t('cashAdmin.approvals.discountPercent')}
                type="number"
                min={0}
                max={100}
                inputMode="decimal"
                value={draft.discountPercent}
                trailing={<span className="pe-2 text-sm font-semibold">%</span>}
                onChange={(e) => set({ discountPercent: e.target.value })}
              />
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <Toggle checked={draft.blindClose} onChange={(v) => set({ blindClose: v })} label={<span className="inline-flex items-center gap-1.5">{t('cashAdmin.approvals.blindClose')}<Hint text={t('cashAdmin.approvals.blindCloseHint')} /></span>} />
          </div>
          <div className="border-t border-line pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><KeyRound className="h-4 w-4 text-muted" />{t('cashAdmin.approvals.pin')}<Hint text={t('cashAdmin.approvals.pinHint')} /></p>
              <Badge variant={policy.hasManagerPin ? 'success' : 'warning'} dot>
                {policy.hasManagerPin ? t('cashAdmin.approvals.pinSet') : t('cashAdmin.approvals.pinNotSet')}
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} label={t('cashAdmin.approvals.newPin')}
                value={draft.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, ''), clearPin: false })} />
              <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} label={t('cashAdmin.approvals.confirmPin')}
                value={draft.pinConfirm} onChange={(e) => set({ pinConfirm: e.target.value.replace(/\D/g, '') })} />
            </div>
            {policy.hasManagerPin && !draft.pin && (
              <Toggle size="md" checked={draft.clearPin} onChange={(v) => set({ clearPin: v })} label={t('cashAdmin.approvals.clearPin')} />
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={asking}
        onClose={busy ? () => {} : () => setAsking(false)}
        size="sm"
        title={t('cashAdmin.approvals.confirmTitle')}
        description={t('cashAdmin.approvals.confirmBody')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setAsking(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button size="lg" loading={busy} onClick={() => save()} disabled={!password}>{t('common.confirm')}</Button>
          </>
        }
      >
        <form onSubmit={save}>
          <Input type="password" autoFocus label={t('cashAdmin.approvals.adminPassword')} value={password} onChange={(e) => setPassword(e.target.value)} error={error || undefined} />
        </form>
      </Modal>
    </Card>
  )
}
