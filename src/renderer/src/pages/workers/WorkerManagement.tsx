import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, CalendarCheck, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Money, PageHeader, Skeleton, Tabs, cn, toast } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { useFoodName } from '../menu/catalogShared'
import type { CategoryRow } from '../menu/menuTypes'
import { AttendanceView } from './AttendanceView'
import { WorkerForm } from './WorkerForm'
import { ROLES, roleMeta, type Worker } from './workerRoles'

type Tab = 'team' | 'attendance'

export function WorkerManagement() {
  const { t } = useTranslation()
  const getName = useFoodName()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('team')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [form, setForm] = useState<{ worker: Worker | null; key: number } | null>(null)
  const [confirm, setConfirm] = useState<Worker | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [w, c] = await Promise.all([window.api.workers.getAll(), window.api.categories.getAll()])
      setWorkers(w)
      setCategories(c)
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('workers.errors.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const remove = async () => {
    if (!confirm || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await window.api.workers.delete(confirm.id)
      toast.success(t('workers.deleted', { name: confirm.name }))
      setConfirm(null)
      await loadData()
    } catch (err) {
      setDeleteError(ipcErrorMessage(err, t('workers.errors.saveFailed')))
    } finally {
      setDeleting(false)
    }
  }

  const counts = new Map<string, number>()
  for (const w of workers) counts.set(w.role, (counts.get(w.role) ?? 0) + 1)
  const shown = roleFilter === 'all' ? workers : workers.filter((w) => w.role === roleFilter)
  const drivers = counts.get('driver') ?? 0

  return (
    <div>
      <PageHeader
        icon={<Users />}
        title={t('workers.page.title')}
        subtitle={t('workers.page.subtitle', { count: workers.length })}
        actions={
          <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setForm({ worker: null, key: Date.now() })}>
            {t('workers.addWorker')}
          </Button>
        }
      />
      <Tabs<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'team', label: t('workers.team'), icon: <Users />, count: workers.length },
          { id: 'attendance', label: t('workers.attendance'), icon: <CalendarCheck /> }
        ]}
      />

      {tab === 'attendance' ? (
        <AttendanceView workers={workers} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs<string>
              variant="pills"
              value={roleFilter}
              onChange={setRoleFilter}
              tabs={[
                { id: 'all', label: t('common.all'), count: workers.length },
                ...ROLES.filter((r) => counts.get(r.role)).map((r) => ({ id: r.role, label: t(`workers.roles.${r.role}`), count: counts.get(r.role) }))
              ]}
            />
            {drivers === 0 && workers.length > 0 && (
              <p className="ms-auto flex items-center gap-2 text-xs font-semibold text-muted">
                <Bike className="h-4 w-4" />
                {t('workers.noDrivers')}
              </p>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
          ) : shown.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line-strong bg-surface">
              <EmptyState
                icon={<Users />}
                title={t('workers.noWorkers')}
                description={t('workers.emptyBody')}
                action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ worker: null, key: Date.now() })}>{t('workers.addWorker')}</Button>}
              />
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
              {shown.map((worker) => {
                const meta = roleMeta(worker.role)
                const Icon = meta.icon
                const stations = (worker.category_ids ?? []).map((id) => categories.find((c) => c.id === id)).filter(Boolean) as CategoryRow[]
                return (
                  <article key={worker.id} className="contain-card rounded-2xl border border-line bg-surface shadow-e1 flex flex-col">
                    <div className="flex items-start gap-3 p-4">
                      <span className={cn('h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center', meta.tone)}>
                        <Icon className="h-7 w-7" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-ink truncate">{worker.name}</p>
                        <Badge variant="neutral" className="mt-1">{t(`workers.roles.${worker.role}`, { defaultValue: worker.role })}</Badge>
                      </div>
                      <IconButton icon={<Pencil />} label={t('common.edit')} onClick={() => setForm({ worker, key: Date.now() })} />
                      <IconButton icon={<Trash2 />} variant="danger" label={t('common.delete')} onClick={() => { setDeleteError(''); setConfirm(worker) }} />
                    </div>
                    <dl className="grid grid-cols-2 gap-px bg-line border-y border-line text-sm">
                      <div className="bg-surface px-4 py-2">
                        <dt className="text-xs text-muted">{t('workers.payFullDay')}</dt>
                        <dd className="font-bold text-ink"><Money value={worker.pay_full_day} decimals={0} /></dd>
                      </div>
                      <div className="bg-surface px-4 py-2">
                        <dt className="text-xs text-muted">{t('workers.payHalfDay')}</dt>
                        <dd className="font-bold text-ink"><Money value={worker.pay_half_day} decimals={0} /></dd>
                      </div>
                    </dl>
                    <div className="px-4 py-3 flex-1 space-y-2 text-sm">
                      {worker.phone && (
                        <p className="flex items-center gap-2 text-ink-2">
                          <Phone className="h-4 w-4 text-muted" />
                          <bdi dir="ltr" className="num">{worker.phone}</bdi>
                        </p>
                      )}
                      {worker.role === 'cook' && (
                        <div className="flex flex-wrap gap-1.5">
                          {stations.map((cat) => (
                            <span key={cat.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 border border-line px-2 py-1 text-xs font-semibold text-ink-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(cat.id) }} />
                              {getName(cat)}
                            </span>
                          ))}
                          {stations.length === 0 && <span className="text-xs font-semibold text-warning-ink">{t('workers.noStations')}</span>}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {form && <WorkerForm key={form.key} worker={form.worker} categories={categories} onClose={() => setForm(null)} onSaved={loadData} />}
      <ConfirmDialog
        isOpen={!!confirm}
        title={t('workers.deleteTitle')}
        message={confirm ? t('workers.deleteConfirm', { name: confirm.name }) : ''}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={deleting}
        error={deleteError}
      />
    </div>
  )
}
