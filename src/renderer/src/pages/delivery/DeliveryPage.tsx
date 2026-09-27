import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Bike, SquareKanban, MapPinned, Wallet } from 'lucide-react'
import { PageHeader, Tabs } from '../../components/ui'
import { DeliveryBoard } from './DeliveryBoard'
import { ZonesManager } from './ZonesManager'
import { DriverSettlement } from './DriverSettlement'

type DeliveryTab = 'board' | 'zones' | 'drivers'
const TABS: DeliveryTab[] = ['board', 'zones', 'drivers']

/** v4 admin "Delivery" page (#/admin/delivery?tab=board|zones|drivers). */
export function DeliveryPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as DeliveryTab | null
  const tab: DeliveryTab = raw && TABS.includes(raw) ? raw : 'board'

  return (
    <div className="[&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none">
      <PageHeader title={t('delivery.title')} icon={<Bike />} />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={[
          { id: 'board', label: t('delivery.tabs.board'), icon: <SquareKanban /> },
          { id: 'zones', label: t('delivery.tabs.zones'), icon: <MapPinned /> },
          { id: 'drivers', label: t('delivery.tabs.drivers'), icon: <Wallet /> }
        ]}
      />
      {tab === 'board' && <DeliveryBoard />}
      {tab === 'zones' && <ZonesManager />}
      {tab === 'drivers' && <DriverSettlement />}
    </div>
  )
}
