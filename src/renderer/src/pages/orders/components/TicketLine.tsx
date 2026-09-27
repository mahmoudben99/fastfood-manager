import { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CornerDownRight, Minus, Plus, Tag, Trash2 } from 'lucide-react'
import { Money, cn } from '../../../components/ui'
import type { CartItem, CartModifier } from '../../../store/orderStore'
import { localName } from '../lib/names'
import { moneyDecimals } from './MenuTile'
import { SignedMoney } from './SignedMoney'

const KIND_WORDS = /^(no|sans|without|extra|light|léger|leger|بدون|بلا|زيادة|إضافي|اضافي|خفيف)\b/i

/** "✕ No onions", "+ Extra cheese ×2", "Light mayo" — the kind word is skipped when the name already says it. */
export function ModifierText({ mod, lang }: { mod: CartModifier; lang: string }) {
  const { t } = useTranslation()
  const name = localName(mod, lang)
  const word = mod.kind === 'none' || KIND_WORDS.test(name.trim()) ? '' : `${t(`pos.kind.${mod.kind}`)} `
  const prefix = mod.kind === 'no' ? '✕ ' : mod.kind === 'light' ? '' : '+ '
  return (
    <span className={cn(mod.kind === 'no' && 'text-danger-ink font-semibold')}>
      {prefix}{word}{name}
      {mod.quantity > 1 && <bdi className="num"> ×{mod.quantity}</bdi>}
    </span>
  )
}

interface TicketLineProps {
  line: CartItem
  lang: string
  flash: boolean
  onEdit: (key: string) => void
  onQty: (key: string, quantity: number) => void
  onRemove: (key: string) => void
}

/** Receipt line: 44px stepper, name + options/combo picks (muted, indented), note, line total. Tap text = edit. */
export const TicketLine = memo(function TicketLine({ line, lang, flash, onEdit, onQty, onRemove }: TicketLineProps) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  // A tapped item's line re-mounts with `flash`: bring it into view in a long ticket.
  useEffect(() => {
    if (flash) root.current?.scrollIntoView({ block: 'nearest' })
  }, [flash])
  const total = line.price * line.quantity
  return (
    <div ref={root} className={cn('flex items-start gap-2 py-2 border-b border-line rounded-lg', flash && 'flash')}>
      <div className="flex items-center rounded-xl border border-line bg-surface-2 shrink-0">
        <button
          type="button"
          onClick={() => (line.quantity <= 1 ? onRemove(line.key) : onQty(line.key, line.quantity - 1))}
          className="tap h-11 w-11 flex items-center justify-center text-ink-2 rounded-s-xl active:bg-surface-3"
          aria-label={line.quantity <= 1 ? t('common.remove') : t('pos.ticket.less')}
        >
          {line.quantity <= 1 ? <Trash2 className="h-4 w-4 text-danger-ink" /> : <Minus className="h-4 w-4" />}
        </button>
        <span className="num w-7 text-center font-extrabold text-ink">{line.quantity}</span>
        <button
          type="button"
          onClick={() => onQty(line.key, line.quantity + 1)}
          className="tap h-11 w-11 flex items-center justify-center text-ink-2 rounded-e-xl active:bg-surface-3"
          aria-label={t('pos.ticket.more')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <button type="button" onClick={() => onEdit(line.key)} className="tap min-w-0 flex-1 text-start rounded-lg py-0.5 -my-0.5 hover:bg-surface-2/70">
        <span className="block text-[0.9375rem] font-semibold text-ink leading-snug">
          {line.emoji && <span className="me-1">{line.emoji}</span>}
          {localName(line, lang)}
        </span>
        {(line.modifiers?.length || 0) > 0 && (
          <span className="block ps-3 text-[0.8125rem] leading-snug text-muted">
            {line.modifiers!.map((m) => (
              <span key={m.option_id} className="block">
                <ModifierText mod={m} lang={lang} />
              </span>
            ))}
          </span>
        )}
        {line.is_combo && (line.children?.length || 0) > 0 && (
          <span className="block ps-2 text-[0.8125rem] leading-snug text-ink-2">
            {line.children!.map((c, i) => (
              <span key={`${c.slot_id}-${c.menu_item_id}-${i}`} className="block">
                <span className="inline-flex items-start gap-1">
                  <CornerDownRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-faint rtl:-scale-x-100" />
                  <span>
                    {localName(c, lang)}
                    {c.upcharge > 0 && <span className="text-muted"> <SignedMoney value={c.upcharge} sign="+" /></span>}
                  </span>
                </span>
                {(c.modifiers || []).map((m) => (
                  <span key={m.option_id} className="block ps-5 text-muted"><ModifierText mod={m} lang={lang} /></span>
                ))}
                {c.note && <span className="block ps-5 italic text-muted">“{c.note}”</span>}
              </span>
            ))}
          </span>
        )}
        {line.notes && <span className="block ps-3 text-[0.8125rem] italic text-muted leading-snug">“{line.notes}”</span>}
        {(line.price_override != null || line.unavailable) && (
          <span className="flex flex-wrap gap-1 mt-1">
            {line.price_override != null && (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-warning-soft text-warning-ink text-xs font-bold">
                <Tag className="h-3 w-3" />
                {t('pos.ticket.customPrice')}
              </span>
            )}
            {line.unavailable && (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-danger-soft text-danger-ink text-xs font-bold">
                <Ban className="h-3 w-3" />
                {t('pos.tile.soldOut')}
              </span>
            )}
          </span>
        )}
      </button>

      <span className="pt-2.5 text-[0.9375rem] font-bold text-ink text-end shrink-0">
        <Money value={total} decimals={moneyDecimals(total)} />
      </span>
    </div>
  )
})
