import { useTranslation } from 'react-i18next'
import { Moon } from 'lucide-react'
import { Badge, Card, SegmentedControl } from '../../../components/ui'
import { SaveBar } from '../SettingsFeedback'
import type { ScheduleSettings } from '../hooks/useScheduleSettings'

type DayStatus = 'full' | 'half' | 'closed'

/** Settings > Schedule: one row per weekday (full / half day / closed + opening hours). */
export function ScheduleSection({ schedule }: { schedule: ScheduleSettings }) {
  const { t } = useTranslation()
  // Not controlClass(): it carries w-full, and cn() does not merge conflicting widths.
  const timeClass =
    'num h-11 w-[8.25rem] shrink-0 rounded-xl border border-line-strong bg-surface px-2.5 text-center text-[15px] text-ink ' +
    'dark:bg-surface-2 hover:border-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15'

  return (
    <div>
      <Card padding={false}>
        <ul className="divide-y divide-line">
          {schedule.schedule.map((day, i) => {
            const status = (day.status as DayStatus) || 'full'
            const closed = status === 'closed'
            return (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5">
                <div className="w-28 shrink-0">
                  <p className={closed ? 'font-semibold text-muted' : 'font-semibold text-ink'}>
                    {t(`days.${day.day_of_week}`)}
                  </p>
                </div>
                <SegmentedControl<DayStatus>
                  size="md"
                  ariaLabel={t(`days.${day.day_of_week}`)}
                  value={status}
                  onChange={(v) => schedule.updateDay(i, 'status', v)}
                  options={[
                    { value: 'full', label: t('setup.schedule.fullDay') },
                    { value: 'half', label: t('setup.schedule.halfDay') },
                    { value: 'closed', label: t('setup.schedule.closed') }
                  ]}
                />
                <div className="ms-auto flex items-center gap-2">
                  {closed ? (
                    <Badge variant="neutral" size="md" icon={<Moon />}>
                      {t('setup.schedule.closed')}
                    </Badge>
                  ) : (
                    <>
                      <input
                        type="time"
                        data-ui="input"
                        dir="ltr"
                        aria-label={t('settings.v4.opensAt')}
                        value={day.open_time || '08:00'}
                        onChange={(e) => schedule.updateDay(i, 'open_time', e.target.value)}
                        className={timeClass}
                      />
                      <span className="text-muted" aria-hidden="true">
                        –
                      </span>
                      <input
                        type="time"
                        data-ui="input"
                        dir="ltr"
                        aria-label={t('settings.v4.closesAt')}
                        value={day.close_time || '23:00'}
                        onChange={(e) => schedule.updateDay(i, 'close_time', e.target.value)}
                        className={timeClass}
                      />
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <SaveBar
        dirty={schedule.isDirty}
        saving={schedule.saving}
        error={schedule.error}
        onSave={() => { void schedule.save() }}
        onDiscard={schedule.discard}
      />
    </div>
  )
}
