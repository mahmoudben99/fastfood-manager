import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, History, Search } from 'lucide-react'
import { Badge, Card, EmptyState, Input, Money, SegmentedControl, Skeleton } from '../../../components/ui'
import { OverShort, daysAgo, fmtDate, fmtDuration, fmtTime, localToday, minutesBetween, td, tdEnd, th, thEnd, useAsync } from '../cashShared'

type StatusFilter = 'all' | 'open' | 'closed'

/** Shift history with date / status / cashier filters; a row opens its X/Z report. */
export function ShiftHistory({ version, onOpen }: { version: number; onOpen: (shiftId: number) => void }) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(localToday())
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const list = useAsync(() => window.api.shifts.list({ from: from || undefined, to: to || undefined, limit: 200 }), [from, to, version])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list.data ?? []).filter(
      (s) => (status === 'all' || s.status === status) && (!q || s.cashier_name.toLowerCase().includes(q) || String(s.id) === q)
    )
  }, [list.data, status, query])

  return (
    <Card padding={false} title={t('cashAdmin.history.title')} subtitle={t('cashAdmin.history.subtitle', { count: rows.length })} icon={<History />}>
      <div className="flex flex-wrap items-end gap-3 px-5 py-4 border-b border-line">
        <div className="w-40">
          <Input type="date" label={t('cashAdmin.from')} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-40">
          <Input type="date" label={t('cashAdmin.to')} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <SegmentedControl
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'open', label: t('cashAdmin.status.open') },
            { value: 'closed', label: t('cashAdmin.status.closed') }
          ]}
        />
        <div className="ms-auto w-full sm:w-64">
          <Input
            leading={<Search />}
            placeholder={t('cashAdmin.history.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('cashAdmin.history.search')}
          />
        </div>
      </div>

      {list.loading && !list.data ? (
        <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={<History />} title={t('cashAdmin.history.emptyTitle')} />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className={th}>{t('cashAdmin.history.shift')}</th>
                <th className={th}>{t('cashAdmin.history.cashier')}</th>
                <th className={th}>{t('cashAdmin.history.hours')}</th>
                <th className={thEnd}>{t('cashAdmin.report.openingFloat')}</th>
                <th className={thEnd}>{t('cashAdmin.report.expected')}</th>
                <th className={thEnd}>{t('cashAdmin.report.counted')}</th>
                <th className={thEnd}>{t('cashAdmin.report.overShort')}</th>
                <th className={th}><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line auto-visibility">
              {rows.map((s) => {
                const open = s.status === 'open'
                return (
                  <tr
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className="h-14 cursor-pointer hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') onOpen(s.id) }}
                  >
                    <td className={td}>
                      <div className="font-bold text-ink num">#{s.id}</div>
                      <div className="text-xs text-muted num">{fmtDate(s.business_date)}</div>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <bdi className="font-semibold text-ink">{s.cashier_name}</bdi>
                        {open && <Badge variant="success" dot>{t('cashAdmin.status.open')}</Badge>}
                      </div>
                      {s.closed_by && s.closed_by !== s.cashier_name && (
                        <div className="text-xs text-muted">{t('cashAdmin.history.closedBy', { name: s.closed_by })}</div>
                      )}
                    </td>
                    <td className={td}>
                      <bdi dir="ltr" className="num">{fmtTime(s.opened_at)} → {open ? "…" : fmtTime(s.closed_at)}</bdi>
                      <div className="text-xs text-muted num">{fmtDuration(minutesBetween(s.opened_at, s.closed_at))}</div>
                    </td>
                    <td className={tdEnd}><Money value={s.opening_float} decimals={0} /></td>
                    <td className={tdEnd}>{s.expected_cash === null ? <span className="text-muted">—</span> : <Money value={s.expected_cash} decimals={0} />}</td>
                    <td className={tdEnd}>{s.counted_cash === null ? <span className="text-muted">—</span> : <Money value={s.counted_cash} decimals={0} />}</td>
                    <td className={tdEnd}><OverShort value={s.over_short} /></td>
                    <td className="px-3 text-muted"><ChevronRight className="h-5 w-5 rtl:-scale-x-100" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
