import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipcErrorMessage } from '../../../utils/ipcError'

export interface ScheduleDay {
  day_of_week: number | string
  status: 'full' | 'half' | 'closed' | string
  open_time?: string | null
  close_time?: string | null
  [key: string]: unknown
}

/** Settings > Schedule: weekly opening hours (work_schedule rows). */
export function useScheduleSettings(onSaved: () => void) {
  const { t } = useTranslation()
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('[]')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const sched = (await window.api.settings.getSchedule()) as ScheduleDay[]
    setSchedule(sched)
    setSavedSnapshot(JSON.stringify(sched))
  }, [])

  const updateDay = (index: number, field: string, value: string | null) => {
    setSchedule((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)))
  }

  const save = async (): Promise<boolean> => {
    setError('')
    setSaving(true)
    try {
      await window.api.settings.setSchedule(schedule)
      setSavedSnapshot(JSON.stringify(schedule))
      onSaved()
      return true
    } catch (err) {
      console.error('Failed to save schedule:', err)
      setError(t('settings.saveFailed', { error: ipcErrorMessage(err) }))
      return false
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setSchedule(JSON.parse(savedSnapshot))
    setError('')
  }

  return {
    schedule,
    load,
    updateDay,
    save,
    discard,
    saving,
    error,
    isDirty: JSON.stringify(schedule) !== savedSnapshot
  }
}

export type ScheduleSettings = ReturnType<typeof useScheduleSettings>
