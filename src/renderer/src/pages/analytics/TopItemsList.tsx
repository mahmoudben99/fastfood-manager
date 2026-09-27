import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react'
import { Card, EmptyState, Money } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { useLocalName } from '../insights/shared/format'
import type { TopItemRow } from './types'

/** Best sellers of the period: rank, category dot, quantity, revenue share bar (CSS only). */
export function TopItemsList({ items, categoryIds, className = '' }: { items: TopItemRow[]; categoryIds: Record<string, number>; className?: string }) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const max = Math.max(1, ...items.map((i) => i.total_quantity))

  return (
    <Card className={className} icon={<Trophy />} title={t('analytics.topItems')}>
      {items.length === 0 ? (
        <EmptyState compact icon={<Trophy />} title={t('analytics.noData')} description={t('analytics.noDataHint')} />
      ) : (
        <ol className="space-y-3.5">
          {items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="flex items-center gap-3">
              <span className="num w-5 text-center text-sm font-bold text-faint">{i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(categoryIds[item.category_name] ?? item.category_name) }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-ink">
                    <bdi>{nameOf(item)}</bdi>
                    <span className="ms-2 text-xs font-medium text-muted">{item.category_name}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="num text-xs font-semibold text-muted">×{item.total_quantity}</span>
                    <Money value={item.total_revenue} decimals={0} className="text-sm font-bold text-ink" />
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(item.total_quantity / max) * 100}%`, background: categoryColor(categoryIds[item.category_name] ?? item.category_name) }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
