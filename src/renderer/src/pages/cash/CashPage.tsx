import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, Settings2, Timer, Wallet } from 'lucide-react'
import { PageHeader, Tabs } from '../../components/ui'
import { ShiftsTab } from './shifts/ShiftsTab'
import { PaymentsTab } from './payments/PaymentsTab'
import { CashSettingsTab } from './settings/CashSettingsTab'

type CashTab = 'shifts' | 'payments' | 'settings'
const TABS: CashTab[] = ['shifts', 'payments', 'settings']

/**
 * v4 admin "Cash" page (#/admin/cash?tab=shifts|payments|settings): shifts & drawer, payments,
 * refunds and invoices, and the cash settings (payment methods, rounding, shifts, approvals, legal).
 */
export function CashPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as CashTab | null
  const tab: CashTab = raw && TABS.includes(raw) ? raw : 'shifts'

  return (
    <div className="[&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none">
      <PageHeader title={t('cashAdmin.title')} icon={<Wallet />} />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={[
          { id: 'shifts', label: t('cashAdmin.tabs.shifts'), icon: <Timer /> },
          { id: 'payments', label: t('cashAdmin.tabs.payments'), icon: <CreditCard /> },
          { id: 'settings', label: t('cashAdmin.tabs.settings'), icon: <Settings2 /> }
        ]}
      />
      {tab === 'shifts' && <ShiftsTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'settings' && <CashSettingsTab />}
    </div>
  )
}
