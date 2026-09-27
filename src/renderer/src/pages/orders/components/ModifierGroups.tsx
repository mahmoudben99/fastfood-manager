import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Check, Minus, Plus } from 'lucide-react'
import type { ResolvedModifierGroup, ResolvedModifierOption } from '../../../../../shared/catalog-types'
import { cn } from '../../../components/ui'
import {
  canAddMore, groupUnits, isRequiredGroup, setOptionUnits, toggleOption, type Selection
} from '../lib/modifiers'
import { localName } from '../lib/names'
import { SignedMoney } from './SignedMoney'

export function ruleText(group: ResolvedModifierGroup, t: TFunction): string {
  const { min_select: min, max_select: max } = group
  if (min > 0 && max !== null && min === max) return t('pos.rule.exactly', { count: min })
  if (min > 0 && max !== null) return t('pos.rule.range', { min, max })
  if (min > 0) return t('pos.rule.atLeast', { count: min })
  if (max !== null) return t('pos.rule.upTo', { count: max })
  return t('pos.rule.any')
}

const kindStyle: Record<string, string> = {
  no: 'bg-danger-soft text-danger-ink',
  extra: 'bg-primary-soft text-primary-ink',
  light: 'bg-info-soft text-info-ink'
}

function Delta({ value }: { value: number }) {
  if (!value) return null
  return (
    <SignedMoney value={value} sign={value > 0 ? '+' : '−'} className={cn('text-[0.8125rem] font-semibold', value < 0 ? 'text-success-ink' : 'text-muted')} />
  )
}

interface ModifierGroupsProps {
  groups: ResolvedModifierGroup[]
  selection: Selection
  onChange: (next: Selection, filledGroupId?: number) => void
  lang: string
  /** Highlight unmet required groups (after a tap on Add). */
  showMissing: boolean
  dense?: boolean
}

/** All groups on one surface: rule chip, live counter, option cards with kind chips, deltas, steppers. */
export function ModifierGroups({ groups, selection, onChange, lang, showMissing, dense = false }: ModifierGroupsProps) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col', dense ? 'gap-4' : 'gap-6')}>
      {groups.map((group) => {
        const units = groupUnits(selection, group.id)
        const required = isRequiredGroup(group)
        const satisfied = units >= group.min_select
        const missing = showMissing && !satisfied
        const room = canAddMore(selection, group)
        return (
          <section key={group.id} data-group-id={group.id} className={cn('scroll-mt-4 rounded-2xl', missing && 'ring-2 ring-danger ring-offset-4 ring-offset-surface pos-shake')}>
            <header className="flex items-center gap-2 flex-wrap pb-2.5">
              <h3 className={cn('font-bold text-ink', dense ? 'text-[0.9375rem]' : 'text-base')}>{localName(group, lang)}</h3>
              <span className={cn('h-6 px-2 rounded-full text-xs font-bold inline-flex items-center', required ? (missing ? 'bg-danger-soft text-danger-ink' : 'bg-primary-soft text-primary-ink') : 'bg-surface-2 text-muted border border-line')}>
                {required ? t('pos.sheet.required') : t('pos.sheet.optional')}
              </span>
              {group.min_select > 1 && <span className="text-[0.8125rem] text-muted">{ruleText(group, t)}</span>}
              <span className={cn('ms-auto num h-7 min-w-12 px-2 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1', satisfied && units > 0 ? 'bg-success-soft text-success-ink' : 'bg-surface-2 text-ink-2')}>
                {satisfied && units > 0 && <Check className="h-3.5 w-3.5" />}
                <bdi dir="ltr">{group.max_select !== null ? `${units}/${group.max_select}` : units}</bdi>
              </span>
            </header>
            <div className={cn('grid gap-2', dense ? 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]')}>
              {group.options.map((option: ResolvedModifierOption) => {
                const qty = selection[group.id]?.[option.id] || 0
                const selected = qty > 0
                const disabled = !selected && !room && group.max_select !== 1
                return (
                  <div
                    key={option.id}
                    className={cn(
                      'relative rounded-xl border',
                      selected ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-line-strong bg-surface',
                      disabled && 'opacity-45'
                    )}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => {
                        const next = toggleOption(selection, group, option.id)
                        const filled = group.max_select === 1 && groupUnits(next, group.id) === 1
                        onChange(next, filled ? group.id : undefined)
                      }}
                      className={cn('tap w-full text-start px-3 flex items-center gap-2 disabled:cursor-not-allowed', dense ? 'min-h-12 py-2' : 'min-h-14 py-2.5')}
                    >
                      <span className={cn('h-5 w-5 shrink-0 flex items-center justify-center border-2', group.max_select === 1 ? 'rounded-full' : 'rounded-md', selected ? 'border-primary bg-primary text-on-primary' : 'border-line-strong')}>
                        {selected && (group.max_select === 1 ? <span className="h-2 w-2 rounded-full bg-on-primary" /> : <Check className="h-3.5 w-3.5" />)}
                      </span>
                      <span className="min-w-0 flex-1">
                        {option.kind !== 'none' && (
                          <span className={cn('me-1.5 inline-flex h-5 px-1.5 rounded-md text-[0.6875rem] font-extrabold align-middle', kindStyle[option.kind])}>
                            {t(`pos.kind.${option.kind}`)}
                          </span>
                        )}
                        <span className="text-[0.9375rem] font-semibold text-ink leading-snug align-middle">{localName(option, lang)}</span>
                      </span>
                      {!(selected && group.allow_quantity && option.kind !== 'no' && (group.max_quantity || 1) > 1) && <Delta value={option.price_delta} />}
                    </button>
                    {selected && group.allow_quantity && option.kind !== 'no' && (group.max_quantity || 1) > 1 && (
                      <div className="flex items-center gap-1 px-2 pb-2">
                        <button
                          type="button"
                          aria-label={t('pos.ticket.less')}
                          onClick={() => onChange(setOptionUnits(selection, group, option.id, qty - 1))}
                          className="tap h-10 w-10 rounded-lg bg-surface border border-line flex items-center justify-center"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="num w-8 text-center font-extrabold text-ink">{qty}</span>
                        <button
                          type="button"
                          aria-label={t('pos.ticket.more')}
                          disabled={!room || qty >= (group.max_quantity || 1)}
                          onClick={() => onChange(setOptionUnits(selection, group, option.id, qty + 1))}
                          className="tap h-10 w-10 rounded-lg bg-surface border border-line flex items-center justify-center disabled:opacity-40"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <span className="ms-auto"><Delta value={option.price_delta * qty} /></span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
