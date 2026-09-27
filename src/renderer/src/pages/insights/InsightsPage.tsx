import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { BellRing, ClipboardList, Clock3, Coins, Lightbulb } from 'lucide-react'
import { PageHeader, Tabs } from '../../components/ui'
import { MenuProfitTab } from './profit/MenuProfitTab'
import { PrepTab } from './prep/PrepTab'
import { RushHoursTab } from './rush/RushHoursTab'
import { AlertsSettingsTab } from './alerts/AlertsSettingsTab'

export const INSIGHT_TABS = ['profit', 'prep', 'rush', 'alerts'] as const
export type InsightTab = (typeof INSIGHT_TABS)[number]

/** #/admin/insights/:tab — menu profit, prep & shopping, rush hours, alerts & Telegram. */
export function InsightsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tab } = useParams<{ tab: string }>()
  if (!INSIGHT_TABS.includes(tab as InsightTab)) return <Navigate to="/admin/insights/profit" replace />
  const active = tab as InsightTab

  return (
    <div className="max-w-[1600px]">
      <PageHeader icon={<Lightbulb />} title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <Tabs
        className="mb-6"
        value={active}
        onChange={(id) => navigate(`/admin/insights/${id}`)}
        tabs={[
          { id: 'profit', label: t('insights.tabs.profit'), icon: <Coins /> },
          { id: 'prep', label: t('insights.tabs.prep'), icon: <ClipboardList /> },
          { id: 'rush', label: t('insights.tabs.rush'), icon: <Clock3 /> },
          { id: 'alerts', label: t('insights.tabs.alerts'), icon: <BellRing /> }
        ]}
      />
      {active === 'profit' && <MenuProfitTab />}
      {active === 'prep' && <PrepTab />}
      {active === 'rush' && <RushHoursTab />}
      {active === 'alerts' && <AlertsSettingsTab />}
    </div>
  )
}
