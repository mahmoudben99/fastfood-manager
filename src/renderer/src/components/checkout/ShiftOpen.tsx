import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LockOpen, User } from 'lucide-react'
import { Button, Money, cn, toast } from '../ui'
import { AmountDisplay, Numpad, SideKey, keepFocus, useNumpadKeys } from './Numpad'
import { errorText, hasToken } from './methods'
import { useShiftStore } from './shiftStore'
import { applyKey } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'

interface Worker { id: number; name: string; is_active?: number }

const FLOATS = [0, 2000, 5000, 10000]

/** Open a shift: cashier (a worker or a typed name) + opening float counted into the drawer. */
export function ShiftOpen({ active = true }: { active?: boolean }) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const refresh = useShiftStore((s) => s.refresh)
  const setShift = useShiftStore((s) => s.setShift)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [workerId, setWorkerId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [entry, setEntry] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.workers.getAll()
      .then((rows: Worker[]) => setWorkers((rows ?? []).filter((row) => row.is_active !== 0)))
      .catch(() => setWorkers([]))
  }, [])

  const ready = (workerId !== null || name.trim().length > 0) && !busy
  const open = async (): Promise<void> => {
    if (!ready) return
    setBusy(true)
    try {
      const shift = await window.api.shifts.open({
        ...(workerId !== null ? { cashier_worker_id: workerId } : { cashier_name: name.trim() }),
        opening_float: Number(entry) || 0
      })
      setShift(shift)
      toast.success(t('checkout.shift.opened', { name: shift.cashier_name }))
    } catch (error) {
      if (hasToken(error, 'SHIFT_ALREADY_OPEN')) {
        toast.warning(t('checkout.shift.alreadyOpen'), { description: errorText(error, '') })
        await refresh()
      } else {
        toast.error(t('checkout.shift.openError'), { description: errorText(error, '') })
      }
    } finally {
      setBusy(false)
    }
  }

  useNumpadKeys(active && !busy, (key) => setEntry((value) => applyKey(value, key)), open, rootRef)

  return (
    <div ref={rootRef} className="grid gap-5 md:grid-cols-2" data-testid="shift-open">
      <div className="space-y-3 min-w-0">
        <p className="text-sm font-bold text-ink-2">{t('checkout.shift.cashier')}</p>
        {workers.length > 0 && (
          <div role="radiogroup" aria-label={t('checkout.shift.cashier')} className="flex flex-wrap gap-2">
            {workers.map((worker) => (
              <button
                key={worker.id}
                type="button"
                role="radio"
                aria-checked={workerId === worker.id}
                onClick={() => {
                  setWorkerId(worker.id)
                  setName('')
                }}
                className={cn(
                  'tap min-h-12 px-4 rounded-full border-2 text-sm font-semibold inline-flex items-center gap-2',
                  workerId === worker.id ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2 dark:bg-surface-2'
                )}
              >
                <User className="h-4 w-4" />
                {worker.name}
              </button>
            ))}
          </div>
        )}
        <input
          data-ui="input"
          maxLength={80}
          aria-label={t('checkout.shift.cashier')}
          placeholder={workers.length > 0 ? t('checkout.shift.otherName') : t('checkout.shift.cashier')}
          className="w-full min-h-12 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          {...kb.field('cashier', name, (value) => {
            setName(value)
            if (value) setWorkerId(null)
          })}
        />
      </div>
      <div className="space-y-3 min-w-0">
        <AmountDisplay label={t('checkout.shift.float')} entry={entry} placeholder={0} />
        <div className="grid grid-cols-4 gap-2">
          {FLOATS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setEntry(value ? String(value) : '')}
              onMouseDown={keepFocus}
              data-passive
              className={cn(
                'tap min-h-12 rounded-xl border-2 text-base font-bold',
                (Number(entry) || 0) === value ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface-2 text-ink hover:bg-surface-3'
              )}
            >
              <Money value={value} decimals={0} />
            </button>
          ))}
        </div>
        <Numpad
          size="md"
          disabled={busy}
          onKey={(key) => setEntry((value) => applyKey(value, key))}
          side={<SideKey tone="danger" onClick={() => setEntry('')} label={t('checkout.pad.clear')}>C</SideKey>}
        />
        <Button size="touch" fullWidth icon={<LockOpen className="h-6 w-6" />} onClick={open} disabled={!ready} loading={busy} cooldownMs={800}>
          {t('checkout.shift.open')}
        </Button>
      </div>
      {kb.keyboard}
    </div>
  )
}
