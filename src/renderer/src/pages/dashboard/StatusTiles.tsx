import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChefHat, ChevronRight, HandCoins, PackageX, Wallet } from 'lucide-react'
import { Money, cn } from '../../components/ui'
import type { DashboardData } from './useDashboardData'

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const TILE: Record<Tone, string> = {
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-surface-2 text-ink-2'
}

interface TileProps {
  icon: ReactNode
  tone: Tone
  label: string
  value: ReactNode
  detail: ReactNode
  onClick: () => void
}

function Tile({ icon, tone, label, value, detail, onClick }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap group flex items-center gap-4 rounded-2xl bg-surface border border-line shadow-e1 p-4 text-start contain-card hover:border-line-strong hover:shadow-e2 active:bg-surface-2 min-h-[88px]"
    >
      <div className={cn('h-11 w-11 shrink-0 rounded-xl flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5', TILE[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-muted truncate">{label}</p>
        <p className="num text-lg font-bold text-ink leading-tight truncate">{value}</p>
        <p className="text-xs text-muted truncate">{detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint group-hover:text-ink-2 rtl:-scale-x-100" />
    </button>
  )
}

function timeOf(iso: string): string {
  const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Shift · money to collect · low stock · kitchen — each tile opens the place to act. */
export function StatusTiles({ data }: { data: DashboardData }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { shift, unpaid, kitchen, summary } = data
  const lowStock = summary?.lowStockCount ?? 0

  return (
    <div className="grid grid-cols-2 2xl:grid-cols-4 gap-4">
      <Tile
        icon={<Wallet />}
        tone={shift ? 'success' : 'neutral'}
        label={t('dashboard.status.shift')}
        value={shift ? t('dashboard.status.shiftOpen') : t('dashboard.status.shiftClosed')}
        detail={
          shift
            ? t('dashboard.status.shiftSince', { time: timeOf(shift.opened_at), name: shift.cashier_name })
            : t('dashboard.status.shiftHint')
        }
        onClick={() => navigate('/orders')}
      />
      <Tile
        icon={<HandCoins />}
        tone={unpaid && unpaid.count > 0 ? 'warning' : 'neutral'}
        label={t('dashboard.status.unpaid')}
        value={unpaid ? String(unpaid.count) : '—'}
        detail={
          unpaid && unpaid.count > 0 ? (
            <>
              {t('dashboard.status.toCollect')} <Money value={unpaid.balance} decimals={0} />
            </>
          ) : (
            t('dashboard.status.allPaid')
          )
        }
        onClick={() => navigate('/admin/orders-history')}
      />
      <Tile
        icon={<PackageX />}
        tone={lowStock > 0 ? 'danger' : 'neutral'}
        label={t('dashboard.status.lowStock')}
        value={String(lowStock)}
        detail={lowStock > 0 ? t('dashboard.status.lowStockHint') : t('dashboard.status.stockOk')}
        onClick={() => navigate('/admin/stock')}
      />
      <Tile
        icon={<ChefHat />}
        tone={kitchen && kitchen.late > 0 ? 'danger' : kitchen && kitchen.open > 0 ? 'info' : 'neutral'}
        label={t('dashboard.status.kitchen')}
        value={
          kitchen && kitchen.late > 0
            ? t('dashboard.status.late', { n: kitchen.late })
            : t('dashboard.status.openTickets', { n: kitchen?.open ?? 0 })
        }
        detail={
          kitchen && kitchen.open > 0
            ? t('dashboard.status.kitchenDetail', { n: kitchen.open, minutes: kitchen.lateMinutes })
            : t('dashboard.status.kitchenIdle')
        }
        onClick={() => navigate('/admin/kds')}
      />
    </div>
  )
}
