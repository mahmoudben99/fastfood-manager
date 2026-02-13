import { useTranslation } from 'react-i18next'
import { Select } from '../../../components/ui/Select'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.schedule.title')}</h2>
        <p className="text-gray-500 mt-1">{t('setup.schedule.subtitle')}</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        {data.schedule.map((day, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg ${
              day.status === 'closed' ? 'bg-gray-50 opacity-60' : 'bg-white'
            }`}
          >
            <div className="w-28 font-medium text-gray-700 text-sm shrink-0">
              {t(`days.${day.day_of_week}`)}
            </div>

            <Select
              value={day.status}
              onChange={(e) => updateDay(i, 'status', e.target.value)}
              options={statusOptions}
              className="w-36"
            />

            {day.status !== 'closed' && (
              <>
                <input
                  type="time"
                  value={day.open_time || '08:00'}
                  onChange={(e) => updateDay(i, 'open_time', e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-sm"
                />
                <span className="text-gray-400 text-sm">-</span>
                <input
                  type="time"
                  value={day.close_time || (day.status === 'half' ? '14:00' : '23:00')}
                  onChange={(e) => updateDay(i, 'close_time', e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-sm"
                />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
