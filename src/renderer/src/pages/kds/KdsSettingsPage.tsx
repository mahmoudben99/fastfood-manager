import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChefHat, Monitor } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import type { KdsDisplayInfo, KdsLanInfo, KdsSettings } from '../../../../shared/kds'

interface WorkerRow {
  id: number
  name: string
  is_active?: number
}

/** Admin → Kitchen Display: timers, alerts, paper replacement, PIN, LAN links, second screens. */
export function KdsSettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<KdsSettings | null>(null)
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [displays, setDisplays] = useState<KdsDisplayInfo[]>([])
  const [displayId, setDisplayId] = useState<number | undefined>(undefined)
  const [lan, setLan] = useState<KdsLanInfo | null>(null)
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.kds.getSettings().then(setSettings)
    void window.api.workers.getAll().then((rows: WorkerRow[]) => setWorkers(rows.filter((row) => row.is_active !== 0)))
    void window.api.kds.getDisplays().then((list) => {
      setDisplays(list)
      setDisplayId((list.find((display) => !display.primary) ?? list[0])?.id)
    })
    void window.api.kds.getLanInfo().then(setLan)
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [message])

  if (!settings) return <div className="p-6 text-gray-500">…</div>

  const update = (patch: Partial<KdsSettings>): void => setSettings({ ...settings, ...patch })
  const togglePaper = (station: number): void => {
    const set = new Set(settings.paperlessStations)
    if (set.has(station)) set.delete(station)
    else set.add(station)
    update({ paperlessStations: [...set].sort((a, b) => a - b) })
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const { pin: _pin, ...patch } = settings
      const result = await window.api.kds.saveSettings(patch)
      if (result.ok) {
        setSettings(result.settings)
        setMessage({ ok: true, text: t('kds.saved') })
      } else {
        setMessage({ ok: false, text: result.error === 'invalid_timers' ? t('kds.invalidTimers') : t('kds.actionFailed') })
      }
    } finally {
      setSaving(false)
    }
  }

  const changePin = async (): Promise<void> => {
    const result = await window.api.kds.setPin(pin.trim())
    if (!result.ok) {
      setMessage({ ok: false, text: t('kds.pinInvalid') })
      return
    }
    setPin('')
    setSettings(await window.api.kds.getSettings())
    setMessage({ ok: true, text: t('kds.saved') })
  }

  const numberField = (label: string, value: number, onChange: (value: number) => void) => (
    <label className="flex items-center justify-between gap-4 py-1.5 text-sm text-gray-700">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={240}
        value={value}
        onChange={(event) => onChange(Math.max(1, Math.round(Number(event.target.value) || 1)))}
        className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-end"
      />
    </label>
  )
  const checkbox = (label: string, checked: boolean, onChange: () => void) => (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-orange-500" />
      <span>{label}</span>
    </label>
  )
  const link = (label: string, url: string, qr: string | null) => (
    <div className="flex items-center gap-4">
      {qr && <img src={qr} alt="" className="h-28 w-28 rounded-lg border border-gray-200" />}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="break-all font-mono text-sm text-gray-900">{url}</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><ChefHat className="h-6 w-6" />{t('kds.settingsTitle')}</h1>
        <p className="text-sm text-gray-500">{t('kds.settingsSubtitle')}</p>
      </div>

      <Card title={t('kds.thisPc')}>
        <div className="flex flex-wrap items-center gap-3">
          <Monitor className="h-5 w-5 text-gray-500" />
          <span className="text-sm text-gray-700">{t('kds.displayLabel')}</span>
          <select
            value={displayId ?? ''}
            onChange={(event) => setDisplayId(Number(event.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {displays.map((display) => (
              <option key={display.id} value={display.id}>
                {display.label} — {display.width}×{display.height}{display.primary ? ` (${t('kds.primaryDisplay')})` : ''}
              </option>
            ))}
          </select>
          <Button onClick={() => void window.api.kds.openWindow(displayId)}>{t('kds.openKds')}</Button>
          <Button variant="secondary" onClick={() => void window.api.kds.openBoardWindow(displayId)}>{t('kds.openBoard')}</Button>
        </div>
      </Card>

      <Card title={t('kds.lanTitle')}>
        {lan?.running ? (
          <div className="grid gap-5 md:grid-cols-2">
            {link(t('kds.lanKds'), lan.kdsUrl, lan.kdsQr)}
            {link(t('kds.lanBoard'), lan.boardUrl, lan.boardQr)}
          </div>
        ) : (
          <p className="text-sm text-amber-700">{t('kds.lanOff')}</p>
        )}
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-700">{t('kds.pinSetting')}</p>
          <p className="mb-2 text-xs text-gray-500">{t('kds.pinHint')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-gray-100 px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em] text-gray-900">{settings.pin}</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="0000"
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 font-mono"
            />
            <Button variant="secondary" onClick={() => void changePin()} disabled={pin.length < 4}>{t('kds.changePin')}</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={t('kds.timers')}>
          {numberField(t('kds.warnMinutes'), settings.warnMinutes, (value) => update({ warnMinutes: value }))}
          {numberField(t('kds.lateMinutes'), settings.lateMinutes, (value) => update({ lateMinutes: value }))}
        </Card>
        <Card title={t('kds.alerts')}>
          {checkbox(t('kds.soundSetting'), settings.sound, () => update({ sound: !settings.sound }))}
          {checkbox(t('kds.flashSetting'), settings.flash, () => update({ flash: !settings.flash }))}
        </Card>
        <Card title={t('kds.paperTitle')}>
          <p className="mb-2 text-xs text-gray-500">{t('kds.paperHint')}</p>
          {workers.map((worker) =>
            <div key={worker.id}>{checkbox(worker.name, settings.paperlessStations.includes(worker.id), () => togglePaper(worker.id))}</div>
          )}
          {checkbox(t('kds.paperExpo'), settings.paperlessStations.includes(0), () => togglePaper(0))}
        </Card>
        <Card title={t('kds.boardSettings')}>
          {numberField(t('kds.boardClear'), settings.boardClearMinutes, (value) => update({ boardClearMinutes: value }))}
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} loading={saving}>{t('kds.save')}</Button>
        {message && <span className={`text-sm font-medium ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</span>}
      </div>
    </div>
  )
}
