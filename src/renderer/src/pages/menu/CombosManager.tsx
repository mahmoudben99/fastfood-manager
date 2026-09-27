import { useTranslation } from 'react-i18next'
import { Ban, PackageOpen, Pencil, Plus, Star } from 'lucide-react'
import type { ComboDefinition } from '../../../../shared/catalog-types'
import { Badge, Button, EmptyState, Money, cn } from '../../components/ui'
import { categoryColor, categoryTint } from '../../theme/categoryColors'
import { useFoodName } from './catalogShared'
import { allocate, comboToDrafts, examplePicks } from './comboLogic'
import type { CategoryRow, MenuRow } from './menuTypes'

interface CombosManagerProps {
  combos: ComboDefinition[]
  items: MenuRow[]
  categories: CategoryRow[]
  onCreate: () => void
  onEdit: (comboId: number) => void
}

/** Every combo at a glance: its parts, what the customer picks and what they save. */
export function CombosManager({ combos, items, categories, onCreate, onEdit }: CombosManagerProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const itemById = new Map(items.map((i) => [i.id, i]))
  const catById = new Map(categories.map((c) => [c.id, c]))
  const active = combos.filter((combo) => combo.is_active === 1)

  if (active.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-line-strong bg-surface">
        <EmptyState
          icon={<PackageOpen />}
          title={t('combos.emptyTitle')}
          description={t('combos.emptyBody')}
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={onCreate}>{t('combos.newCombo')}</Button>}
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))] gap-4">
      {active.map((combo) => {
        const item = itemById.get(combo.menu_item_id)
        const slots = comboToDrafts(combo)
        const picks = examplePicks(slots, items, combo.menu_item_id)
        const separate = picks.reduce((sum, p) => sum + p.item.price + p.upcharge, 0)
        const total = combo.price + picks.reduce((sum, p) => sum + p.upcharge, 0)
        const saving = separate - total
        const shares = allocate(total, picks.map((p) => ({ weight: p.item.price, own: p.upcharge })))
        const soldOut = item?.sold_out === 1
        return (
          <article key={combo.menu_item_id} className="contain-card rounded-2xl border border-line bg-surface shadow-e1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-4 p-4 border-b border-line relative">
              <span className="absolute top-0 inset-x-0 h-1" style={{ background: categoryColor(item?.category_id ?? null) }} />
              <div
                className={cn('h-16 w-16 shrink-0 rounded-2xl flex items-center justify-center text-4xl overflow-hidden', soldOut && 'opacity-55')}
                style={{ background: categoryTint(item?.category_id ?? null, 22) }}
              >
                {item?.image_path ? <img src={`app-image://${item.image_path}`} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : item?.emoji || '🍱'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="solid" icon={<PackageOpen />}>{t('menu.badges.combo')}</Badge>
                  {soldOut && <Badge variant="danger" icon={<Ban />}>{t('menu.badges.soldOut')}</Badge>}
                </div>
                <p className="mt-1 text-lg font-bold text-ink truncate">{getName(combo)}</p>
              </div>
              <div className="text-end">
                <p className="text-xl font-extrabold text-ink"><Money value={combo.price} decimals={0} /></p>
                {saving > 0 && (
                  <p className="text-xs font-semibold text-success-ink">
                    {t('combos.card.saves')} <Money value={saving} decimals={0} />
                  </p>
                )}
              </div>
            </div>

            <ol className="flex-1 divide-y divide-line">
              {combo.slots.map((slot, index) => {
                const defaults = slot.choices.filter((c) => c.is_default === 1 && c.menu_item_id !== null)
                const pickText =
                  slot.min_select === slot.max_select
                    ? t('combos.builder.ruleExactly', { count: slot.min_select })
                    : slot.min_select === 0
                      ? t('combos.builder.ruleOptional', { max: slot.max_select })
                      : t('combos.builder.ruleRange', { min: slot.min_select, max: slot.max_select })
                return (
                  <li key={slot.id} className="px-4 py-2.5 flex items-start gap-3">
                    <span className="num mt-0.5 h-6 w-6 shrink-0 rounded-full bg-surface-3 text-ink-2 text-xs font-extrabold flex items-center justify-center">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink">
                        {getName(slot)} <span className="text-xs font-medium text-muted">· {pickText}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {slot.choices.slice(0, 6).map((choice) => {
                          const choiceItem = choice.menu_item_id !== null ? itemById.get(choice.menu_item_id) : undefined
                          const category = choice.category_id !== null ? catById.get(choice.category_id) : undefined
                          const label = choiceItem ? getName(choiceItem) : category ? t('combos.builder.wholeCategory', { category: getName(category) }) : choice.menu_item_name ?? choice.category_name ?? '?'
                          return (
                            <span key={choice.id} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', choice.is_default ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-ink-2')}>
                              {choice.is_default === 1 && <Star className="h-3 w-3 fill-current" />}
                              {label}
                              {choice.upcharge > 0 && <bdi dir="ltr" className="num opacity-80">+{choice.upcharge}</bdi>}
                            </span>
                          )
                        })}
                        {slot.choices.length > 6 && <span className="rounded-lg px-2 py-1 text-xs font-semibold bg-surface-2 text-muted">+{slot.choices.length - 6}</span>}
                        {defaults.length === 0 && <span className="text-xs text-muted self-center">{t('combos.card.noDefault')}</span>}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2">
              <div className="flex-1 min-w-0 flex h-2 rounded-full overflow-hidden bg-surface-3" aria-label={t('combos.preview.title')}>
                {picks.map((pick, i) => (
                  <span key={`${pick.item.id}-${i}`} style={{ width: `${total > 0 ? ((shares[i] ?? 0) / total) * 100 : 0}%`, background: categoryColor(pick.item.category_id) }} />
                ))}
              </div>
              <Button variant="secondary" size="lg" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(combo.menu_item_id)}>
                {t('combos.card.edit')}
              </Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
