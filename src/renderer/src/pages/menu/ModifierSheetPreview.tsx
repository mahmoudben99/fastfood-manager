import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Eye, Minus, Plus, X } from 'lucide-react'
import type { ModifierKind, ResolvedModifierGroup } from '../../../../shared/catalog-types'
import { Badge, Button, Money, cn } from '../../components/ui'
import { formatDelta, useFoodName } from './catalogShared'

interface ModifierSheetPreviewProps {
  groups: ResolvedModifierGroup[]
  /** Item shown in the sheet header; omitted = option-group preview (deltas only). */
  item?: { name: string; name_ar?: string | null; name_fr?: string | null; price: number; emoji?: string | null } | null
  className?: string
}

const KIND_STYLE: Record<ModifierKind, { chip: string; icon: string } | null> = {
  none: null,
  extra: { chip: 'bg-primary-soft text-primary-ink', icon: '+' },
  light: { chip: 'bg-info-soft text-info-ink', icon: '½' },
  no: { chip: 'bg-danger-soft text-danger-ink', icon: '✕' }
}

/** i18n key + params describing a group's selection rule, as the cashier reads it. */
export function ruleText(group: Pick<ResolvedModifierGroup, 'is_required' | 'min_select' | 'max_select'>): {
  key: string
  params: Record<string, number>
} {
  const min = group.is_required ? Math.max(1, group.min_select) : 0
  const max = group.max_select
  if (group.is_required) {
    if (max === null) return { key: 'modifiers.rule.requiredAtLeast', params: { min } }
    if (max === min) return { key: 'modifiers.rule.requiredExactly', params: { count: min } }
    return { key: 'modifiers.rule.requiredRange', params: { min, max } }
  }
  if (max === null) return { key: 'modifiers.rule.optionalAny', params: {} }
  return { key: 'modifiers.rule.optionalUpTo', params: { max } }
}

/**
 * Live, tappable copy of the order screen's option sheet: defaults pre-selected, selection rules
 * enforced, running total. Lets the owner check exactly what the cashier will see.
 */
export function ModifierSheetPreview({ groups, item, className }: ModifierSheetPreviewProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const signature = groups.map((g) => `${g.id}:${g.max_select}:${g.options.map((o) => `${o.id}${o.is_default ? '*' : ''}`).join(',')}`).join('|')
  const defaults = useMemo(() => {
    const picked: Record<string, number> = {}
    for (const group of groups) {
      for (const option of group.options) if (option.is_default) picked[`${group.id}:${option.id}`] = 1
    }
    return picked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  const [picked, setPicked] = useState<Record<string, number>>(defaults)
  useEffect(() => setPicked(defaults), [defaults])

  const countOf = (group: ResolvedModifierGroup): number =>
    group.options.reduce((sum, option) => sum + (picked[`${group.id}:${option.id}`] ?? 0), 0)

  const tap = (group: ResolvedModifierGroup, optionId: number): void => {
    const key = `${group.id}:${optionId}`
    setPicked((prev) => {
      const next = { ...prev }
      if (next[key]) {
        delete next[key]
        return next
      }
      const count = group.options.reduce((sum, option) => sum + (prev[`${group.id}:${option.id}`] ?? 0), 0)
      if (group.max_select === 1) {
        for (const option of group.options) delete next[`${group.id}:${option.id}`]
      } else if (group.max_select !== null && count >= group.max_select) {
        return prev
      }
      next[key] = 1
      return next
    })
  }

  const bump = (group: ResolvedModifierGroup, optionId: number, delta: 1 | -1): void => {
    const key = `${group.id}:${optionId}`
    setPicked((prev) => {
      const current = prev[key] ?? 0
      const count = group.options.reduce((sum, option) => sum + (prev[`${group.id}:${option.id}`] ?? 0), 0)
      if (delta > 0 && (current >= group.max_quantity || (group.max_select !== null && count >= group.max_select))) return prev
      const next = { ...prev }
      if (current + delta <= 0) delete next[key]
      else next[key] = current + delta
      return next
    })
  }

  const extras = groups.reduce(
    (sum, group) => sum + group.options.reduce((s, option) => s + option.price_delta * (picked[`${group.id}:${option.id}`] ?? 0), 0),
    0
  )
  const firstInvalid = groups.find((group) => {
    const count = countOf(group)
    return count < group.min_select || (group.max_select !== null && count > group.max_select)
  })
  const total = Math.max(0, (item?.price ?? 0) + extras)

  return (
    <div className={cn('rounded-2xl border border-line bg-surface shadow-e2 overflow-hidden flex flex-col', className)}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-surface-2/60">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center text-2xl">
          {item ? item.emoji || '🍽️' : <Eye className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">{t('modifiers.preview.title')}</p>
          <p className="font-bold text-ink truncate">{item ? getName(item) : t('modifiers.preview.groupOnly')}</p>
        </div>
        {item && <Money value={item.price} decimals={0} className="text-base font-extrabold text-ink" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 max-h-[52vh]">
        {groups.length === 0 && <p className="py-8 text-center text-sm text-muted">{t('modifiers.preview.empty')}</p>}
        {groups.map((group) => {
          const count = countOf(group)
          const rule = ruleText(group)
          const full = group.max_select !== null && count >= group.max_select && group.max_select !== 1
          return (
            <section key={group.id}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="font-bold text-ink truncate">{getName(group)}</h4>
                <Badge variant={group.is_required ? (count >= group.min_select ? 'success' : 'warning') : 'neutral'} icon={group.is_required && count >= group.min_select ? <Check /> : undefined}>
                  {t(rule.key, rule.params)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.options.map((option) => {
                  const qty = picked[`${group.id}:${option.id}`] ?? 0
                  const kind = KIND_STYLE[option.kind]
                  const dim = !qty && full
                  return (
                    <div
                      key={option.id}
                      className={cn(
                        'relative min-h-12 rounded-xl border flex items-center gap-2 ps-3 pe-2 text-start',
                        qty ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface dark:bg-surface-2',
                        dim && 'opacity-50'
                      )}
                    >
                      <button type="button" onClick={() => tap(group, option.id)} className="tap absolute inset-0 rounded-xl" aria-pressed={qty > 0} aria-label={getName(option)} />
                      {kind && (
                        <span className={cn('relative h-6 w-6 shrink-0 rounded-full text-xs font-extrabold flex items-center justify-center pointer-events-none', kind.chip)}>
                          {kind.icon}
                        </span>
                      )}
                      <span className={cn('relative flex-1 min-w-0 text-sm font-semibold leading-tight pointer-events-none', option.kind === 'no' && qty ? 'text-danger-ink' : 'text-ink')}>
                        {getName(option)}
                      </span>
                      {option.price_delta !== 0 && (
                        <bdi dir="ltr" className="relative num text-xs font-bold text-ink-2 pointer-events-none">{formatDelta(option.price_delta)}</bdi>
                      )}
                      {group.allow_quantity && qty > 0 ? (
                        <span className="relative flex items-center gap-1">
                          <button type="button" onClick={() => bump(group, option.id, -1)} className="tap h-8 w-8 rounded-lg bg-surface border border-line flex items-center justify-center" aria-label={t('menu.ui.decrease')}>
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="num w-5 text-center text-sm font-extrabold">{qty}</span>
                          <button type="button" onClick={() => bump(group, option.id, 1)} className="tap h-8 w-8 rounded-lg bg-surface border border-line flex items-center justify-center" aria-label={t('menu.ui.increase')}>
                            <Plus className="h-4 w-4" />
                          </button>
                        </span>
                      ) : qty > 0 ? (
                        <span className="relative h-6 w-6 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center pointer-events-none">
                          {option.kind === 'no' ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="border-t border-line px-4 py-3 bg-surface-2/60 space-y-2">
        {firstInvalid && (
          <p className="text-xs font-semibold text-warning-ink">
            {t('modifiers.preview.needs', { group: getName(firstInvalid) })}
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted">{item ? t('modifiers.preview.total') : t('modifiers.preview.extras')}</p>
            <p className="text-xl font-extrabold text-ink">
              {item ? <Money value={total} decimals={0} /> : <bdi dir="ltr" className="num">{formatDelta(extras)}</bdi>}
            </p>
          </div>
          <Button variant="soft" size="lg" disabled={!!firstInvalid || groups.length === 0} tabIndex={-1} aria-disabled="true" className="pointer-events-none">
            {t('modifiers.preview.add')}
          </Button>
        </div>
      </div>
    </div>
  )
}
