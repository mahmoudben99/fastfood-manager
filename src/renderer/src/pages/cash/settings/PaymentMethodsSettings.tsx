import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, Check, ChevronDown, ChevronUp, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { PAYMENT_METHOD_ID, paymentMethodLabel, type PaymentMethodConfig } from '../../../../../shared/cash'
import { Badge, Button, Card, IconButton, Skeleton, Toggle, controlClass, cn, toast } from '../../../components/ui'
import { errorText, invalidatePaymentMethods, useCashLang } from '../cashShared'

type Row = PaymentMethodConfig & { key: string }

const toRows = (list: PaymentMethodConfig[]): Row[] => list.map((m) => ({ ...m, key: m.id }))

/** Slug id for a custom method ("Chèque" → "cheque"); non-Latin labels get a generated id. */
function slugId(label: string, taken: Set<string>): string {
  let base = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
  if (!PAYMENT_METHOD_ID.test(base)) base = `custom-${Date.now().toString(36)}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** Enable / rename / reorder payment methods (cash always on); custom methods can be added. */
export function PaymentMethodsSettings() {
  const { t } = useTranslation()
  const lang = useCashLang()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const load = (): void => {
    window.api.payments.getMethods().then((list) => { setRows(toRows(list)); setDirty(false) }).catch(() => setRows([]))
  }
  useEffect(load, [])

  const update = (fn: (rs: Row[]) => Row[]): void => {
    setRows((rs) => (rs ? fn(rs) : rs))
    setDirty(true)
  }
  const move = (i: number, d: -1 | 1): void =>
    update((rs) => {
      const next = rs.slice()
      const j = i + d
      if (j < 0 || j >= next.length) return rs
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const save = async (): Promise<void> => {
    if (!rows) return
    const taken = new Set(rows.filter((r) => r.builtin || r.id).map((r) => r.id))
    const payload = []
    for (const r of rows) {
      const label = (r.label ?? '').trim()
      if (!r.builtin && !label) return void toast.error(t('cashAdmin.methods.labelRequired'))
      const id = r.id || slugId(label, taken)
      taken.add(id)
      payload.push({ id, enabled: r.id === 'cash' ? true : r.enabled, ...(label ? { label } : {}) })
    }
    setSaving(true)
    try {
      setRows(toRows(await window.api.payments.saveMethods(payload)))
      invalidatePaymentMethods()
      setDirty(false)
      toast.success(t('cashAdmin.saved'))
    } catch (e) {
      toast.error(t('cashAdmin.saveFailed'), { description: errorText(e, '') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      padding={false}
      title={t('cashAdmin.methods.title')}
      icon={<CreditCard />}
      actions={
        dirty ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={load} disabled={saving}>{t('cashAdmin.reset')}</Button>
            <Button size="sm" loading={saving} onClick={save}>{t('common.save')}</Button>
          </div>
        ) : undefined
      }
    >
      {!rows ? (
        <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r, i) => {
            const cash = r.id === 'cash'
            const fallback = r.builtin ? paymentMethodLabel(r.id, lang) : t('cashAdmin.methods.customPlaceholder')
            return (
              <li key={r.key} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <button type="button" className="tap h-7 w-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('cashAdmin.methods.up')}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" className="tap h-7 w-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={t('cashAdmin.methods.down')}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <span className={cn('h-10 w-10 shrink-0 rounded-xl flex items-center justify-center', r.enabled ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-muted')}>
                  {cash ? <Banknote className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  {editing === r.key || (!r.builtin && !r.id && !r.label) ? (
                    <div className="flex items-center gap-2">
                      <input
                        data-ui="input"
                        autoFocus
                        value={r.label ?? ''}
                        placeholder={fallback}
                        maxLength={40}
                        aria-label={t('cashAdmin.methods.label')}
                        onChange={(e) => update((rs) => rs.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))}
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null) }}
                        className={controlClass({})}
                      />
                      <IconButton icon={<Check />} label={t('common.confirm')} variant="soft" onClick={() => setEditing(null)} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="min-w-0">
                        <p className={cn('text-sm font-semibold truncate', r.enabled ? 'text-ink' : 'text-muted')}>{r.label?.trim() || fallback}</p>
                        {(!r.builtin || r.label) && (
                          <p className="text-xs text-muted truncate">
                            {r.builtin ? paymentMethodLabel(r.id, lang) : t('cashAdmin.methods.custom')}
                          </p>
                        )}
                      </div>
                      <IconButton icon={<Pencil />} label={t('cashAdmin.methods.rename')} variant="ghost" size="sm" onClick={() => setEditing(r.key)} />
                    </div>
                  )}
                </div>
                {cash ? (
                  <Badge variant="success">{t('cashAdmin.methods.alwaysOn')}</Badge>
                ) : (
                  <Toggle
                    size="md"
                    checked={r.enabled}
                    onChange={(v) => update((rs) => rs.map((x) => (x.key === r.key ? { ...x, enabled: v } : x)))}
                  />
                )}
                {!r.builtin && (
                  <IconButton icon={<Trash2 />} label={t('common.remove')} variant="ghost" onClick={() => update((rs) => rs.filter((x) => x.key !== r.key))} />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="px-4 py-3 border-t border-line flex items-center justify-end gap-3">
        <Button
          size="sm"
          variant="soft"
          className="shrink-0 whitespace-nowrap"
          icon={<Plus className="h-4 w-4" />}
          disabled={!rows || rows.length >= 20}
          onClick={() => update((rs) => [...rs, { id: '', key: `new-${Date.now()}`, enabled: true, builtin: false, label: '' }])}
        >
          {t('cashAdmin.methods.add')}
        </Button>
      </div>
    </Card>
  )
}
