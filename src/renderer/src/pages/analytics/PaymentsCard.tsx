import { useTranslation } from 'react-i18next'
import { Banknote, CreditCard, QrCode, Smartphone, Wallet } from 'lucide-react'
import { paymentMethodLabel, type CashLang } from '../../../../shared/cash'
import { Card, EmptyState, Money, cn } from '../../components/ui'
import type { MethodRow } from './types'

const ICONS: Record<string, typeof Banknote> = { cash: Banknote, cib: CreditCard, edahabia: CreditCard, baridipay: QrCode, transfer: Smartphone }
const BAR: Record<string, string> = { cash: 'var(--success)', cib: 'var(--info)', edahabia: 'var(--warning)', baridipay: 'var(--cat-6)', transfer: 'var(--cat-4)' }

/** Money collected per payment method (net of refunds; pre-v4 orders count as cash). CSS bars. */
export function PaymentsCard({ methods, labels, className = '' }: { methods: MethodRow[]; labels: Record<string, string>; className?: string }) {
  const { t, i18n } = useTranslation()
  const lang = (['en', 'fr', 'ar'].includes(i18n.language) ? i18n.language : 'en') as CashLang
  const rows = methods.filter((m) => Math.abs(m.amount) > 0.004)
  const total = rows.reduce((sum, m) => sum + Math.max(0, m.amount), 0)

  return (
    <Card className={className} icon={<Wallet />} title={t('analytics.byMethod')} subtitle={t('analytics.byMethodSubtitle')}>
      {rows.length === 0 ? (
        <EmptyState compact icon={<Wallet />} title={t('analytics.noData')} description={t('analytics.noDataHint')} />
      ) : (
        <ul className="space-y-4">
          {rows.map((m) => {
            const Icon = ICONS[m.method] ?? Wallet
            const share = total > 0 ? Math.max(0, m.amount) / total : 0
            return (
              <li key={m.method}>
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 shrink-0 rounded-xl bg-surface-2 text-ink-2 flex items-center justify-center"><Icon className="h-[18px] w-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{paymentMethodLabel(m.method, lang, labels[m.method])}</span>
                      <Money value={m.amount} decimals={0} className={cn('text-sm font-bold', m.amount < 0 ? 'text-danger-ink' : 'text-ink')} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: BAR[m.method] ?? 'var(--cat-10)' }} />
                      </div>
                      <span className="num w-20 text-end text-xs text-muted">{Math.round(share * 100)}% · {m.count}</span>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
