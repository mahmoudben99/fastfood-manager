import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Trophy } from 'lucide-react'
import type { DashboardSummary } from '../../../../shared/insights'
import { Button, Card, EmptyState, Money } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { useLocalName } from '../insights/shared/format'

interface TopItemsCardProps {
  items: DashboardSummary['topItemsToday']
  className?: string
}

/** Today's best sellers: rank, category dot, name, revenue, thin share bar. */
export function TopItemsCard({ items, className = '' }: TopItemsCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useLocalName()
  const maxRevenue = Math.max(1, ...items.map((i) => i.revenue))

  return (
    <Card
      className={className}
      icon={<Trophy />}
      title={t('dashboard.top.title')}
      actions={
        <Button variant="ghost" size="sm" iconEnd={<ChevronRight className="rtl:-scale-x-100" />} onClick={() => navigate('/admin/analytics')}>
          {t('dashboard.top.all')}
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact icon={<Trophy />} title={t('dashboard.top.emptyTitle')} description={t('dashboard.top.emptyBody')} />
      ) : (
        <ol className="space-y-4">
          {items.map((item, i) => (
            <li key={item.menuItemId} className="flex items-center gap-3">
              <span className="num w-5 text-sm font-bold text-faint text-center">{i + 1}</span>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: categoryColor(item.categoryId) }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-ink truncate">
                    <bdi>{nameOf(item)}</bdi>
                    <span className="num ms-2 text-xs font-medium text-muted">×{item.quantity}</span>
                  </span>
                  <span className="text-sm font-bold text-ink shrink-0">
                    <Money value={item.revenue} decimals={0} />
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(item.revenue / maxRevenue) * 100}%`, background: categoryColor(item.categoryId) }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
