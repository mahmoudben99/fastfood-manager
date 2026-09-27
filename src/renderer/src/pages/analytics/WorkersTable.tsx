import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { Card, EmptyState, Money } from '../../components/ui'
import type { WorkerRow } from './types'

/** Orders and revenue per kitchen station / worker, with their pay for the period. */
export function WorkersTable({ workers }: { workers: WorkerRow[] }) {
  const { t } = useTranslation()
  return (
    <Card padding={false} icon={<Users />} title={t('analytics.workerPerformance')}>
      {workers.length === 0 ? (
        <EmptyState compact icon={<Users />} title={t('analytics.noWorkers')} description={t('analytics.noWorkersHint')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('workers.name')}</th>
                <th scope="col" className="px-4 py-3 text-start font-semibold">{t('workers.role')}</th>
                <th scope="col" className="px-4 py-3 text-end font-semibold">{t('analytics.ordersHandled')}</th>
                <th scope="col" className="px-4 py-3 text-end font-semibold">{t('analytics.revenue')}</th>
                <th scope="col" className="px-5 py-3 text-end font-semibold">{t('analytics.totalPay')}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-t border-line h-12">
                  <td className="px-5 py-2.5 font-semibold text-ink"><bdi>{w.name}</bdi></td>
                  <td className="px-4 py-2.5 text-ink-2">{t(`workers.roles.${w.role}`, { defaultValue: w.role })}</td>
                  <td className="px-4 py-2.5 text-end num text-ink-2">{w.orders_handled || 0}</td>
                  <td className="px-4 py-2.5 text-end font-semibold text-ink"><Money value={w.total_revenue || 0} decimals={0} /></td>
                  <td className="px-5 py-2.5 text-end text-ink-2"><Money value={w.total_pay || 0} decimals={0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
