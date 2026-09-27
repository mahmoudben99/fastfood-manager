import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPinned, Pencil, Plus } from 'lucide-react'
import type { DeliveryZone, DeliveryZoneInput } from '../../../../shared/delivery'
import { Badge, Button, Card, EmptyState, IconButton, Input, Modal, Money, Skeleton, Toggle, toast } from '../../components/ui'
import { errorText, td, tdEnd, th, thEnd, useAsync } from '../cash/cashShared'

interface Draft { id?: number; name: string; fee: string; min_order: string; estimated_minutes: string; is_active: boolean; sort_order: number }

const toDraft = (z?: DeliveryZone, sort = 0): Draft => z
  ? { id: z.id, name: z.name, fee: String(z.fee), min_order: z.min_order === null ? '' : String(z.min_order), estimated_minutes: z.estimated_minutes === null ? '' : String(z.estimated_minutes), is_active: z.is_active === 1, sort_order: z.sort_order }
  : { name: '', fee: '', min_order: '', estimated_minutes: '', is_active: true, sort_order: sort }

const optionalWhole = (v: string): number | null | undefined => {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

const toInput = (z: DeliveryZone, patch: Partial<DeliveryZoneInput>): DeliveryZoneInput => ({
  id: z.id, name: z.name, fee: z.fee, min_order: z.min_order, estimated_minutes: z.estimated_minutes,
  is_active: z.is_active === 1, sort_order: z.sort_order, ...patch
})

/** Delivery zones: fee, minimum order, ETA; switched off rather than deleted (orders keep a snapshot). */
export function ZonesManager() {
  const { t } = useTranslation()
  const zones = useAsync(() => window.api.delivery.getZones(true), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rows = zones.data ?? []

  useEffect(() => setError(''), [draft?.id])

  const toggle = async (z: DeliveryZone, active: boolean): Promise<void> => {
    try {
      await window.api.delivery.saveZone(toInput(z, { is_active: active }))
      await zones.reload()
      if (!active) {
        toast.info(t('delivery.zones.disabled', { name: z.name }), {
          action: { label: t('ui.undo'), onClick: () => void window.api.delivery.saveZone(toInput(z, { is_active: true })).then(() => zones.reload()) }
        })
      }
    } catch (e) {
      toast.error(t('cashAdmin.saveFailed'), { description: errorText(e, '') })
    }
  }

  const save = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    if (!draft) return
    const fee = optionalWhole(draft.fee)
    const minOrder = optionalWhole(draft.min_order)
    const eta = optionalWhole(draft.estimated_minutes)
    if (!draft.name.trim()) return setError(t('delivery.zones.nameRequired'))
    if (fee === undefined || minOrder === undefined || eta === undefined) return setError(t('cashAdmin.errors.wholeAmount'))
    setBusy(true)
    try {
      await window.api.delivery.saveZone({
        ...(draft.id !== undefined ? { id: draft.id } : {}),
        name: draft.name.trim(), fee: fee ?? 0, min_order: minOrder, estimated_minutes: eta, is_active: draft.is_active, sort_order: draft.sort_order
      })
      toast.success(t('cashAdmin.saved'))
      setDraft(null)
      await zones.reload()
    } catch (err) {
      setError(errorText(err, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      padding={false}
      title={t('delivery.zones.title')}
      icon={<MapPinned />}
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(toDraft(undefined, rows.length))}>{t('delivery.zones.add')}</Button>}
    >
      {zones.loading && !zones.data ? (
        <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MapPinned />}
          title={t('delivery.zones.emptyTitle')}
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(toDraft())}>{t('delivery.zones.add')}</Button>}
        />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t('delivery.zones.name')}</th>
                <th className={thEnd}>{t('delivery.zones.fee')}</th>
                <th className={thEnd}>{t('delivery.zones.minOrder')}</th>
                <th className={thEnd}>{t('delivery.zones.eta')}</th>
                <th className={th}>{t('delivery.zones.active')}</th>
                <th className={thEnd}><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((z) => (
                <tr key={z.id} className={z.is_active ? 'h-14' : 'h-14 opacity-60'}>
                  <td className={td}>
                    <span className="font-semibold text-ink"><bdi>{z.name}</bdi></span>
                    {!z.is_active && <Badge className="ms-2" variant="neutral">{t('delivery.zones.off')}</Badge>}
                  </td>
                  <td className={tdEnd}>{z.fee > 0 ? <Money value={z.fee} decimals={0} /> : <Badge variant="success">{t('delivery.zones.free')}</Badge>}</td>
                  <td className={tdEnd}>{z.min_order ? <Money value={z.min_order} decimals={0} /> : <span className="text-muted">—</span>}</td>
                  <td className={tdEnd}>{z.estimated_minutes ? <span className="num">{t('delivery.card.eta', { minutes: z.estimated_minutes })}</span> : <span className="text-muted">—</span>}</td>
                  <td className={td}><Toggle size="md" checked={z.is_active === 1} onChange={(v) => void toggle(z, v)} /></td>
                  <td className="px-4 text-end"><IconButton icon={<Pencil />} label={t('common.edit')} variant="ghost" onClick={() => setDraft(toDraft(z))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={draft !== null}
        onClose={busy ? () => {} : () => setDraft(null)}
        closeOnBackdrop={false}
        title={draft?.id !== undefined ? t('delivery.zones.edit') : t('delivery.zones.add')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setDraft(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button size="lg" loading={busy} onClick={() => save()}>{t('common.save')}</Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <Input label={t('delivery.zones.name')} value={draft.name} maxLength={80} autoFocus placeholder={t('delivery.zones.namePlaceholder')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input label={t('delivery.zones.fee')} type="number" inputMode="numeric" min={0} step={1} value={draft.fee} placeholder="0"
                onChange={(e) => setDraft({ ...draft, fee: e.target.value })} />
              <Input label={t('delivery.zones.minOrder')} type="number" inputMode="numeric" min={0} step={1} value={draft.min_order} placeholder={t('cashAdmin.optional')}
                onChange={(e) => setDraft({ ...draft, min_order: e.target.value })} />
              <Input label={t('delivery.zones.etaMinutes')} type="number" inputMode="numeric" min={0} step={1} value={draft.estimated_minutes} placeholder={t('cashAdmin.optional')}
                onChange={(e) => setDraft({ ...draft, estimated_minutes: e.target.value })} />
            </div>
            <Toggle checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} label={t('delivery.zones.active')} />
            {error && <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>}
          </form>
        )}
      </Modal>
    </Card>
  )
}
