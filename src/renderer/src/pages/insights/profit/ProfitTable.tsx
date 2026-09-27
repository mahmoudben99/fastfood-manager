import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, TrendingUp } from 'lucide-react'
import type { MenuProfitItem, MenuProfitReport } from '../../../../../shared/insights'
import { Badge, Button, Money, Tabs, cn } from '../../../components/ui'
import { categoryColor } from '../../../theme/categoryColors'
import { formatQty, signedPct, useLocalName } from '../shared/format'
import { QUADRANT_BY_ID } from './quadrants'

type SortKey = 'name' | 'sold' | 'price' | 'cost' | 'marginDa' | 'marginPct' | 'foodCostPct'
type Filter = 'all' | 'attention' | 'combos'

const ATTENTION = new Set(['low_margin', 'no_recipe', 'cost_increase', 'unit_mismatch', 'missing_cost'])

function sortValue(item: MenuProfitItem, key: SortKey): number | string {
  switch (key) {
    case 'name': return item.name.toLowerCase()
    case 'sold': return item.qtySold
    case 'price': return item.price
    case 'cost': return item.cost ?? -1
    case 'marginDa': return item.marginDa ?? -Infinity
    case 'marginPct': return item.marginPct ?? -Infinity
    case 'foodCostPct': return item.foodCostPct ?? -1
  }
}

/** Localized name of the ingredient behind a cost increase (the report carries the base name). */
function useIncreaseName(): (item: MenuProfitItem) => string {
  const nameOf = useLocalName()
  return (item) => {
    const ing = item.ingredients.find((i) => i.stockItemId === item.costIncrease?.stockItemId)
    return ing ? nameOf(ing) : item.costIncrease?.stockItemName ?? ''
  }
}

function FlagChips({ item }: { item: MenuProfitItem }) {
  const { t } = useTranslation()
  const increaseName = useIncreaseName()
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {item.isCombo && <Badge variant="primary">{t('insights.profit.flags.combo')}</Badge>}
      {item.flags.includes('low_margin') && <Badge variant="danger" dot>{t('insights.profit.flags.lowMargin')}</Badge>}
      {item.flags.includes('no_recipe') && <Badge variant="warning" dot>{t('insights.profit.flags.noRecipe')}</Badge>}
      {item.costIncrease && (
        <Badge variant="warning" icon={<TrendingUp />}>
          {t('insights.profit.flags.costUp', { pct: signedPct(item.costIncrease.pct), ingredient: increaseName(item) })}
        </Badge>
      )}
      {item.flags.includes('unit_mismatch') && <Badge variant="danger">{t('insights.profit.flags.unitMismatch')}</Badge>}
      {item.flags.includes('missing_cost') && <Badge variant="warning">{t('insights.profit.flags.missingCost')}</Badge>}
    </div>
  )
}

function Breakdown({ item }: { item: MenuProfitItem }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useLocalName()
  const increaseName = useIncreaseName()
  if (item.ingredients.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('insights.profit.noRecipeHint')}</p>
        <Button variant="soft" onClick={() => navigate('/admin/menu')}>{t('insights.profit.addRecipe')}</Button>
      </div>
    )
  }
  return (
    <div className="space-y-3 max-w-2xl">
      {item.costIncrease && (
        <p className="text-sm text-warning-ink font-medium">
          {t('insights.profit.costIncreaseLine', {
            pct: signedPct(item.costIncrease.pct), ingredient: increaseName(item),
            ingredientPct: signedPct(item.costIncrease.ingredientPct)
          })}
        </p>
      )}
      <table className="w-full text-sm">
        <tbody>
          {item.ingredients.map((ing, i) => (
            <tr key={`${ing.stockItemId}-${i}`} className="border-t border-line first:border-t-0">
              <td className="py-1.5 pe-3 text-ink-2">
                <bdi>{nameOf(ing)}</bdi>
                {ing.via && <span className="ms-2 text-xs text-muted">({nameOf(ing.via)})</span>}
              </td>
              <td className="py-1.5 pe-3 text-end text-muted num">
                {ing.stockQuantity === null ? t('insights.profit.flags.unitMismatch') : formatQty(ing.stockQuantity, ing.stockUnit, t)}
              </td>
              <td className="py-1.5 pe-3 text-end text-muted">
                <Money value={ing.unitCost} decimals={0} /> / {t(`insights.units.${ing.stockUnit === 'kg' || ing.stockUnit === 'liter' ? ing.stockUnit : 'unit'}`)}
              </td>
              <td className="py-1.5 text-end font-semibold text-ink"><Money value={ing.cost} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ProfitTableProps {
  report: MenuProfitReport
  selectedId: number | null
  onSelect: (id: number | null) => void
}

/** Every active menu item: price, standard-build cost, margin, food cost %, class; tap a row for the recipe cost. */
export function ProfitTable({ report, selectedId, onSelect }: ProfitTableProps) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'sold', desc: true })
  const [filter, setFilter] = useState<Filter>('all')
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const combos = report.items.filter((i) => i.isCombo).length
  const attention = report.items.filter((i) => i.flags.some((f) => ATTENTION.has(f))).length

  const rows = useMemo(() => {
    const list = report.items.filter((item) =>
      filter === 'all' ? true : filter === 'combos' ? item.isCombo : item.flags.some((f) => ATTENTION.has(f)))
    return [...list].sort((a, b) => {
      const va = sortValue(a, sort.key)
      const vb = sortValue(b, sort.key)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sort.desc ? -cmp : cmp
    })
  }, [report.items, filter, sort])

  useEffect(() => {
    if (selectedId !== null) rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const header = (key: SortKey, label: string, end = true) => (
    <th scope="col" className={cn('px-3 xl:px-4 py-3 font-semibold', end ? 'text-end' : 'text-start')}>
      <button
        type="button"
        className={cn('inline-flex items-center gap-1 hover:text-ink', sort.key === key ? 'text-ink' : 'text-muted')}
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
      >
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}
      </button>
    </th>
  )

  return (
    <div>
      <div className="px-5 pt-3">
        <Tabs
          variant="pills"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: t('insights.profit.filter.all'), count: report.items.length },
            { id: 'attention', label: t('insights.profit.filter.attention'), count: attention },
            ...(combos > 0 ? [{ id: 'combos' as Filter, label: t('insights.profit.filter.combos'), count: combos }] : [])
          ]}
        />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs sticky top-0 z-[1]">
            <tr>
              {header('name', t('insights.profit.cols.item'), false)}
              {header('sold', t('insights.profit.cols.sold'))}
              {header('price', t('insights.profit.cols.price'))}
              {header('cost', t('insights.profit.cols.cost'))}
              {header('marginDa', t('insights.profit.cols.margin'))}
              {header('foodCostPct', t('insights.profit.cols.foodCost'))}
              <th scope="col" className="px-3 xl:px-4 py-3 font-semibold text-muted text-start">{t('insights.profit.cols.class')}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const open = item.menuItemId === selectedId
              const low = item.flags.includes('low_margin')
              const food = item.foodCostPct
              return (
                <Fragment key={item.menuItemId}>
                  <tr
                    ref={(el) => { if (el) rowRefs.current.set(item.menuItemId, el); else rowRefs.current.delete(item.menuItemId) }}
                    onClick={() => onSelect(open ? null : item.menuItemId)}
                    className={cn('border-t border-line cursor-pointer hover:bg-surface-2/60', open && 'bg-primary-soft/50')}
                  >
                    <td className="px-3 xl:px-4 py-3 min-w-[12rem]">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(item.categoryId) }} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink"><bdi>{nameOf(item)}</bdi></p>
                          <FlagChips item={item} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-end num text-ink-2">{item.qtySold}</td>
                    <td className="px-3 xl:px-4 py-3 text-end font-semibold text-ink"><Money value={item.price} decimals={0} /></td>
                    <td className="px-3 xl:px-4 py-3 text-end text-ink-2">{item.cost === null ? '—' : <Money value={item.cost} decimals={0} />}</td>
                    <td className="px-3 xl:px-4 py-3 text-end">
                      {item.marginDa === null ? <span className="text-faint">—</span> : (
                        <div>
                          <Money value={item.marginDa} decimals={0} className="font-bold text-ink" />
                          <p className={cn('num text-xs font-semibold', low ? 'text-danger-ink' : 'text-success-ink')}>{item.marginPct}%</p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 xl:px-4 py-3">
                      {food === null ? <span className="block text-end text-faint">—</span> : (
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden xl:block h-1.5 w-16 rounded-full bg-surface-2 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', low ? 'bg-danger' : food > 35 ? 'bg-warning' : 'bg-success')}
                              style={{ width: `${Math.min(100, Math.max(0, food))}%` }}
                            />
                          </div>
                          <span className="num w-10 text-end text-ink-2">{food}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 xl:px-4 py-3">
                      {item.quadrant ? (
                        <span title={t(`insights.profit.quadrant.${item.quadrant}.name`)}>
                          <Badge variant={QUADRANT_BY_ID[item.quadrant].badge}>
                            {QUADRANT_BY_ID[item.quadrant].emoji}
                            <span className="hidden xl:inline">{t(`insights.profit.quadrant.${item.quadrant}.name`)}</span>
                          </Badge>
                        </span>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="pe-4 text-muted">
                      <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-surface-2/40">
                      <td colSpan={8} className="px-6 py-4 animate-fade-in"><Breakdown item={item} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t('insights.profit.filterEmpty')}</p>}
      </div>
    </div>
  )
}
