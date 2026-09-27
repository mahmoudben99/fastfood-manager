import { useTranslation } from 'react-i18next'
import { Ban, Check, Minus, Plus } from 'lucide-react'
import type { ResolvedComboChoice, ResolvedComboSlot, ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import { cn } from '../../../components/ui'
import { categoryTint } from '../../../theme/categoryColors'
import type { Selection } from '../lib/modifiers'
import { localName } from '../lib/names'
import { SignedMoney } from './SignedMoney'
import { ModifierGroups, ruleText } from './ModifierGroups'

export interface Pick {
  key: string
  menu_item_id: number
  selection?: Selection
  note?: string
}

interface ComboSlotPickerProps {
  slot: ResolvedComboSlot
  picks: Pick[]
  groups: Map<number, ResolvedModifierGroup[]>
  lang: string
  showMissing: boolean
  onChange: (next: Pick[]) => void
  newPick: (menuItemId: number) => Pick
}

/** One combo slot: choice tiles (upcharge, sold out disabled), counts for multi-pick slots, options per pick. */
export function ComboSlotPicker({ slot, picks, groups, lang, showMissing, onChange, newPick }: ComboSlotPickerProps) {
  const { t } = useTranslation()
  const count = picks.length
  const satisfied = count >= slot.min_select && count <= slot.max_select
  const full = count >= slot.max_select
  const single = slot.max_select === 1
  const rule = ruleText({ min_select: slot.min_select, max_select: slot.max_select } as ResolvedModifierGroup, t)

  const countOf = (choice: ResolvedComboChoice): number => picks.filter((p) => p.menu_item_id === choice.menu_item_id).length
  const tap = (choice: ResolvedComboChoice): void => {
    const n = countOf(choice)
    if (single) {
      if (n === 0) onChange([newPick(choice.menu_item_id)])
      return
    }
    if (n > 0) onChange(picks.filter((p) => p.menu_item_id !== choice.menu_item_id))
    else if (!full) onChange([...picks, newPick(choice.menu_item_id)])
  }
  const bump = (choice: ResolvedComboChoice, delta: number): void => {
    if (delta > 0 && !full) onChange([...picks, newPick(choice.menu_item_id)])
    if (delta < 0) {
      const index = picks.map((p) => p.menu_item_id).lastIndexOf(choice.menu_item_id)
      if (index >= 0) onChange(picks.filter((_, i) => i !== index))
    }
  }

  const optionPicks = picks.filter((p) => (groups.get(p.menu_item_id)?.length || 0) > 0)

  return (
    <section className={cn('rounded-2xl', showMissing && !satisfied && 'ring-2 ring-danger ring-offset-4 ring-offset-surface')}>
      <header className="flex items-center gap-2 flex-wrap pb-2.5">
        <h3 className="text-base font-bold text-ink">{localName(slot, lang)}</h3>
        {slot.min_select > 1 && slot.min_select !== slot.max_select && <span className="text-[0.8125rem] text-muted">{rule}</span>}
        <span className={cn('ms-auto num h-7 min-w-12 px-2 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1', satisfied && count > 0 ? 'bg-success-soft text-success-ink' : 'bg-surface-2 text-ink-2')}>
          {satisfied && count > 0 && <Check className="h-3.5 w-3.5" />}
          <bdi dir="ltr">{count}/{slot.max_select}</bdi>
        </span>
      </header>
      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]">
        {slot.choices.map((choice) => {
          const n = countOf(choice)
          const selected = n > 0
          const blocked = choice.sold_out
          const disabled = blocked || (!selected && full && !single)
          return (
            <div key={choice.menu_item_id} className={cn('relative rounded-xl border overflow-hidden', selected ? 'border-primary ring-1 ring-primary bg-primary-soft' : 'border-line-strong bg-surface', disabled && 'opacity-45')}>
              <button type="button" disabled={disabled} aria-pressed={selected} onClick={() => tap(choice)} className="tap w-full min-h-16 flex items-center gap-2.5 p-2 text-start disabled:cursor-not-allowed">
                {choice.image_path ? (
                  <img src={`app-image://${choice.image_path}`} alt="" loading="lazy" decoding="async" className={cn('h-12 w-12 rounded-lg object-cover shrink-0', blocked && 'grayscale')} />
                ) : (
                  <span className="h-12 w-12 rounded-lg flex items-center justify-center text-2xl shrink-0" style={{ background: categoryTint(choice.category_id, 20) }}>{choice.emoji || '🍽️'}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink leading-snug line-clamp-2 [overflow-wrap:anywhere]">{localName(choice, lang)}</span>
                  {blocked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-danger-ink"><Ban className="h-3 w-3" />{t('pos.tile.soldOut')}</span>
                  ) : choice.upcharge > 0 ? (
                    <SignedMoney value={choice.upcharge} sign="+" className="text-[0.8125rem] font-semibold text-muted" />
                  ) : (
                    <span className="text-[0.8125rem] text-muted">{t('pos.combo.included')}</span>
                  )}
                </span>
                {selected && single && <Check className="h-5 w-5 text-primary-ink shrink-0" />}
              </button>
              {selected && !single && (
                <div className="flex items-center gap-1 px-2 pb-2">
                  <button type="button" aria-label={t('pos.ticket.less')} onClick={() => bump(choice, -1)} className="tap h-10 w-10 rounded-lg bg-surface border border-line flex items-center justify-center"><Minus className="h-4 w-4" /></button>
                  <span className="num w-8 text-center font-extrabold text-ink">{n}</span>
                  <button type="button" aria-label={t('pos.ticket.more')} disabled={full} onClick={() => bump(choice, 1)} className="tap h-10 w-10 rounded-lg bg-surface border border-line flex items-center justify-center disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {optionPicks.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {optionPicks.map((pick) => {
            const choice = slot.choices.find((c) => c.menu_item_id === pick.menu_item_id)!
            const same = picks.filter((p) => p.menu_item_id === pick.menu_item_id)
            const index = same.indexOf(pick)
            return (
              <div key={pick.key} className="rounded-2xl border border-line bg-surface-2/60 p-3">
                <p className="text-sm font-bold text-ink-2 pb-2">
                  {t('pos.combo.optionsFor', { name: localName(choice, lang) })}
                  {same.length > 1 && <span className="num text-muted"> #{index + 1}</span>}
                </p>
                <ModifierGroups
                  dense
                  groups={groups.get(pick.menu_item_id)!}
                  selection={pick.selection || {}}
                  lang={lang}
                  showMissing={showMissing}
                  onChange={(next) => onChange(picks.map((p) => (p.key === pick.key ? { ...p, selection: next } : p)))}
                />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
