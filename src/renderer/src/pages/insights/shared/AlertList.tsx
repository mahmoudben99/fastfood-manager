import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BellOff, CheckCircle2, Coins, PackageX, Percent, Send, TrendingDown, XCircle } from 'lucide-react'
import type { InsightAlert, InsightAlertKind } from '../../../../../shared/insights'
import { Badge, Button, EmptyState, cn } from '../../../components/ui'

const ICONS: Record<InsightAlertKind, typeof XCircle> = {
  cancellations: XCircle,
  discounts: Percent,
  slow_day: TrendingDown,
  low_stock: PackageX,
  margin: Coins
}

/** Where each alert kind is dealt with. */
export const ALERT_ACTIONS: Record<InsightAlertKind, { path: string; label: string }> = {
  cancellations: { path: '/admin/orders-history', label: 'insights.alerts.actions.orders' },
  discounts: { path: '/admin/orders-history', label: 'insights.alerts.actions.orders' },
  slow_day: { path: '/admin/insights/rush', label: 'insights.alerts.actions.rush' },
  low_stock: { path: '/admin/insights/prep', label: 'insights.alerts.actions.shopping' },
  margin: { path: '/admin/insights/profit', label: 'insights.alerts.actions.profit' }
}

const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 } as const
const TILE = {
  info: 'bg-info-soft text-info-ink',
  warning: 'bg-warning-soft text-warning-ink',
  critical: 'bg-danger-soft text-danger-ink'
} as const

interface AlertGroup {
  kind: InsightAlertKind
  title: string
  lines: string[]
  severity: InsightAlert['severity']
  sent: boolean
  telegramEnabled: boolean
}

/** One row per kind: several low-stock / margin alerts read as one list. */
export function groupAlerts(alerts: InsightAlert[]): AlertGroup[] {
  const groups = new Map<InsightAlertKind, AlertGroup>()
  for (const alert of alerts) {
    const group = groups.get(alert.kind)
    if (!group) {
      groups.set(alert.kind, {
        kind: alert.kind, title: alert.title, lines: [alert.message], severity: alert.severity,
        sent: alert.sent, telegramEnabled: alert.telegramEnabled
      })
      continue
    }
    group.lines.push(alert.message)
    if (SEVERITY_RANK[alert.severity] > SEVERITY_RANK[group.severity]) group.severity = alert.severity
    group.sent = group.sent && alert.sent
  }
  return [...groups.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
}

function TelegramState({ group, connected }: { group: AlertGroup; connected: boolean }) {
  const { t } = useTranslation()
  if (group.sent) return <Badge variant="success" icon={<Send />}>{t('insights.alerts.sent')}</Badge>
  if (group.telegramEnabled && connected) return <Badge variant="neutral" icon={<Send />}>{t('insights.alerts.willSend')}</Badge>
  return <Badge variant="neutral" icon={<BellOff />}>{t('insights.alerts.appOnly')}</Badge>
}

const MAX_LINES = 4

const AlertRow = memo(function AlertRow({ group, showAction, connected }: { group: AlertGroup; showAction: boolean; connected: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const Icon = ICONS[group.kind]
  const action = ALERT_ACTIONS[group.kind]
  const extra = group.lines.length - MAX_LINES
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className={cn('h-10 w-10 shrink-0 rounded-xl flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5', TILE[group.severity])}>
        <Icon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-semibold text-ink">{group.title}</p>
          <TelegramState group={group} connected={connected} />
        </div>
        <ul className="mt-1 space-y-0.5 text-sm text-muted">
          {group.lines.slice(0, MAX_LINES).map((line, i) => (
            <li key={i} className="whitespace-pre-line">{line}</li>
          ))}
          {extra > 0 && <li className="text-faint">{t('insights.alerts.more', { n: extra })}</li>}
        </ul>
      </div>
      {showAction && (
        <Button variant="soft" size="md" className="shrink-0" onClick={() => navigate(action.path)}>
          {t(action.label)}
        </Button>
      )}
    </li>
  )
})

interface AlertListProps {
  alerts: InsightAlert[]
  /** Show the "go fix it" button per row (dashboard). */
  showActions?: boolean
  /** Telegram bot configured (false: nothing can be sent, rows say "in the app only"). */
  telegramConnected?: boolean
  className?: string
}

/** Current alerts, grouped per kind, with their Telegram status. Calm empty state. */
export function AlertList({ alerts, showActions = true, telegramConnected = true, className = '' }: AlertListProps) {
  const { t } = useTranslation()
  if (alerts.length === 0) {
    return (
      <EmptyState
        compact
        className={className}
        icon={<CheckCircle2 />}
        title={t('insights.alerts.calmTitle')}
        description={t('insights.alerts.calmBody')}
      />
    )
  }
  return (
    <ul className={cn('divide-y divide-line', className)}>
      {groupAlerts(alerts).map((group) => (
        <AlertRow key={group.kind} group={group} showAction={showActions} connected={telegramConnected} />
      ))}
    </ul>
  )
}
