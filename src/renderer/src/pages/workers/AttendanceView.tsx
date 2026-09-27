import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton, Money, cn, controlClass, toast } from '../../components/ui'
import { localToday } from '../../utils/localDate'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { roleMeta, type Worker } from './workerRoles'

type Shift = 'full' | 'half' | 'absent'
const SHIFTS: Shift[] = ['full', 'half', 'absent']
const SHIFT_STYLE: Record<Shift, string> = {
  full: 'bg-success-soft text-success-ink shadow-e1',
  half: 'bg-warning-soft text-warning-ink shadow-e1',
  absent: 'bg-danger-soft text-danger-ink shadow-e1'
}

interface AttendanceViewProps {
  workers: Worker[]
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** One day's attendance: full / half / absent per worker, pay of the day, schedule status. */
export function AttendanceView({ workers }: AttendanceViewProps) {
  const { t } = useTranslation()
  // Local day: with the UTC day, attendance marked between 00:00 and 01:00 local was written to
  // (and could overwrite) the PREVIOUS day's row.
  const [date, setDate] = useState(localToday())
  const [attendance, setAttendance] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [att, sched] = await Promise.all([window.api.workers.getAttendance(date), window.api.settings.getSchedule()])
      setSchedule(sched)
      // Auto-fill from the opening schedule for a day without any record (v3 behaviour).
      if (att.length === 0 && workers.length > 0) {
        const daySchedule = sched.find((s: any) => s.day_of_week === new Date(`${date}T00:00:00`).getDay())
        if (daySchedule && daySchedule.status !== 'closed') {
          const shift = daySchedule.status === 'half' ? 'half' : 'full'
          for (const worker of workers) {
            await window.api.workers.setAttendance(worker.id, date, shift, shift === 'full' ? worker.pay_full_day : worker.pay_half_day)
          }
          setAttendance(await window.api.workers.getAttendance(date))
          return
        }
      }
      setAttendance(att)
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('workers.errors.loadFailed')))
    }
  }, [date, workers, t])

  useEffect(() => {
    void load()
  }, [load])

  const mark = async (worker: Worker, shift: Shift) => {
    setBusy(worker.id)
    try {
      const pay = shift === 'full' ? worker.pay_full_day : shift === 'half' ? worker.pay_half_day : 0
      await window.api.workers.setAttendance(worker.id, date, shift, pay)
      setAttendance(await window.api.workers.getAttendance(date))
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('workers.errors.saveFailed')))
    } finally {
      setBusy(null)
    }
  }

  const daySched = schedule.find((s: any) => s.day_of_week === new Date(`${date}T00:00:00`).getDay())
  const present = attendance.filter((a) => a.shift_type !== 'absent' && workers.some((w) => w.id === a.worker_id))
  const totalPay = present.reduce((sum, a) => sum + (Number(a.pay_amount) || 0), 0)
  const schedTone = daySched?.status === 'closed' ? 'danger' : daySched?.status === 'half' ? 'warning' : 'success'
  const schedLabel = daySched?.status === 'closed' ? t('setup.schedule.closed') : daySched?.status === 'half' ? t('setup.schedule.halfDay') : t('setup.schedule.fullDay')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <IconButton size="lg" variant="secondary" icon={<ChevronLeft className="rtl:-scale-x-100" />} label={t('workers.prevDay')} onClick={() => setDate(shiftDate(date, -1))} />
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={controlClass({ className: 'w-44 num' })} data-ui="input" aria-label={t('workers.date')} />
          <IconButton size="lg" variant="secondary" icon={<ChevronRight className="rtl:-scale-x-100" />} label={t('workers.nextDay')} onClick={() => setDate(shiftDate(date, 1))} />
        </div>
        {date !== localToday() && <Button variant="ghost" size="lg" onClick={() => setDate(localToday())}>{t('workers.today')}</Button>}
        {daySched && (
          <Badge variant={schedTone} size="md" icon={<CalendarDays />}>
            {t('workers.scheduleStatus')}: {schedLabel}
            {daySched.status !== 'closed' && <bdi dir="ltr" className="num"> ({daySched.open_time} – {daySched.close_time})</bdi>}
          </Badge>
        )}
        <div className="ms-auto flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-2">
          <div>
            <p className="text-xs text-muted">{t('workers.presentToday')}</p>
            <p className="num text-lg font-extrabold text-ink">{present.length} / {workers.length}</p>
          </div>
          <div className="h-8 w-px bg-line" />
          <div>
            <p className="text-xs text-muted">{t('workers.payToday')}</p>
            <p className="text-lg font-extrabold text-ink"><Money value={totalPay} decimals={0} /></p>
          </div>
        </div>
      </div>

      {workers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<Users />} title={t('workers.noWorkers')} description={t('workers.emptyBody')} />
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-line shadow-e1 overflow-hidden divide-y divide-line">
          {workers.map((worker) => {
            const record = attendance.find((a) => a.worker_id === worker.id)
            const meta = roleMeta(worker.role)
            const Icon = meta.icon
            return (
              <div key={worker.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', record?.shift_type === 'absent' && 'bg-surface-2/60')}>
                <span className={cn('h-11 w-11 shrink-0 rounded-xl flex items-center justify-center', meta.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-semibold text-ink">{worker.name}</p>
                  <p className="text-xs text-muted">{t(`workers.roles.${worker.role}`, { defaultValue: worker.role })}</p>
                </div>
                <div className="w-24 text-end text-sm font-semibold text-ink-2">
                  {record && record.shift_type !== 'absent' ? <Money value={Number(record.pay_amount) || 0} decimals={0} /> : '—'}
                </div>
                <div role="radiogroup" aria-label={worker.name} className="inline-flex p-1 gap-1 rounded-xl bg-surface-2 border border-line">
                  {SHIFTS.map((s) => {
                    const active = record?.shift_type === s
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={busy !== null}
                        onClick={() => !active && void mark(worker, s)}
                        className={cn(
                          'tap min-h-11 px-4 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 disabled:cursor-wait',
                          active ? SHIFT_STYLE[s] : 'text-muted hover:text-ink hover:bg-surface/60'
                        )}
                      >
                        {active && <Check className="h-4 w-4" />}
                        {t(`workers.shifts.${s}`)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
