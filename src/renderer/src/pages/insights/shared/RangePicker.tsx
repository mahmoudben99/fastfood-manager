import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange } from 'lucide-react'
import { Button, SegmentedControl } from '../../../components/ui'
import { addDays, today } from './format'

export type RangePreset = '7d' | '30d' | '90d' | 'custom'

export interface DateRange {
  start: string
  end: string
}

export interface RangeValue {
  preset: RangePreset
  range: DateRange
}

const DAYS: Record<Exclude<RangePreset, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** Last N days including today. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, end = today()): DateRange {
  return { start: addDays(end, -(DAYS[preset] - 1)), end }
}

export function initialRange(preset: Exclude<RangePreset, 'custom'>): RangeValue {
  return { preset, range: presetRange(preset) }
}

interface RangePickerProps {
  value: RangeValue
  onChange: (value: RangeValue) => void
  /** Presets to offer (default 7/30/90 days). */
  presets?: Exclude<RangePreset, 'custom'>[]
  /** Label key per preset override, e.g. { '30d': 'insights.range.4w' }. */
  labels?: Partial<Record<Exclude<RangePreset, 'custom'>, string>>
}

/** Period presets + a custom from/to pair (validated: from ≤ to, ≤ 366 days, not in the future). */
export function RangePicker({ value, onChange, presets = ['7d', '30d', '90d'], labels = {} }: RangePickerProps) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(value.range.start)
  const [to, setTo] = useState(value.range.end)
  const max = today()
  const invalid = !from || !to || from > to || to > max || Date.parse(to) - Date.parse(from) > 366 * 86_400_000

  const options = [
    ...presets.map((p) => ({ value: p as RangePreset, label: t(labels[p] ?? `insights.range.${p}`) })),
    { value: 'custom' as RangePreset, label: t('insights.range.custom'), icon: <CalendarRange /> }
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        ariaLabel={t('insights.range.label')}
        value={value.preset}
        onChange={(preset) => {
          if (preset === 'custom') onChange({ preset, range: value.range })
          else onChange({ preset, range: presetRange(preset) })
        }}
        options={options}
      />
      {value.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 animate-fade-in">
          <label className="flex items-center gap-2 text-sm text-muted">
            {t('insights.range.from')}
            <input
              type="date"
              data-ui="input"
              value={from}
              max={max}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-11 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-2.5 text-sm text-ink"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            {t('insights.range.to')}
            <input
              type="date"
              data-ui="input"
              value={to}
              max={max}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-11 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-2.5 text-sm text-ink"
            />
          </label>
          <Button variant="secondary" disabled={invalid} onClick={() => onChange({ preset: 'custom', range: { start: from, end: to } })}>
            {t('insights.range.apply')}
          </Button>
        </div>
      )}
    </div>
  )
}
