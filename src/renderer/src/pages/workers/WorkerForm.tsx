import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Button, Input, Modal, cn, toast } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { CurrencyTag, InlineNotice, SectionLabel, parseAmount, useFoodName, useTouchKeyboard } from '../menu/catalogShared'
import type { CategoryRow } from '../menu/menuTypes'
import { ROLES, type Worker, type WorkerRole } from './workerRoles'

interface WorkerFormProps {
  worker: Worker | null
  categories: CategoryRow[]
  onClose: () => void
  onSaved: () => Promise<unknown>
}

/** Add / edit a worker: role tiles (kitchen station, cashier, server, driver…), pay, stations. */
export function WorkerForm({ worker, categories, onClose, onSaved }: WorkerFormProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [name, setName] = useState(worker?.name ?? '')
  const [role, setRole] = useState<string>(worker?.role ?? 'cook')
  const [payFull, setPayFull] = useState(worker ? String(worker.pay_full_day) : '')
  const [payHalf, setPayHalf] = useState(worker ? String(worker.pay_half_day) : '')
  const [phone, setPhone] = useState(worker?.phone ?? '')
  const [stations, setStations] = useState<number[]>(worker?.category_ids ?? [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleStation = (id: number) => setStations((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const known = ROLES.some((r) => r.role === role)

  const save = async () => {
    if (saving) return
    const full = parseAmount(payFull)
    const half = parseAmount(payHalf)
    if (!name.trim()) return setError(t('workers.errors.name'))
    if (!(full >= 0) || !(half >= 0)) return setError(t('workers.errors.pay'))
    setError('')
    setSaving(true)
    const data = {
      name: name.trim(),
      role,
      pay_full_day: full,
      pay_half_day: half,
      // '' clears a saved phone (the repository keeps the old value for undefined/null).
      phone: phone.trim(),
      category_ids: role === 'cook' ? stations : []
    }
    try {
      if (worker) await window.api.workers.update(worker.id, data)
      else await window.api.workers.create(data)
      toast.success(t('workers.saved', { name: data.name }))
      await onSaved()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t('workers.errors.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={false}
      size="xl"
      title={worker ? t('workers.editWorker') : t('workers.addWorker')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="lg" onClick={save} loading={saving} disabled={!name.trim() || !payFull.trim() || !payHalf.trim()}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('workers.name')} {...kb.bind(name, setName)} />
          <Input label={t('workers.phone')} inputMode="tel" dir="ltr" className="num text-start" {...kb.bind(phone, setPhone, 'numeric')} />
        </div>

        <section>
          <SectionLabel>{t('workers.role')}</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2" role="radiogroup" aria-label={t('workers.role')}>
            {(known ? ROLES : [...ROLES, { role: role as WorkerRole, icon: ROLES[5].icon, tone: ROLES[5].tone }]).map((meta) => {
              const active = meta.role === role
              const Icon = meta.icon
              return (
                <button
                  key={meta.role}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRole(meta.role)}
                  title={t(`workers.roleDesc.${meta.role}`, { defaultValue: '' })}
                  className={cn(
                    'tap relative min-h-16 rounded-2xl border-2 p-2.5 flex items-center gap-3 text-start',
                    active ? 'border-primary bg-primary-soft/50' : 'border-line bg-surface hover:border-line-strong dark:bg-surface-2'
                  )}
                >
                  <span className={cn('h-11 w-11 shrink-0 rounded-xl flex items-center justify-center', meta.tone)}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 font-bold text-ink leading-tight">{t(`workers.roles.${meta.role}`, { defaultValue: meta.role })}</span>
                  {active && (
                    <span className="absolute top-2 end-2 h-5 w-5 rounded-full bg-primary text-on-primary flex items-center justify-center">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {role === 'cook' && (
          <section>
            <SectionLabel>{t('workers.categories')}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const on = stations.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStation(cat.id)}
                    className={cn(
                      'tap min-h-12 rounded-xl border px-4 flex items-center gap-2 text-sm font-semibold',
                      on ? 'bg-primary-soft border-primary text-primary-ink' : 'bg-surface border-line-strong text-ink-2 hover:bg-surface-2 dark:bg-surface-2'
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(cat.id) }} />
                    {cat.icon && <span className="text-lg">{cat.icon}</span>}
                    {getName(cat)}
                    {on && <Check className="h-4 w-4" />}
                  </button>
                )
              })}
            </div>
            {stations.length === 0 && <p className="mt-2 text-xs text-warning-ink font-semibold">{t('workers.noStations')}</p>}
          </section>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('workers.payFullDay')} inputMode="decimal" className="num" trailing={<CurrencyTag />} {...kb.bind(payFull, setPayFull, 'numeric')} />
          <Input label={t('workers.payHalfDay')} inputMode="decimal" className="num" trailing={<CurrencyTag />} {...kb.bind(payHalf, setPayHalf, 'numeric')} />
        </section>
        {error && <InlineNotice>{error}</InlineNotice>}
      </div>
      {kb.keyboard}
    </Modal>
  )
}
