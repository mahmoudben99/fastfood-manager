import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
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
}

export function RecipeEditor({
  rows,
  onChange,
  stockItems,
  issues,
  showErrors,
  getName,
  deletedStockNames
}: RecipeEditorProps) {
  const { t } = useTranslation()
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
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">{t('menu.ingredients')}</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...rows, { stock_item_id: 0, quantity: '', unit: '' }])}
        >
          <Plus className="h-4 w-4" />
          {t('menu.addIngredient')}
        </Button>
      </div>
      {rows.length > 0 && <p className="text-xs text-gray-400 mb-2">{t('menu.recipe.unitHint')}</p>}
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
          const tone = blocking && showErrors ? 'text-red-600' : 'text-amber-600'
          const border = blocking && showErrors ? 'border-red-300 bg-red-50' : ''
          return (
            <div key={i}>
              <div className="flex items-center gap-2">
                <select
                  value={row.stock_item_id}
                  onChange={(e) => pickStock(i, Number(e.target.value))}
                  className={`flex-1 border rounded-lg px-2 py-1.5 text-sm ${border}`}
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
                  type="text"
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(e) => update(i, { quantity: e.target.value })}
                  placeholder={t('menu.quantity')}
                  className={`w-24 border rounded-lg px-2 py-1.5 text-sm ${border}`}
                />
                <select
                  value={unit}
                  onChange={(e) => update(i, { unit: e.target.value })}
                  disabled={!stock}
                  className={`w-20 border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100 ${border}`}
                >
                  {!unit && <option value="">—</option>}
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                  className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500"
                  title={t('common.remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {issue && (showErrors || !blocking || issue.kind === 'unit' || issue.kind === 'deletedStock') && (
                <p className={`text-xs mt-1 ${tone}`}>{issueText(issue)}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
