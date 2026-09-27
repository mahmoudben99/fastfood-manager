import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles } from 'lucide-react'
import type { UpsellSuggestion } from '../../../../../shared/insights'
import { Money } from '../../../components/ui'
import { localName } from '../lib/names'
import { moneyDecimals } from './MenuTile'

/** "62% also take Fries  +" — one tap adds (or opens the options sheet when the item needs choices). */
export const UpsellChips = memo(function UpsellChips({ suggestions, lang, onAdd }: {
  suggestions: UpsellSuggestion[]
  lang: string
  onAdd: (menuItemId: number) => void
}) {
  const { t } = useTranslation()
  if (suggestions.length === 0) return null
  return (
    <div className="pt-3 pb-1">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted pb-1.5">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        {t('pos.upsell.title')}
      </p>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.menuItemId}
            type="button"
            onClick={() => onAdd(s.menuItemId)}
            className="tap w-full min-h-12 rounded-xl border border-dashed border-primary/40 bg-primary-soft/50 px-3 flex items-center gap-2.5 text-start hover:bg-primary-soft"
          >
            <span className="text-xl leading-none">{s.emoji || '✨'}</span>
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-bold text-ink">{t('pos.upsell.chip', { percent: s.percent, name: localName(s, lang) })}</span>
            </span>
            <span className="text-sm font-bold text-ink-2 shrink-0">
              <Money value={s.price} decimals={moneyDecimals(s.price)} styledSymbol={false} />
            </span>
            <span className="h-8 w-8 rounded-lg bg-surface border border-primary/30 text-primary-ink flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})
