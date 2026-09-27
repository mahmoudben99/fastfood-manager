import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock, Moon, Plus, Sun, Sunset, XCircle } from 'lucide-react'
import { Badge, Button, Card, EmptyState, SegmentedControl, Skeleton, toast } from '../ui'
import { rulesAllow, type AvailabilityEnforce, type AvailabilityRule } from '../../../../shared/availability'
import { AvailabilityRuleCard } from './AvailabilityRuleCard'
import { emptyRule, errorCode, presetRule, type RulePreset } from './catalog-ext-helpers'

/**
 * v4 wave-2 CONTRACT: time-based availability for one menu item or category (e.g. lunch only,
 * Ramadan iftar menu). Self-contained (own IPC). Mounted by the menu item / category forms.
 */
export interface AvailabilityEditorProps {
  target: { kind: 'menu_item' | 'category'; id: number | null }
}

type Draft = AvailabilityRule & { key: number }

let nextKey = 1
const withKey = (rule: AvailabilityRule): Draft => ({ ...rule, key: nextKey++ })
const strip = ({ key: _key, ...rule }: Draft): AvailabilityRule => rule

export function AvailabilityEditor({ target }: AvailabilityEditorProps) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<Draft[] | null>(null)
  const [savedJson, setSavedJson] = useState('[]')
  const [enforce, setEnforce] = useState<AvailabilityEnforce>('warn')
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (target.id === null) return
    let alive = true
    setRules(null)
    void window.api.availability.get({ kind: target.kind, id: target.id })
      .then((state) => {
        if (!alive) return
        setRules(state.rules.map(withKey))
        setSavedJson(JSON.stringify(state.rules.map(({ id: _id, ...rule }) => rule)))
        setEnforce(state.enforce)
      })
      .catch(() => alive && setRules([]))
    return () => { alive = false }
  }, [target.kind, target.id])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const plain = useMemo(() => (rules ?? []).map(strip).map(({ id: _id, ...rule }) => rule), [rules])
  const dirty = rules !== null && JSON.stringify(plain) !== savedJson
  const availableNow = rulesAllow(plain, now)
  const category = target.kind === 'category'
  const title = t(category ? 'channels.availability.titleCategory' : 'channels.availability.titleItem')

  if (target.id === null) {
    return (
      <Card title={title} icon={<Clock />} variant="flat">
        <EmptyState compact icon={<Clock />} title={t('channels.availability.saveFirst')} description={t('channels.availability.saveFirstHint')} />
      </Card>
    )
  }
  const id = target.id

  const fail = (error: unknown): void => {
    toast.error(t(`channels.availability.errors.${errorCode(error, 'AVAILABILITY')}`, { defaultValue: t('channels.availability.errors.generic') }))
  }
  const add = (rule: AvailabilityRule): void => setRules([...(rules ?? []), withKey(rule)])
  const addPreset = (preset: RulePreset): void => add(presetRule(preset, t(`channels.availability.${preset}Label`)))

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const state = await window.api.availability.set({ kind: target.kind, id }, (rules ?? []).map(strip))
      setRules(state.rules.map(withKey))
      setSavedJson(JSON.stringify(state.rules.map(({ id: _id, ...rule }) => rule)))
      toast.success(t('channels.availability.saved'))
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  const changeEnforce = async (mode: AvailabilityEnforce): Promise<void> => {
    const previous = enforce
    setEnforce(mode)
    try {
      setEnforce(await window.api.availability.setEnforce(mode))
    } catch (error) {
      setEnforce(previous)
      fail(error)
    }
  }

  const presets = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted me-1">{t('channels.availability.quickAdd')}</span>
      <Button size="sm" variant="secondary" icon={<Sun />} title="11:00–15:00" onClick={() => addPreset('lunch')}>{t('channels.availability.presetLunch')}</Button>
      <Button size="sm" variant="secondary" icon={<Sunset />} title="18:00–23:00" onClick={() => addPreset('dinner')}>{t('channels.availability.presetDinner')}</Button>
      <Button size="sm" variant="secondary" icon={<Moon />} title="17:30–02:00" onClick={() => addPreset('ramadan')}>{t('channels.availability.presetRamadan')}</Button>
    </div>
  )

  const status = rules === null ? null : (
    <Badge variant={availableNow ? 'success' : 'danger'} icon={availableNow ? <CheckCircle2 /> : <XCircle />}>
      {t(availableNow ? 'channels.availability.availableNow' : 'channels.availability.unavailableNow')}
    </Badge>
  )

  return (
    <Card
      title={title}
      icon={<Clock />}
      variant="flat"
      actions={status}
    >
      {rules === null ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-10 w-2/3 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t(category ? 'channels.availability.subtitleCategory' : 'channels.availability.subtitleItem')}</p>
          {rules.length === 0 ? (
            <EmptyState
              compact
              icon={<Clock />}
              title={t('channels.availability.always')}
              description={t('channels.availability.alwaysHint')}
              action={<Button size="md" variant="soft" icon={<Plus />} onClick={() => add(emptyRule())}>{t('channels.availability.addWindow')}</Button>}
            />
          ) : (
            rules.map((rule, index) => (
              <AvailabilityRuleCard
                key={rule.key}
                rule={rule}
                index={index}
                onChange={(next) => setRules(rules.map((entry) => entry.key === rule.key ? { ...next, key: rule.key } : entry))}
                onRemove={() => setRules(rules.filter((entry) => entry.key !== rule.key))}
              />
            ))
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {presets}
            {rules.length > 0 && (
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => add(emptyRule())}>{t('channels.availability.addWindow')}</Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-ink">{t('channels.availability.enforce')}</div>
              <SegmentedControl<AvailabilityEnforce>
                size="sm"
                value={enforce}
                onChange={(mode) => void changeEnforce(mode)}
                ariaLabel={t('channels.availability.enforce')}
                options={[
                  { value: 'warn', label: t('channels.availability.enforceWarn') },
                  { value: 'block', label: t('channels.availability.enforceBlock') }
                ]}
              />
              <p className="text-xs text-muted">{t('channels.availability.enforceHint')}</p>
            </div>
            <div className="flex items-center gap-3">
              {dirty && <Badge size="sm" variant="warning" dot>{t('channels.unsaved')}</Badge>}
              <Button variant="soft" loading={saving} disabled={!dirty} onClick={() => void save()} cooldownMs={800}>
                {t('channels.availability.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
