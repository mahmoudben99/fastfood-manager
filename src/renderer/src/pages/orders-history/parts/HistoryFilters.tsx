import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Search, X } from 'lucide-react'
import { IconButton, Input, SegmentedControl, Tabs } from '../../../components/ui'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { useAppStore } from '../../../store/appStore'
import type { PeriodPreset, StatusFilter } from './types'

interface HistoryFiltersProps {
  period: PeriodPreset
  onPeriod: (period: PeriodPreset) => void
  startDate: string
  endDate: string
  onStartDate: (date: string) => void
  onEndDate: (date: string) => void
  status: StatusFilter
  onStatus: (status: StatusFilter) => void
  counts: Record<StatusFilter, number>
  search: string
  onSearch: (value: string) => void
}

/** "2026-09-21" → "21/09/2026" (Latin digits, Algerian day-first order). */
const shortDate = (iso: string) => iso.split('-').reverse().join('/')

export function HistoryFilters(props: HistoryFiltersProps) {
  const { t } = useTranslation()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const [keyboard, setKeyboard] = useState(false)
  const { period, startDate, endDate } = props

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          value={period}
          onChange={props.onPeriod}
          ariaLabel={t('orderHistory.period.label')}
          options={[
            { value: 'today', label: t('orderHistory.period.today') },
            { value: 'yesterday', label: t('orderHistory.period.yesterday') },
            { value: 'week', label: t('orderHistory.period.week') },
            { value: 'month', label: t('orderHistory.period.month') },
            { value: 'custom', label: null, icon: <CalendarDays />, ariaLabel: t('orderHistory.period.customAria') }
          ]}
        />
        {period === 'custom' ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <Input
                type="date"
                aria-label={t('orderHistory.from')}
                value={startDate}
                max={endDate}
                onChange={(e) => e.target.value && props.onStartDate(e.target.value)}
              />
            </div>
            <span className="self-center text-muted" aria-hidden="true">–</span>
            <div className="w-44">
              <Input
                type="date"
                aria-label={t('orderHistory.to')}
                value={endDate}
                min={startDate}
                onChange={(e) => e.target.value && props.onEndDate(e.target.value)}
              />
            </div>
          </div>
        ) : (
          period !== 'today' && (
            <span className="num self-center rounded-lg bg-surface-2 px-2.5 py-1 text-[13px] font-medium text-muted">
              <bdi dir="ltr">{startDate === endDate ? shortDate(startDate) : `${shortDate(startDate)} – ${shortDate(endDate)}`}</bdi>
            </span>
          )
        )}
        <div className="min-w-[14rem] flex-1">
          <Input
            leading={<Search />}
            value={props.search}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboard(true) : undefined}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={t('orderHistory.searchPlaceholder')}
            aria-label={t('orders.searchOrders')}
            trailing={
              props.search ? (
                <IconButton icon={<X />} label={t('orderHistory.clearSearch')} size="sm" onClick={() => props.onSearch('')} />
              ) : undefined
            }
          />
        </div>
      </div>

      <Tabs
        variant="pills"
        value={props.status}
        onChange={props.onStatus}
        tabs={[
          { id: 'all', label: t('orderHistory.filter.all'), count: props.counts.all },
          { id: 'ongoing', label: t('orderHistory.filter.ongoing'), count: props.counts.ongoing },
          { id: 'completed', label: t('orderHistory.filter.completed'), count: props.counts.completed },
          { id: 'cancelled', label: t('orderHistory.filter.cancelled'), count: props.counts.cancelled },
          { id: 'unpaid', label: t('orderHistory.filter.unpaid'), count: props.counts.unpaid }
        ]}
      />

      {isTouch && keyboard && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          value={props.search}
          onChange={props.onSearch}
          onClose={() => setKeyboard(false)}
        />
      )}
    </div>
  )
}
