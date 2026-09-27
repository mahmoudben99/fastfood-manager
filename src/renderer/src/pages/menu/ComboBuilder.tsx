import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Plus, Star, Trash2, X } from 'lucide-react'
import { Badge, Button, IconButton, Input, Money, cn } from '../../components/ui'
import { categoryTint } from '../../theme/categoryColors'
import { CurrencyTag, InlineNotice, MoveButtons, Stepper, moveItem, useFoodName, useTouchKeyboard } from './catalogShared'
import { ComboChoicePicker } from './ComboChoicePicker'
import { ComboPricePreview } from './ComboPricePreview'
import { MAX_PICKS, newSlotDraft, slotCandidates, type ChoiceDraft, type SlotDraft } from './comboLogic'
import type { CategoryRow, MenuRow } from './menuTypes'

interface ComboBuilderProps {
  comboId: number | null
  comboPrice: number
  slots: SlotDraft[]
  onChange: (slots: SlotDraft[]) => void
  items: MenuRow[]
  categories: CategoryRow[]
  showErrors: boolean
}

const QUICK_PARTS = ['main', 'side', 'drink', 'dessert'] as const

/** Combo parts ("slots"): what the customer picks for each part, upcharges, defaults, price split. */
export function ComboBuilder({ comboId, comboPrice, slots, onChange, items, categories, showErrors }: ComboBuilderProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [picking, setPicking] = useState<string | null>(null)
  const itemById = new Map(items.map((i) => [i.id, i]))
  const catById = new Map(categories.map((c) => [c.id, c]))

  const patchSlot = (key: string, patch: Partial<SlotDraft>) =>
    onChange(slots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)))
  const patchChoice = (slotKey: string, choiceKey: string, patch: Partial<ChoiceDraft>) =>
    onChange(
      slots.map((slot) => {
        if (slot.key !== slotKey) return slot
        return {
          ...slot,
          choices: slot.choices.map((c) => {
            if (c.key === choiceKey) return { ...c, ...patch }
            // A one-pick part keeps a single default.
            if (patch.is_default && slot.max_select === 1) return { ...c, is_default: false }
            return c
          })
        }
      })
    )

  const addSlot = (part?: (typeof QUICK_PARTS)[number]) => {
    const slot = part
      ? newSlotDraft(t(`combos.parts.${part}`, { lng: 'en' }), { ar: t(`combos.parts.${part}`, { lng: 'ar' }), fr: t(`combos.parts.${part}`, { lng: 'fr' }) })
      : newSlotDraft()
    onChange([...slots, slot])
    setPicking(slot.key)
  }

  const usedParts = new Set(slots.map((s) => s.name.trim().toLowerCase()))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
      <div className="space-y-4 min-w-0">
        {slots.map((slot, index) => {
          const nameMissing = showErrors && !slot.name.trim()
          const noChoices = showErrors && slot.choices.length === 0
          const offered = slotCandidates(slot, items, comboId).length
          return (
            <section key={slot.key} className="rounded-2xl border border-line bg-surface shadow-e1">
              <div className="flex items-start gap-2 p-3 border-b border-line">
                <span className="num mt-3 h-8 w-8 shrink-0 rounded-full bg-inverse text-on-inverse text-sm font-extrabold flex items-center justify-center">{index + 1}</span>
                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input aria-label={t('combos.builder.partName')} placeholder={t('combos.builder.partName')} error={nameMissing ? t('combos.errors.slotName') : undefined} {...kb.bind(slot.name, (v) => patchSlot(slot.key, { name: v }))} />
                  <Input aria-label={t('menu.nameAr')} placeholder={t('menu.nameAr')} dir="rtl" {...kb.bind(slot.name_ar, (v) => patchSlot(slot.key, { name_ar: v }), 'text', true)} />
                  <Input aria-label={t('menu.nameFr')} placeholder={t('menu.nameFr')} {...kb.bind(slot.name_fr, (v) => patchSlot(slot.key, { name_fr: v }))} />
                </div>
                <MoveButtons canUp={index > 0} canDown={index < slots.length - 1} onUp={() => onChange(moveItem(slots, index, -1))} onDown={() => onChange(moveItem(slots, index, 1))} />
                <IconButton icon={<Trash2 />} variant="danger" label={t('combos.builder.removePart')} onClick={() => onChange(slots.filter((s) => s.key !== slot.key))} />
              </div>

              <div className="p-4 space-y-4">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <Stepper label={t('combos.builder.min')} value={slot.min_select} min={0} max={slot.max_select} onChange={(v) => patchSlot(slot.key, { min_select: v })} />
                  <Stepper label={t('combos.builder.max')} value={slot.max_select} min={Math.max(1, slot.min_select)} max={MAX_PICKS} onChange={(v) => patchSlot(slot.key, { max_select: v })} />
                  <p className="text-sm text-muted pb-3">
                    {slot.min_select === 0
                      ? t('combos.builder.ruleOptional', { max: slot.max_select })
                      : slot.min_select === slot.max_select
                        ? t('combos.builder.ruleExactly', { count: slot.min_select })
                        : t('combos.builder.ruleRange', { min: slot.min_select, max: slot.max_select })}
                  </p>
                </div>

                {slot.min_select > 0 && slot.choices.length > 0 && !slot.choices.some((c) => c.is_default && c.menu_item_id !== null) && (
                  <InlineNotice tone="warning">{t('combos.builder.noDefaultWarning')}</InlineNotice>
                )}
                <div className="space-y-2">
                  {slot.choices.map((choice) => {
                    const item = choice.menu_item_id !== null ? itemById.get(choice.menu_item_id) : undefined
                    const category = choice.category_id !== null ? catById.get(choice.category_id) : undefined
                    const catCount = category ? items.filter((i) => i.category_id === category.id && !i.is_combo && i.id !== comboId).length : 0
                    const missing = !item && !category
                    return (
                      <div key={choice.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 ps-3 pe-1 py-1">
                        <span
                          className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-xl"
                          style={{ background: categoryTint(item?.category_id ?? category?.id ?? null, 16) }}
                        >
                          {category ? <FolderOpen className="h-5 w-5 text-ink-2" /> : item?.emoji || '🍽️'}
                        </span>
                        <div className="flex-1 min-w-[9rem]">
                          <p className={cn('font-semibold truncate', missing ? 'text-danger-ink' : 'text-ink')}>
                            {item ? getName(item) : category ? t('combos.builder.wholeCategory', { category: getName(category) }) : t('combos.builder.missingChoice')}
                          </p>
                          <p className="text-xs text-muted">
                            {item ? <Money value={item.price} decimals={0} /> : category ? t('combos.builder.categoryCount', { count: catCount }) : null}
                            {item?.sold_out ? <> · <span className="text-danger-ink font-semibold">{t('menu.badges.soldOut')}</span></> : null}
                          </p>
                        </div>
                        <div className="w-36">
                          <Input
                            aria-label={t('combos.builder.upcharge')}
                            placeholder="0"
                            inputMode="decimal"
                            className="num"
                            leading={<span className="text-sm font-bold">+</span>}
                            trailing={<CurrencyTag />}
                            {...kb.bind(choice.upcharge, (v) => patchChoice(slot.key, choice.key, { upcharge: v }), 'numeric')}
                          />
                        </div>
                        {item ? (
                          <button
                            type="button"
                            aria-pressed={choice.is_default}
                            onClick={() => patchChoice(slot.key, choice.key, { is_default: !choice.is_default })}
                            className={cn(
                              'tap min-h-11 rounded-xl px-3 flex items-center gap-1.5 text-sm font-semibold border',
                              choice.is_default ? 'bg-primary-soft text-primary-ink border-primary/40' : 'bg-surface text-muted border-line hover:text-ink dark:bg-surface-2'
                            )}
                          >
                            <Star className={cn('h-4 w-4', choice.is_default && 'fill-current')} />
                            {t('combos.builder.default')}
                          </button>
                        ) : (
                          <span className="w-[6.5rem]" />
                        )}
                        <IconButton icon={<X />} variant="danger" label={t('common.remove')} onClick={() => patchSlot(slot.key, { choices: slot.choices.filter((c) => c.key !== choice.key) })} />
                      </div>
                    )
                  })}
                  {noChoices && <InlineNotice tone="danger">{t('combos.errors.noChoices', { slot: slot.name || `#${index + 1}` })}</InlineNotice>}
                </div>

                {picking === slot.key ? (
                  <ComboChoicePicker
                    slot={slot}
                    items={items}
                    categories={categories}
                    comboId={comboId}
                    onChange={(choices) => patchSlot(slot.key, { choices })}
                    onDone={() => setPicking(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="soft" size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setPicking(slot.key)}>
                      {t('combos.builder.addChoices')}
                    </Button>
                    <Badge variant="neutral">{t('combos.builder.offers', { count: offered })}</Badge>
                  </div>
                )}
              </div>
            </section>
          )
        })}

        <div className="rounded-2xl border-2 border-dashed border-line-strong p-4">
          <p className="text-sm font-semibold text-ink-2 mb-2">{slots.length ? t('combos.builder.addPart') : t('combos.builder.firstPart')}</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PARTS.filter((part) => !usedParts.has(t(`combos.parts.${part}`, { lng: 'en' }).toLowerCase())).map((part) => (
              <Button key={part} variant="secondary" size="lg" icon={<Plus className="h-4 w-4" />} onClick={() => addSlot(part)}>
                {t(`combos.parts.${part}`)}
              </Button>
            ))}
            <Button variant="ghost" size="lg" icon={<Plus className="h-4 w-4" />} onClick={() => addSlot()}>
              {t('combos.builder.customPart')}
            </Button>
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-0 self-start">
        <ComboPricePreview comboPrice={comboPrice} comboId={comboId} slots={slots} items={items} />
      </aside>
      {kb.keyboard}
    </div>
  )
}
