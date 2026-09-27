import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import { controlClass } from '../../../components/ui/Field'
import { cn } from '../../../components/ui/cn'
import { StepLayout } from '../parts/StepLayout'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

// controlClass is w-full: the sized wrapper sets each time field (fits "08:00 AM" + picker icon).
const timeClass = controlClass({ className: 'num text-center' })

export function WorkSchedule({ data, updateData }: Props) {
  const { t } = useTranslation()

  const statusOptions = [
    { value: 'full', label: t('setup.schedule.fullDay') },
    { value: 'half', label: t('setup.schedule.halfDay') },
    { value: 'closed', label: t('setup.schedule.closed') }
  ]

  const updateDay = (
    dayIndex: number,
    field: string,
    value: string | null
  ) => {
    const updated = [...data.schedule]
    updated[dayIndex] = { ...updated[dayIndex], [field]: value }
    updateData({ schedule: updated })
  }

  return (
    <StepLayout icon={<CalendarClock />} title={t('setup.schedule.title')}>
      <ul className="space-y-2">
        {data.schedule.map((day, i) => {
          const closed = day.status === 'closed'
          const dayName = t(`days.${day.day_of_week}`)
          return (
            <li
              key={i}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line px-3 py-2',
                closed ? 'bg-surface-2' : 'bg-surface'
              )}
            >
              <span className={cn('w-24 shrink-0 truncate text-base font-semibold', closed ? 'text-muted' : 'text-ink')}>
                {dayName}
              </span>

              <SegmentedControl
                value={day.status}
                onChange={(value) => updateDay(i, 'status', value)}
                options={statusOptions}
                ariaLabel={dayName}
              />

              {/* Closed days: the segmented control already says so, no times to show */}
              {!closed && (
                // ms-auto on an outer box (page direction); the clock times inside read LTR in every language.
                <div className="ms-auto">
                  <div dir="ltr" className="flex items-center gap-2">
                    <div className="w-[9.25rem]">
                      <input
                        type="time"
                        data-ui="input"
                        aria-label={`${dayName} · ${t('setup.schedule.openTime')}`}
                        value={day.open_time || '08:00'}
                        onChange={(e) => updateDay(i, 'open_time', e.target.value)}
                        className={timeClass}
                      />
                    </div>
                    <span className="text-muted" aria-hidden>–</span>
                    <div className="w-[9.25rem]">
                      <input
                        type="time"
                        data-ui="input"
                        aria-label={`${dayName} · ${t('setup.schedule.closeTime')}`}
                        value={day.close_time || (day.status === 'half' ? '14:00' : '23:00')}
                        onChange={(e) => updateDay(i, 'close_time', e.target.value)}
                        className={timeClass}
                      />
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </StepLayout>
  )
}
