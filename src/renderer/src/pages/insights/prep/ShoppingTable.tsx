import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ShoppingList } from '../../../../../shared/insights'
import { Badge, Button, EmptyState, Money, cn } from '../../../components/ui'
import { formatQty, useLocalName } from '../shared/format'

/** need / have / to buy / estimated cost per ingredient; "not enough for today" rows first. */
export function ShoppingTable({ list }: { list: ShoppingList }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useLocalName()
  // usedBy carries base names: show the consumer (menu item, combo or option) in the food language.
  const consumers = new Map<string, string>()
  for (const item of [...list.forecast.items, ...(list.forecast.combos ?? [])]) consumers.set(`m${item.menuItemId}`, nameOf(item))
  for (const option of list.forecast.options ?? []) consumers.set(`o${option.name}`, nameOf(option))
  const consumerName = (u: { menuItemId: number; name: string }) =>
    consumers.get(u.menuItemId > 0 ? `m${u.menuItemId}` : `o${u.name}`) ?? u.name

  if (list.items.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CheckCircle2 />}
        title={t('insights.prep.nothingTitle')}
        description={t('insights.prep.nothingBody')}
        action={<Button variant="soft" onClick={() => navigate('/admin/stock')}>{t('insights.prep.openStock')}</Button>}
      />
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 text-start font-semibold">{t('insights.prep.cols.ingredient')}</th>
              <th scope="col" className="px-3 py-3 text-end font-semibold">{t('insights.prep.cols.need')}</th>
              <th scope="col" className="px-3 py-3 text-end font-semibold">{t('insights.prep.cols.have')}</th>
              <th scope="col" className="px-3 py-3 text-end font-semibold">{t('insights.prep.cols.toBuy')}</th>
              <th scope="col" className="px-5 py-3 text-end font-semibold">{t('insights.prep.cols.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr key={item.stockItemId} className={cn('border-t border-line h-12', item.critical && 'bg-danger-soft/40')}>
                <td className="px-5 py-2.5 w-full max-w-0">
                  <p className="font-semibold text-ink truncate"><bdi>{nameOf(item)}</bdi></p>
                  <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                    {item.critical && <Badge variant="danger" icon={<AlertTriangle />} className="shrink-0">{t('insights.prep.critical')}</Badge>}
                    {item.reason !== 'forecast' && <Badge variant="warning" dot className="shrink-0">{t('insights.prep.lowStock')}</Badge>}
                    {item.usedBy.length > 0 && (
                      <span className="min-w-0 text-xs text-muted truncate" title={item.usedBy.map(consumerName).join(', ')}>
                        <bdi>{item.usedBy.map(consumerName).join(', ')}</bdi>
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-end num text-ink-2 whitespace-nowrap">{formatQty(item.need, item.unit, t)}</td>
                <td className={cn('px-3 py-2.5 text-end num whitespace-nowrap', item.have < item.need ? 'text-danger-ink font-semibold' : 'text-ink-2')}>
                  {formatQty(item.have, item.unit, t)}
                </td>
                <td className="px-3 py-2.5 text-end num font-bold text-ink whitespace-nowrap">{formatQty(item.toBuy, item.unit, t)}</td>
                <td className="px-5 py-2.5 text-end font-semibold text-ink"><Money value={item.estCost} decimals={0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.warnings.length > 0 && (
        <div className="m-5 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          <p className="font-semibold">{t('insights.prep.warningsTitle')}</p>
          <ul className="mt-1 list-disc ps-5 space-y-0.5">
            {list.warnings.slice(0, 5).map((w) => <li key={w}><bdi>{w}</bdi></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
