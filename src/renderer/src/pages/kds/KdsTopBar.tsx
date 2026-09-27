import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChefHat, ChevronDown, ListChecks, RotateCcw, Volume2, VolumeX, WifiOff } from 'lucide-react'
import { Button, controlClass } from '../../components/ui'
import { cn } from '../../components/ui/cn'
import type { KdsStation, KdsStationFilter } from '../../../../shared/kds'

interface Props {
  station: KdsStationFilter
  stations: KdsStation[]
  onStation: (value: string) => void
  canRecall: boolean
  onRecall: () => void
  showAllDay: boolean
  onToggleAllDay: () => void
  soundOn: boolean
  onToggleSound: () => void
  failed: boolean
  openCount: number | null
  clock: string
}

/** Kitchen top bar: station picker, recall, all-day + sound toggles, live dot, open count, clock. */
export function KdsTopBar(props: Props) {
  const { t } = useTranslation()
  const { station, stations, onStation, canRecall, onRecall, showAllDay, onToggleAllDay, soundOn, onToggleSound } = props
  return (
    <header className="flex min-h-[4.5rem] shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5 xl:gap-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ember shadow-glow">
          <ChefHat className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="hidden whitespace-nowrap text-xl font-extrabold text-ink 2xl:block">{t('kds.title')}</h1>
      </div>
      <div className="relative w-56 max-w-full">
        <select
          data-ui="select"
          value={String(station)}
          onChange={(event) => onStation(event.target.value)}
          aria-label={t('kds.station')}
          className={controlClass({ size: 'lg', className: 'cursor-pointer appearance-none truncate pe-11 font-bold' })}
        >
          <option value="all">{t('kds.expoView')}</option>
          {stations.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.id === 0 ? t('kds.expo') : entry.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>
      <Button
        variant="secondary"
        size="lg"
        icon={<RotateCcw className="h-5 w-5 rtl:-scale-x-100" />}
        disabled={!canRecall}
        onClick={onRecall}
        title={t('kds.recall')}
        aria-label={t('kds.recall')}
        className="font-bold"
      >
        <span className="hidden xl:inline">{t('kds.recall')}</span>
      </Button>
      <ToggleChip pressed={showAllDay} onClick={onToggleAllDay} icon={<ListChecks className="h-5 w-5" />} label={t('kds.allDay')} />
      <ToggleChip
        pressed={soundOn}
        onClick={onToggleSound}
        icon={soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        label={t('kds.sound')}
      />
      <span className="flex-1" />
      {props.openCount != null && props.openCount > 0 && (
        <span className="num whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-base font-bold text-ink-2">
          {t('kds.openCount', { n: props.openCount })}
        </span>
      )}
      <LiveDot failed={props.failed} />
      <span className="num min-w-[5.5rem] text-end text-3xl font-extrabold text-ink">{props.clock}</span>
    </header>
  )
}

/** Pressed = ember tint; released = neutral. aria-pressed carries the state; label is icon + tooltip below xl. */
function ToggleChip({ pressed, onClick, icon, label }: { pressed: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'tap inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl border px-3 text-base font-bold xl:px-4',
        pressed ? 'border-primary/40 bg-primary-soft text-primary-ink' : 'border-line-strong bg-surface-2 text-muted'
      )}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}

/** The only infinite animation on the screen: the live dot. Offline = static red + icon + word. */
function LiveDot({ failed }: { failed: boolean }) {
  const { t } = useTranslation()
  return failed ? (
    <span role="status" title={t('kds.offline')} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-danger-soft px-3 py-1.5 text-sm font-bold text-danger-ink">
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span className="hidden xl:inline">{t('kds.offline')}</span>
    </span>
  ) : (
    <span role="status" title={t('kds.live')} className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-bold text-success-ink">
      <i className="inline-block h-3 w-3 rounded-full bg-success animate-pulse-soft" aria-hidden="true" />
      <span className="hidden xl:inline">{t('kds.live')}</span>
    </span>
  )
}
