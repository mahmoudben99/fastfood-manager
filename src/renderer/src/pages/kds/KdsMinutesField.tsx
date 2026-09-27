import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'
import { IconButton, controlClass } from '../../components/ui'

const MIN = 1
const MAX = 240
const clamp = (value: number): number => Math.min(MAX, Math.max(MIN, Math.round(value) || MIN))

/** Whole-minute setting with 48px −/+ steppers (no keyboard needed on a touch PC). */
export function KdsMinutesField({ label, icon, value, onChange }: {
  label: string
  icon?: ReactNode
  value: number
  onChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
      <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-ink-2">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-2">
        <IconButton
          icon={<Minus />}
          label={t('kds.decrease')}
          variant="secondary"
          size="lg"
          disabled={value <= MIN}
          onClick={() => onChange(clamp(value - 1))}
        />
        <div className="w-20">
          <input
            id={id}
            data-ui="input"
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={value}
            onChange={(event) => onChange(clamp(Number(event.target.value)))}
            className={controlClass({ size: 'lg', className: 'num text-center font-bold' })}
          />
        </div>
        <IconButton
          icon={<Plus />}
          label={t('kds.increase')}
          variant="secondary"
          size="lg"
          disabled={value >= MAX}
          onClick={() => onChange(clamp(value + 1))}
        />
        <span className="w-10 text-sm text-muted">{t('kds.minutesShort')}</span>
      </div>
    </div>
  )
}
