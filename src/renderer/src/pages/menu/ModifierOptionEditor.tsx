import { useTranslation } from 'react-i18next'
import { ChevronDown, Star, Trash2 } from 'lucide-react'
import type { ModifierKind } from '../../../../shared/catalog-types'
import { Badge, IconButton, Input, SegmentedControl, Toggle, cn } from '../../components/ui'
import { CurrencyTag, InlineNotice, MoveButtons, formatDelta, parseAmount, useFoodName, useTouchKeyboard } from './catalogShared'
import { MODIFIER_KINDS, optionDelta, type OptionDraft } from './modifierLogic'
import { RecipeEditor } from './RecipeEditor'
import { checkRecipeRows, type StockOption } from './recipeUnits'

interface ModifierOptionEditorProps {
  option: OptionDraft
  index: number
  count: number
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<OptionDraft>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  stockItems: StockOption[]
  showErrors: boolean
}

export const KIND_CHIP: Record<ModifierKind, string> = {
  none: 'bg-surface-3 text-ink-2',
  extra: 'bg-primary-soft text-primary-ink',
  light: 'bg-info-soft text-info-ink',
  no: 'bg-danger-soft text-danger-ink'
}

/** One option of a group: a compact summary row that expands into its full editor. */
export function ModifierOptionEditor({
  option,
  index,
  count,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
  stockItems,
  showErrors
}: ModifierOptionEditorProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const delta = optionDelta(option)
  const nameMissing = showErrors && !option.name.trim()

  return (
    <div className={cn('rounded-2xl border bg-surface', expanded ? 'border-primary/50 shadow-e2' : 'border-line', !option.is_active && 'opacity-70')}>
      <div className="flex items-center gap-2 p-2 ps-1">
        <MoveButtons onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={index > 0} canDown={index < count - 1} />
        <button type="button" onClick={onToggle} className="tap flex-1 min-w-0 flex items-center gap-3 min-h-12 rounded-xl px-2 text-start hover:bg-surface-2" aria-expanded={expanded}>
          <span className={cn('shrink-0 rounded-lg px-2 py-1 text-xs font-bold', KIND_CHIP[option.kind])}>
            {t(`modifiers.kind.${option.kind}`)}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block font-semibold truncate', nameMissing ? 'text-danger-ink' : 'text-ink')}>
              {option.name.trim() ? getName({ name: option.name, name_ar: option.name_ar, name_fr: option.name_fr }) : t('modifiers.option.untitled')}
            </span>
            {(option.name_ar || option.name_fr) && (
              <span className="block text-xs text-muted truncate">{[option.name_ar, option.name_fr].filter(Boolean).join(' · ')}</span>
            )}
          </span>
          {option.is_default && (
            <Badge variant="primary" icon={<Star className="fill-current" />}>{t('modifiers.option.defaultShort')}</Badge>
          )}
          {!option.is_active && <Badge variant="neutral">{t('modifiers.option.hidden')}</Badge>}
          <bdi dir="ltr" className={cn('num shrink-0 text-sm font-bold', delta < 0 ? 'text-success-ink' : 'text-ink')}>
            {delta ? formatDelta(delta) : t('modifiers.option.free')}
          </bdi>
          <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} />
        </button>
        <IconButton icon={<Trash2 />} label={t('modifiers.option.remove')} variant="danger" onClick={onRemove} />
      </div>

      {expanded && (
        <div className="border-t border-line p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label={t('menu.name')} error={nameMissing ? t('modifiers.errors.optionName') : undefined} {...kb.bind(option.name, (v) => onChange({ name: v }))} />
            <Input label={t('menu.nameAr')} dir="rtl" {...kb.bind(option.name_ar, (v) => onChange({ name_ar: v }), 'text', true)} />
            <Input label={t('menu.nameFr')} {...kb.bind(option.name_fr, (v) => onChange({ name_fr: v }))} />
          </div>

          <div>
            <p className="text-sm font-medium text-ink-2 mb-1.5">{t('modifiers.option.kindLabel')}</p>
            <SegmentedControl<ModifierKind>
              fullWidth
              value={option.kind}
              onChange={(kind) => onChange({ kind })}
              options={MODIFIER_KINDS.map((kind) => ({ value: kind, label: t(`modifiers.kind.${kind}`) }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-end">
            <div>
              <p className="text-sm font-medium text-ink-2 mb-1.5">{t('modifiers.option.priceLabel')}</p>
              <SegmentedControl<'plus' | 'minus'>
                value={option.negative ? 'minus' : 'plus'}
                onChange={(sign) => onChange({ negative: sign === 'minus' })}
                options={[
                  { value: 'plus', label: t('modifiers.option.adds') },
                  { value: 'minus', label: t('modifiers.option.takesOff') }
                ]}
              />
            </div>
            <Input
              aria-label={t('modifiers.option.priceLabel')}
              inputMode="decimal"
              placeholder="0"
              className="num"
              leading={<span className="text-base font-bold">{option.negative ? '−' : '+'}</span>}
              trailing={<CurrencyTag />}
              error={showErrors && option.price.trim() && !Number.isFinite(parseAmount(option.price)) ? t('modifiers.errors.optionPrice') : undefined}
              {...kb.bind(option.price, (v) => onChange({ price: v.replace('-', '') }), 'numeric')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 rounded-xl bg-surface-2/60 border border-line px-4 py-1">
            <Toggle
              checked={option.is_default}
              onChange={(v) => onChange({ is_default: v })}
              label={t('modifiers.option.default')}
            />
            <Toggle
              checked={option.is_active}
              onChange={(v) => onChange({ is_active: v })}
              label={t('modifiers.option.active')}
            />
          </div>

          {option.kind === 'no' ? (
            <InlineNotice tone="info">{t('modifiers.option.noStock')}</InlineNotice>
          ) : (
            <RecipeEditor
              rows={option.ingredients}
              onChange={(rows) => onChange({ ingredients: rows })}
              stockItems={stockItems}
              issues={checkRecipeRows(option.ingredients, stockItems)}
              showErrors={showErrors}
              getName={getName}
              deletedStockNames={{}}
              title={t('modifiers.option.ingredients')}
              hint={t('modifiers.option.ingredientsHint')}
              emptyText={t('modifiers.option.noIngredients')}
            />
          )}
        </div>
      )}
      {kb.keyboard}
    </div>
  )
}
