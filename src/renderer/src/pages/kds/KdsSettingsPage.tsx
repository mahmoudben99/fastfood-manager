import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, ChefHat, Hourglass, Monitor, Printer, Save, Timer, TriangleAlert, Tv } from 'lucide-react'
import { Button, Card, PageHeader, Select, Skeleton, Toggle, toast } from '../../components/ui'
import type { KdsDisplayInfo, KdsLanInfo, KdsSettings } from '../../../../shared/kds'
import { KdsHint } from './KdsHint'
import { KdsLanCard } from './KdsLanCard'
import { KdsMinutesField } from './KdsMinutesField'

interface WorkerRow {
  id: number
  name: string
  is_active?: number
  role?: string | null
}

/** Admin → Kitchen Display: timers, alerts, paper replacement, PIN, LAN links, second screens. */
export function KdsSettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<KdsSettings | null>(null)
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [displays, setDisplays] = useState<KdsDisplayInfo[]>([])
  const [displayId, setDisplayId] = useState<number | undefined>(undefined)
  const [lan, setLan] = useState<KdsLanInfo | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.kds.getSettings().then(setSettings)
    void window.api.workers.getAll().then((rows: WorkerRow[]) => setWorkers(rows.filter((row) => row.is_active !== 0 && (!row.role || row.role === 'cook'))))
    void window.api.kds.getDisplays().then((list) => {
      setDisplays(list)
      setDisplayId((list.find((display) => !display.primary) ?? list[0])?.id)
    })
    void window.api.kds.getLanInfo().then(setLan)
  }, [])

  async function save(): Promise<void> {
    if (!settings) return
    setSaving(true)
    try {
      const { pin: _pin, ...patch } = settings
      const result = await window.api.kds.saveSettings(patch)
      if (result.ok) {
        setSettings(result.settings)
        toast.success(t('kds.saved'))
      } else {
        toast.error(result.error === 'invalid_timers' ? t('kds.invalidTimers') : t('kds.actionFailed'))
      }
    } catch {
      toast.error(t('kds.actionFailed'))
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <PageHeader
      icon={<ChefHat />}
      title={t('kds.settingsTitle')}
      actions={settings && (
        <Button size="lg" icon={<Save className="h-5 w-5" />} loading={saving} onClick={() => void save()}>
          {t('kds.save')}
        </Button>
      )}
    />
  )

  if (!settings) {
    return (
      <div className="max-w-5xl">
        {header}
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    )
  }

  const update = (patch: Partial<KdsSettings>): void => setSettings({ ...settings, ...patch })
  const togglePaper = (station: number): void => {
    const set = new Set(settings.paperlessStations)
    if (set.has(station)) set.delete(station)
    else set.add(station)
    update({ paperlessStations: [...set].sort((a, b) => a - b) })
  }

  return (
    <div className="max-w-5xl">
      {header}
      <div className="space-y-6">
        <Card icon={<Monitor />} title={t('kds.thisPc')}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <Select
                label={t('kds.displayLabel')}
                selectSize="lg"
                value={displayId === undefined ? '' : String(displayId)}
                onChange={(event) => setDisplayId(Number(event.target.value))}
                options={displays.map((display) => ({
                  value: String(display.id),
                  label: `${display.label} — ${display.width}×${display.height}${display.primary ? ` (${t('kds.primaryDisplay')})` : ''}`
                }))}
              />
            </div>
            <Button size="lg" variant="soft" icon={<ChefHat className="h-5 w-5" />} onClick={() => void window.api.kds.openWindow(displayId)}>
              {t('kds.openKds')}
            </Button>
            <Button size="lg" variant="secondary" icon={<Tv className="h-5 w-5" />} onClick={() => void window.api.kds.openBoardWindow(displayId)}>
              {t('kds.openBoard')}
            </Button>
          </div>
        </Card>

        <KdsLanCard lan={lan} pin={settings.pin} onPinChanged={async () => setSettings(await window.api.kds.getSettings())} />

        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card icon={<Timer />} title={t('kds.timersShort')}>
            <KdsMinutesField
              label={t('kds.warnAfter')}
              icon={<Hourglass className="h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />}
              value={settings.warnMinutes}
              onChange={(value) => update({ warnMinutes: value })}
            />
            <KdsMinutesField
              label={t('kds.lateAfter')}
              icon={<TriangleAlert className="h-4 w-4 shrink-0 text-danger-ink" aria-hidden="true" />}
              value={settings.lateMinutes}
              onChange={(value) => update({ lateMinutes: value })}
            />
            {settings.lateMinutes <= settings.warnMinutes && (
              <p role="alert" className="mt-2 flex items-center gap-2 text-sm font-medium text-danger-ink">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('kds.invalidTimers')}
              </p>
            )}
          </Card>

          <Card icon={<Bell />} title={t('kds.alertsShort')}>
            <div className="divide-y divide-line">
              <Toggle label={t('kds.sound')} checked={settings.sound} onChange={(value) => update({ sound: value })} className="py-1" />
              <Toggle label={t('kds.flashShort')} checked={settings.flash} onChange={(value) => update({ flash: value })} className="py-1" />
            </div>
          </Card>

          <Card icon={<Printer />} title={t('kds.paperShort')} actions={<KdsHint text={t('kds.paperHint')} />}>
            <div className="divide-y divide-line">
              {workers.map((worker) => (
                <Toggle
                  key={worker.id}
                  label={<bdi>{worker.name}</bdi>}
                  checked={settings.paperlessStations.includes(worker.id)}
                  onChange={() => togglePaper(worker.id)}
                  className="py-1"
                />
              ))}
              <Toggle
                label={t('kds.paperExpoShort')}
                checked={settings.paperlessStations.includes(0)}
                onChange={() => togglePaper(0)}
                className="py-1"
              />
            </div>
          </Card>

          <Card icon={<Tv />} title={t('kds.boardShort')}>
            <KdsMinutesField
              label={t('kds.boardClearShort')}
              value={settings.boardClearMinutes}
              onChange={(value) => update({ boardClearMinutes: value })}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
