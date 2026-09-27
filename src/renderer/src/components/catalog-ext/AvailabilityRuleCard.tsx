import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Moon, Trash2 } from 'lucide-react'
import { IconButton, Toggle, cn } from '../ui'
import { ALL_WEEKDAYS, timeToMinutes, type AvailabilityRule } from '../../../../shared/availability'
import { algiersDate } from './catalog-ext-helpers'

/** One availability window inside the AvailabilityEditor (days, from/to, optional date range). */
interface Props {
  rule: AvailabilityRule
  index: number
  onChange: (rule: AvailabilityRule) => void
  onRemove: () => void
}

/** Saturday-first week (Algeria's week starts on Saturday). */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]

const chip = (active: boolean): string => cn(
  'tap min-h-10 min-w-[3.25rem] rounded-full px-3 text-sm font-semibold border transition-colors',
  active ? 'bg-primary-soft text-primary-ink border-transparent' : 'bg-surface text-ink-2 border-line-strong hover:bg-surface-3'
)

const field = 'min-h-11 rounded-xl border bg-surface dark:bg-surface-2 px-3 text-base text-ink num focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50'

/** "1130" / "11h30" / "9" → "11:30" / "09:00"; null when it is not a time. */
function normalizeTime(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  const [hh, mm] = digits.length <= 2 ? [digits, '00'] : digits.length === 3 ? [digits.slice(0, 1), digits.slice(1)] : [digits.slice(0, 2), digits.slice(2, 4)]
  const value = `${hh.padStart(2, '0')}:${mm}`
  return timeToMinutes(value) === null ? null : value
}

/** 24-hour, Latin-digit time field (the native time input follows the Windows locale: AM/PM). */
function TimeField({ label, value, disabled, onChange }: { label: string; value: string | null; disabled: boolean; onChange: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  const invalid = draft.trim() !== '' && normalizeTime(draft) === null
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted">
      {label}
      <input
        data-ui="input"
        dir="ltr"
        inputMode="numeric"
        placeholder="11:30"
        maxLength={5}
        value={draft}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = normalizeTime(draft)
          if (next) { setDraft(next); onChange(next) }
        }}
        className={cn(field, 'w-28 text-center font-semibold', invalid ? 'border-danger' : 'border-line-strong')}
      />
    </label>
  )
}

export function AvailabilityRuleCard({ rule, index, onChange, onRemove }: Props) {
  const { t } = useTranslation()
  const every = rule.weekdays.length === 0 || rule.weekdays.length === 7
  const allDay = !rule.start_time && !rule.end_time
  const start = timeToMinutes(rule.start_time)
  const end = timeToMinutes(rule.end_time)
  const overnight = start !== null && end !== null && end < start
  const hasDates = rule.start_date !== null || rule.end_date !== null
  const set = (patch: Partial<AvailabilityRule>): void => onChange({ ...rule, ...patch })

  const toggleDay = (day: number): void => {
    const current = every ? ALL_WEEKDAYS : rule.weekdays
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    set({ weekdays: next.length === 7 ? [] : next })
  }

  return (
    <div className={cn('rounded-2xl border border-line bg-surface-2 p-4 space-y-4', !rule.is_active && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          data-ui="input"
          value={rule.label ?? ''}
          maxLength={60}
          aria-label={t('channels.availability.label')}
          placeholder={t('channels.availability.window', { n: index + 1 })}
          onChange={(event) => set({ label: event.target.value || null })}
          className={cn(field, 'border-line-strong flex-1 min-w-[10rem] font-semibold')}
        />
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2 cursor-pointer">
          <Toggle size="md" checked={rule.is_active} onChange={(value) => set({ is_active: value })} />
          {t('channels.availability.active')}
        </label>
        <IconButton icon={<Trash2 />} variant="danger" size="md" label={t('channels.availability.remove')} onClick={onRemove} />
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-2">{t('channels.availability.days')}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={every} className={chip(every)} onClick={() => set({ weekdays: [] })}>
            {t('channels.availability.everyDay')}
          </button>
          {WEEK_ORDER.map((day) => (
            <button key={day} type="button" aria-pressed={!every && rule.weekdays.includes(day)}
              className={chip(!every && rule.weekdays.includes(day))} onClick={() => toggleDay(day)}>
              {t(`channels.availability.wd${day}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <TimeField label={t('channels.availability.from')} value={rule.start_time} disabled={allDay} onChange={(value) => set({ start_time: value })} />
        <TimeField label={t('channels.availability.to')} value={rule.end_time} disabled={allDay} onChange={(value) => set({ end_time: value })} />
        <button type="button" aria-pressed={allDay} className={chip(allDay)}
          onClick={() => set(allDay ? { start_time: '11:00', end_time: '15:00' } : { start_time: null, end_time: null })}>
          {t('channels.availability.allDay')}
        </button>
        {overnight && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft text-info-ink px-3 min-h-9 text-[13px] font-medium">
            <Moon className="h-4 w-4" /> {t('channels.availability.overnight')}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <button type="button" aria-pressed={hasDates} className={cn(chip(hasDates), 'inline-flex items-center gap-2')}
          onClick={() => set(hasDates ? { start_date: null, end_date: null } : { start_date: algiersDate(new Date()), end_date: null })}>
          <CalendarRange className="h-4 w-4" /> {t('channels.availability.dateRange')}
        </button>
        {hasDates && (
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              {t('channels.availability.startDate')}
              <input type="date" dir="ltr" className={cn(field, 'border-line-strong')} value={rule.start_date ?? ''}
                onChange={(event) => set({ start_date: event.target.value || null })} />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              {t('channels.availability.endDate')}
              <input type="date" dir="ltr" className={cn(field, 'border-line-strong')} value={rule.end_date ?? ''}
                onChange={(event) => set({ end_date: event.target.value || null })} />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
