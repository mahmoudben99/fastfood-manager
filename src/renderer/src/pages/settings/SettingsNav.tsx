import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Database,
  LayoutGrid,
  LineChart,
  Palette,
  Printer,
  QrCode,
  Send,
  ShieldCheck,
  Store
} from 'lucide-react'
import { Tabs, cn } from '../../components/ui'

export type SectionId =
  | 'general'
  | 'schedule'
  | 'appearance'
  | 'printer'
  | 'remoteOrder'
  | 'ownerLink'
  | 'telegram'
  | 'security'
  | 'about'
  | 'data'
  | 'more'

interface NavItem {
  id: SectionId
  icon: ReactNode
  label: string
}

export const SECTION_IDS: SectionId[] = [
  'general',
  'schedule',
  'appearance',
  'printer',
  'remoteOrder',
  'ownerLink',
  'telegram',
  'security',
  'about',
  'data',
  'more'
]

/** `?tab=` value → section (unknown values fall back to General). */
export function parseSection(raw: string | null): SectionId {
  return raw && (SECTION_IDS as string[]).includes(raw) ? (raw as SectionId) : 'general'
}

interface SettingsNavProps {
  value: SectionId
  onChange: (id: SectionId) => void
  /** Sections with unsaved edits get a dot. */
  dirty: Partial<Record<SectionId, boolean>>
}

/** Section navigation: grouped vertical list on wide screens, scrollable pills on narrow ones. */
export function SettingsNav({ value, onChange, dirty }: SettingsNavProps) {
  const { t } = useTranslation()

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t('settings.v4.navRestaurant'),
      items: [
        { id: 'general', icon: <Store />, label: t('settings.general') },
        { id: 'schedule', icon: <CalendarClock />, label: t('settings.schedule') },
        { id: 'appearance', icon: <Palette />, label: t('settings.v4.appearance') }
      ]
    },
    {
      label: t('settings.v4.navDevices'),
      items: [
        { id: 'printer', icon: <Printer />, label: t('settings.v4.printers') },
        { id: 'remoteOrder', icon: <QrCode />, label: t('settings.remoteOrder') },
        { id: 'ownerLink', icon: <LineChart />, label: t('settings.ownerLink') },
        { id: 'telegram', icon: <Send />, label: t('settings.v4.telegramNav') }
      ]
    },
    {
      label: t('settings.v4.navSystem'),
      items: [
        { id: 'security', icon: <ShieldCheck />, label: t('settings.security') },
        { id: 'about', icon: <BadgeCheck />, label: t('settings.v4.about') },
        { id: 'data', icon: <Database />, label: t('settings.data') }
      ]
    }
  ]
  const more: NavItem = { id: 'more', icon: <LayoutGrid />, label: t('settings.more.title') }
  const flat = [...groups.flatMap((g) => g.items), more]

  const item = (it: NavItem) => {
    const active = it.id === value
    return (
      <button
        key={it.id}
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={() => onChange(it.id)}
        className={cn(
          'tap relative flex w-full min-h-10 items-center gap-3 rounded-xl px-3 text-start text-sm font-semibold',
          '[&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0',
          active ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
        )}
      >
        {active && <span className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-ember" aria-hidden="true" />}
        <span className={active ? 'text-primary-ink' : 'text-muted'}>{it.icon}</span>
        <span className="min-w-0 flex-1 truncate">{it.label}</span>
        {dirty[it.id] && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={t('settings.unsavedTitle')} />
        )}
        {it.id === 'more' && <ChevronRight className="rtl:-scale-x-100 text-faint" />}
      </button>
    )
  }

  return (
    <>
      <div className="xl:hidden">
        <Tabs<SectionId>
          variant="pills"
          value={value}
          onChange={onChange}
          tabs={flat.map((it) => ({ id: it.id, label: it.label, icon: it.icon }))}
        />
      </div>
      <nav
        aria-label={t('settings.title')}
        className="hidden xl:block w-60 shrink-0 sticky top-4 rounded-2xl border border-line bg-surface p-2 shadow-e1"
      >
        {groups.map((g) => (
          <div key={g.label} className="pb-1">
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted rtl:normal-case rtl:tracking-normal rtl:text-xs">
              {g.label}
            </p>
            <div className="space-y-0.5">{g.items.map(item)}</div>
          </div>
        ))}
        <div className="mt-1 border-t border-line pt-2">{item(more)}</div>
      </nav>
    </>
  )
}
