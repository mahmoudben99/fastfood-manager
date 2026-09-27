import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BellRing, Clock3, Info, Percent, RotateCcw, Save, Send, Sunrise } from 'lucide-react'
import {
  normalizePercent, normalizeTimeOfDay, type InsightAlert, type InsightsSettings
} from '../../../../../shared/insights'
import { Button, Card, Input, Skeleton, Toggle, toast } from '../../../components/ui'
import { AlertList } from '../shared/AlertList'
import { usePrepActions } from '../shared/usePrepActions'

/** Form values: times and percents stay text while typing, validated on save. */
interface Form {
  morningPrep: boolean
  morningPrepTime: string
  profitMarginWarnPct: string
  alertCancellations: boolean
  alertDiscounts: boolean
  alertSlowDay: boolean
  slowDayCheckTime: string
  slowDayThresholdPct: string
  alertLowStock: boolean
  alertMargin: boolean
}

function toForm(s: InsightsSettings): Form {
  return { ...s, profitMarginWarnPct: String(s.profitMarginWarnPct), slowDayThresholdPct: String(s.slowDayThresholdPct) }
}

/** 24-hour "HH:MM" text field (the native time picker shows AM/PM on an English Windows). */
const TIME_INPUT = { type: 'text', inputMode: 'numeric', placeholder: '09:00', maxLength: 5, dir: 'ltr', trailing: <Clock3 className="h-4 w-4" /> } as const

type Errors = Partial<Record<'morningPrepTime' | 'slowDayCheckTime' | 'profitMarginWarnPct' | 'slowDayThresholdPct', string>>

/** Alerts & Telegram: what is detected right now, and what the owner gets on Telegram. */
export function AlertsSettingsTab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { send, busy } = usePrepActions()
  const [saved, setSaved] = useState<InsightsSettings | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [alerts, setAlerts] = useState<InsightAlert[] | null>(null)
  const [telegram, setTelegram] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [touched, setTouched] = useState<Set<keyof Errors>>(() => new Set())
  const touch = (key: keyof Errors) => () => setTouched((prev) => new Set(prev).add(key))

  const load = useCallback(async () => {
    const [settings, current, config] = await Promise.allSettled([
      window.api.insights.getSettings(),
      window.api.insights.getAlerts(),
      window.api.telegram.getConfig()
    ])
    if (settings.status === 'fulfilled') {
      setSaved(settings.value)
      setForm(toForm(settings.value))
    } else toast.error(t('insights.loadError'))
    setAlerts(current.status === 'fulfilled' ? current.value : [])
    setTelegram(config.status === 'fulfilled' ? Boolean(config.value?.token && config.value?.chatId) : null)
  }, [t])

  useEffect(() => { void load() }, [load])

  const errors = useMemo<Errors>(() => {
    if (!form) return {}
    const e: Errors = {}
    if (!normalizeTimeOfDay(form.morningPrepTime)) e.morningPrepTime = t('insights.settings.errors.time')
    if (!normalizeTimeOfDay(form.slowDayCheckTime)) e.slowDayCheckTime = t('insights.settings.errors.time')
    if (normalizePercent(form.profitMarginWarnPct, 0, 95) === null) e.profitMarginWarnPct = t('insights.settings.errors.pct', { min: 0, max: 95 })
    if (normalizePercent(form.slowDayThresholdPct, 10, 95) === null) e.slowDayThresholdPct = t('insights.settings.errors.pct', { min: 10, max: 95 })
    return e
  }, [form, t])

  const dirty = useMemo(() => Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(toForm(saved))), [form, saved])
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  const save = async () => {
    if (!form) return
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      toast.error(t('insights.settings.fixErrors'))
      return
    }
    setSaving(true)
    try {
      const next = await window.api.insights.saveSettings({
        ...form,
        morningPrepTime: normalizeTimeOfDay(form.morningPrepTime)!,
        slowDayCheckTime: normalizeTimeOfDay(form.slowDayCheckTime)!,
        profitMarginWarnPct: normalizePercent(form.profitMarginWarnPct, 0, 95)!,
        slowDayThresholdPct: normalizePercent(form.slowDayThresholdPct, 10, 95)!
      })
      setSaved(next)
      setForm(toForm(next))
      setShowErrors(false)
      toast.success(t('insights.settings.saved'))
      setAlerts(await window.api.insights.getAlerts().catch(() => alerts ?? []))
    } catch (e) {
      toast.error(t('insights.settings.saveFailed'), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  if (!form) return <Skeleton className="h-96 rounded-2xl" />
  const err = (key: keyof Errors) => (showErrors || touched.has(key) ? errors[key] : undefined)

  return (
    <div className="grid xl:grid-cols-5 gap-4 items-start">
      <div className="xl:col-span-3 space-y-4">
        {telegram === false && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-info/30 bg-info-soft px-5 py-4">
            <Info className="h-5 w-5 shrink-0 text-info-ink" />
            <p className="min-w-0 flex-1 text-sm text-info-ink">{t('insights.settings.telegramOff')}</p>
            <Button variant="secondary" onClick={() => navigate('/admin/settings')}>{t('insights.settings.openTelegram')}</Button>
          </div>
        )}

        <Card icon={<Sunrise />} title={t('insights.settings.morningTitle')}>
          <Toggle checked={form.morningPrep} onChange={(v) => set('morningPrep', v)} label={t('insights.settings.morningToggle')} />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Input {...TIME_INPUT} label={t('insights.settings.time')} value={form.morningPrepTime} disabled={!form.morningPrep}
                error={err('morningPrepTime')} onBlur={touch('morningPrepTime')} onChange={(e) => set('morningPrepTime', e.target.value)} />
            </div>
            <Button variant="secondary" icon={<Send />} cooldownMs={800} loading={busy === 'send'} onClick={() => void send()}>
              {t('insights.settings.sendTest')}
            </Button>
          </div>
        </Card>

        <Card icon={<BellRing />} title={t('insights.settings.alertsTitle')} subtitle={t('insights.settings.alertsSubtitle')}>
          <div className="divide-y divide-line">
            <div className="pb-2"><Toggle checked={form.alertCancellations} onChange={(v) => set('alertCancellations', v)} label={t('insights.settings.kinds.cancellations')} description={t('insights.settings.kindsHint.cancellations')} /></div>
            <div className="py-2"><Toggle checked={form.alertDiscounts} onChange={(v) => set('alertDiscounts', v)} label={t('insights.settings.kinds.discounts')} description={t('insights.settings.kindsHint.discounts')} /></div>
            <div className="py-2">
              <Toggle checked={form.alertSlowDay} onChange={(v) => set('alertSlowDay', v)} label={t('insights.settings.kinds.slow_day')} description={t('insights.settings.kindsHint.slow_day')} />
              <div className="mt-2 mb-2 grid grid-cols-2 gap-3 max-w-md">
                <Input {...TIME_INPUT} label={t('insights.settings.slowTime')} value={form.slowDayCheckTime} disabled={!form.alertSlowDay}
                  error={err('slowDayCheckTime')} onBlur={touch('slowDayCheckTime')} onChange={(e) => set('slowDayCheckTime', e.target.value)} />
                <Input inputMode="numeric" label={t('insights.settings.slowThreshold')} value={form.slowDayThresholdPct} disabled={!form.alertSlowDay}
                  error={err('slowDayThresholdPct')} onBlur={touch('slowDayThresholdPct')} trailing={<Percent className="h-4 w-4" />} onChange={(e) => set('slowDayThresholdPct', e.target.value)} />
              </div>
            </div>
            <div className="py-2"><Toggle checked={form.alertLowStock} onChange={(v) => set('alertLowStock', v)} label={t('insights.settings.kinds.low_stock')} description={t('insights.settings.kindsHint.low_stock')} /></div>
            <div className="pt-2"><Toggle checked={form.alertMargin} onChange={(v) => set('alertMargin', v)} label={t('insights.settings.kinds.margin')} description={t('insights.settings.kindsHint.margin')} /></div>
          </div>
        </Card>

        <Card icon={<Percent />} title={t('insights.settings.marginTitle')} subtitle={t('insights.settings.marginSubtitle')}>
          <div className="w-48">
            <Input inputMode="numeric" label={t('insights.settings.marginLabel')} value={form.profitMarginWarnPct} error={err('profitMarginWarnPct')} onBlur={touch('profitMarginWarnPct')}
              trailing={<Percent className="h-4 w-4" />} onChange={(e) => set('profitMarginWarnPct', e.target.value)} />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="me-auto text-sm text-muted">{t('insights.settings.unsaved')}</span>}
          <Button variant="ghost" icon={<RotateCcw />} disabled={!dirty || saving} onClick={() => { if (saved) setForm(toForm(saved)); setShowErrors(false); setTouched(new Set()) }}>
            {t('insights.settings.reset')}
          </Button>
          <Button icon={<Save />} disabled={!dirty} loading={saving} onClick={() => void save()}>{t('insights.settings.save')}</Button>
        </div>
      </div>

      <Card className="xl:col-span-2" padding={false} icon={<BellRing />} title={t('insights.settings.nowTitle')}>
        {alerts === null ? <div className="p-5"><Skeleton className="h-16" /></div> : <AlertList alerts={alerts} showActions={false} telegramConnected={telegram !== false} />}
      </Card>
    </div>
  )
}
