import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton, cn } from '../../components/ui'
import { useTouchKeyboard } from './catalogShared'
import {
  canonicalRecipeUnit,
  compatibleUnits,
  defaultUnitFor,
  isBlockingIssue,
  unitLabel,
  UNIT_LABELS,
  type RecipeIssue,
  type RecipeRow,
  type StockOption
} from './recipeUnits'

interface RecipeEditorProps {
  rows: RecipeRow[]
  onChange: (rows: RecipeRow[]) => void
  stockItems: StockOption[]
  issues: (RecipeIssue | null)[]
  /** Show blocking problems in red (after a save attempt on a changed recipe). */
  showErrors: boolean
  getName: (item: any) => string
  /** Names of stock items that are referenced by the recipe but no longer active. */
  deletedStockNames: Record<number, string>
  /** Heading override (option ingredients reuse this editor). */
  title?: ReactNode
  hint?: string
  addLabel?: string
  /** Shown instead of the rows when there are none. */
  emptyText?: ReactNode
}

const selectClass =
  'min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink dark:bg-surface-2 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60 disabled:bg-surface-2'

export function RecipeEditor({
  rows,
  onChange,
  stockItems,
  issues,
  showErrors,
  getName,
  deletedStockNames,
  title,
  hint,
  addLabel,
  emptyText
}: RecipeEditorProps) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const stockById = new Map(stockItems.map((stock) => [stock.id, stock]))

  const update = (index: number, patch: Partial<RecipeRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const pickStock = (index: number, stockId: number) => {
    const stock = stockById.get(stockId)
    const current = canonicalRecipeUnit(rows[index].unit)
    const allowed = compatibleUnits(stock?.unit_type)
    // Keep a unit that still fits (g stays g for another kg item), otherwise switch family.
    update(index, {
      stock_item_id: stockId,
      unit: allowed.includes(current) ? current : defaultUnitFor(stock?.unit_type)
    })
  }

  const issueText = (issue: RecipeIssue): string => {
    switch (issue.kind) {
      case 'noStock': return t('menu.recipe.chooseStockItem')
      case 'deletedStock': return t('menu.recipe.deletedStockItem')
      case 'quantity': return t('menu.recipe.quantityRequired')
      case 'duplicate': return t('menu.recipe.duplicateStockItem', { name: issue.name })
      case 'unit':
        return t('menu.recipe.incompatibleUnit', {
          unit: unitLabel(issue.unit),
          name: getName(issue.stock),
          stockUnit: UNIT_LABELS[issue.stock.unit_type] ?? issue.stock.unit_type,
          options: compatibleUnits(issue.stock.unit_type).map((u) => UNIT_LABELS[u]).join(' / ')
        })
      case 'large':
        return t('menu.recipe.largeQuantity', { quantity: issue.quantity, unit: unitLabel(issue.unit) })
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink" title={hint ?? t('menu.recipe.unitHint')}>{title ?? t('menu.ingredients')}</h3>
        </div>
        <Button
          variant="soft"
          size="md"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => onChange([...rows, { stock_item_id: 0, quantity: '', unit: '' }])}
        >
          {addLabel ?? t('menu.addIngredient')}
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
          {emptyText ?? t('menu.recipe.empty')}
        </p>
      )}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const stock = stockById.get(row.stock_item_id)
          const unit = canonicalRecipeUnit(row.unit)
          const allowed = compatibleUnits(stock?.unit_type)
          // Always render the TRUE stored unit, even an incompatible legacy one, so the
          // select never silently displays a different unit than the one that is saved.
          const unitOptions = unit && !allowed.includes(unit) ? [...allowed, unit] : allowed
          const issue = issues[i]
          const blocking = isBlockingIssue(issue)
          const errorTone = blocking && showErrors
          const bad = errorTone ? 'border-danger bg-danger-soft/40' : ''
          return (
            <div key={i} className="rounded-xl bg-surface-2/60 border border-line p-2">
              <div className="flex items-center gap-2">
                <select
                  data-ui="select"
                  value={row.stock_item_id}
                  onChange={(e) => pickStock(i, Number(e.target.value))}
                  className={cn(selectClass, 'flex-1 min-w-0', bad)}
                  aria-label={t('menu.stockItem')}
                >
                  <option value={0}>{t('menu.stockItem')}</option>
                  {row.stock_item_id > 0 && !stock && (
                    <option value={row.stock_item_id}>
                      {deletedStockNames[row.stock_item_id] ?? `#${row.stock_item_id}`} ({t('menu.recipe.deleted')})
                    </option>
                  )}
                  {stockItems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getName(s)} ({UNIT_LABELS[s.unit_type] ?? s.unit_type})
                    </option>
                  ))}
                </select>
                <input
                  data-ui="input"
                  type="text"
                  inputMode="decimal"
                  {...kb.bind(row.quantity, (value) => update(i, { quantity: value }), 'numeric')}
                  placeholder={t('menu.quantity')}
                  aria-label={t('menu.quantity')}
                  className={cn(selectClass, 'num w-24 text-end', bad)}
                />
                <select
                  data-ui="select"
                  value={unit}
                  onChange={(e) => update(i, { unit: e.target.value })}
                  disabled={!stock}
                  className={cn(selectClass, 'w-20', bad)}
                  aria-label={t('menu.unit')}
                >
                  {!unit && <option value="">—</option>}
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>
                  ))}
                </select>
                <IconButton
                  icon={<Trash2 />}
                  label={t('common.remove')}
                  variant="danger"
                  onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                />
              </div>
              {issue && (showErrors || !blocking || issue.kind === 'unit' || issue.kind === 'deletedStock') && (
                <p className={cn('text-xs font-medium mt-1.5 px-1', errorTone ? 'text-danger-ink' : 'text-warning-ink')}>
                  {issueText(issue)}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {kb.keyboard}
    </div>
  )
}
