import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BellRing, ChevronRight, Info, LayoutDashboard, RefreshCw, Truck } from 'lucide-react'
import { Button, Card, IconButton, Money, PageHeader, Skeleton } from '../../components/ui'
import { useAppStore } from '../../store/appStore'
import { AlertList } from '../insights/shared/AlertList'
import { longDate, today } from '../insights/shared/format'
import { KpiRow } from './KpiRow'
import { HourlyCard } from './HourlyCard'
import { TopItemsCard } from './TopItemsCard'
import { StatusTiles } from './StatusTiles'
import { QuickActions } from './QuickActions'
import { WelcomePanel } from './WelcomePanel'
import { isNewRestaurant, useDashboardData } from './useDashboardData'

function greetingKey(hour: number): string {
  if (hour < 5) return 'dashboard.greeting.night'
  if (hour < 12) return 'dashboard.greeting.morning'
  if (hour < 18) return 'dashboard.greeting.afternoon'
  return 'dashboard.greeting.evening'
}

/** Admin home (#/admin/dashboard): today at a glance, what needs attention, one-tap actions. */
export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const restaurantName = useAppStore((s) => s.restaurantName)
  const { data, loading, error, refresh } = useDashboardData()
  const summary = data.summary
  const date = summary?.date ?? today()
  const isNew = isNewRestaurant(summary)
  const alerts = summary?.pendingAlerts ?? []

  return (
    <div className="space-y-6 max-w-[1600px]">
      <PageHeader
        icon={<LayoutDashboard />}
        title={
          restaurantName
            ? t('dashboard.greeting.withName', { greeting: t(greetingKey(new Date().getHours())), name: restaurantName })
            : t(greetingKey(new Date().getHours()))
        }
        subtitle={
          <>
            <span className="capitalize">{longDate(date, i18n.language)}</span>
            {summary && <span className="text-faint"> · {t('dashboard.updated', { time: summary.asOf })}</span>}
          </>
        }
        actions={<IconButton icon={<RefreshCw />} label={t('dashboard.refresh')} variant="secondary" size="lg" onClick={() => void refresh()} />}
      />

      {error && !summary && (
        <Card variant="flat" className="border-danger/40">
          <p className="text-sm text-danger-ink font-medium">{t('dashboard.loadError')}</p>
        </Card>
      )}

      {isNew ? (
        <WelcomePanel setup={data.setup} restaurantName={restaurantName} />
      ) : (
        <>
          <KpiRow summary={summary} loading={loading} />
          {summary && summary.deliveryFeesToday > 0 && (
            <p className="-mt-2 flex items-center gap-2 text-xs text-muted" title={t('dashboard.deliveryHint')}>
              <Truck className="h-4 w-4 text-faint" />
              {t('dashboard.deliveryFees')} <Money value={summary.deliveryFeesToday} decimals={0} className="font-semibold text-ink-2" />
              <Info className="h-3.5 w-3.5 text-faint" aria-label={t('dashboard.deliveryHint')} />
            </p>
          )}
        </>
      )}

      <StatusTiles data={data} />

      {!isNew && (
        <div className="grid xl:grid-cols-5 gap-4">
          {summary ? (
            <>
              <HourlyCard className="xl:col-span-3" hourly={summary.hourly} date={summary.date} asOf={summary.asOf} />
              <TopItemsCard className="xl:col-span-2" items={summary.topItemsToday} />
            </>
          ) : (
            <>
              <Skeleton className="xl:col-span-3 h-72 rounded-2xl" />
              <Skeleton className="xl:col-span-2 h-72 rounded-2xl" />
            </>
          )}
        </div>
      )}

      <div className="grid xl:grid-cols-5 gap-4 items-start">
        <Card
          className="xl:col-span-3"
          padding={false}
          icon={<BellRing />}
          title={t('dashboard.alerts.title')}
          actions={
            <Button variant="ghost" size="sm" iconEnd={<ChevronRight className="rtl:-scale-x-100" />} onClick={() => navigate('/admin/insights/alerts')}>
              {t('dashboard.alerts.settings')}
            </Button>
          }
        >
          {loading ? <div className="p-5"><Skeleton className="h-20" /></div> : <AlertList alerts={alerts} telegramConnected={data.telegram !== false} />}
        </Card>
        <QuickActions className="xl:col-span-2" shiftOpen={Boolean(data.shift)} />
      </div>
    </div>
  )
}
