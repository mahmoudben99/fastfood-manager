import { useCallback, useState } from 'react'
import type { ShiftReport } from '../../../../../shared/shift-report'
import { useAsync } from '../cashShared'
import { CurrentShiftCard } from './CurrentShiftCard'
import { MovementsCard } from './MovementsCard'
import { OverShortTrend } from './OverShortTrend'
import { ShiftHistory } from './ShiftHistory'
import { ShiftReportModal } from './ShiftReportModal'

/** Cash & Shifts tab: live drawer, pay-ins/outs, over/short trend, history and X/Z reports. */
export function ShiftsTab() {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const current = useAsync(() => window.api.shifts.getCurrent(), [version])
  const [report, setReport] = useState<{ shiftId: number; report?: ShiftReport } | null>(null)
  const shift = current.data ?? null

  return (
    <div className="space-y-6">
      <div className="grid xl:grid-cols-5 gap-6">
        <CurrentShiftCard
          className="xl:col-span-3"
          shift={shift}
          loading={current.loading && !current.data}
          version={version}
          onChanged={bump}
          onShowReport={(shiftId, closedReport) => setReport({ shiftId, report: closedReport })}
        />
        <MovementsCard className="xl:col-span-2" shift={shift} version={version} onChanged={bump} />
      </div>
      <OverShortTrend version={version} />
      <ShiftHistory version={version} onOpen={(shiftId) => setReport({ shiftId })} />
      <ShiftReportModal
        shiftId={report?.shiftId ?? null}
        initialReport={report?.report}
        onClose={() => setReport(null)}
      />
    </div>
  )
}
