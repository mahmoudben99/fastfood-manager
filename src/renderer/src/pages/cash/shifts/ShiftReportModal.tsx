import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { parseApprovalError, type ApprovalInput } from '../../../../../shared/cash'
import type { ShiftReport } from '../../../../../shared/shift-report'
import { Button, Modal, Skeleton, toast } from '../../../components/ui'
import { withApproval } from '../../../components/checkout'
import { errorText } from '../cashShared'
import { ShiftReportView } from './ShiftReportView'

interface ShiftReportModalProps {
  shiftId: number | null
  /** Report already in hand (e.g. the Z report returned by close). */
  initialReport?: ShiftReport
  onClose: () => void
}

/** Shift detail: the stored Z report (or live X report) rendered in-app, with reprint. */
export function ShiftReportModal({ shiftId, initialReport, onClose }: ShiftReportModalProps) {
  const { t } = useTranslation()
  const [report, setReport] = useState<ShiftReport | null>(initialReport ?? null)
  const [error, setError] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [approval, setApproval] = useState<ApprovalInput | undefined>()

  useEffect(() => {
    setApproval(undefined)
    setError('')
    if (shiftId === null) return setReport(null)
    if (initialReport) return setReport(initialReport)
    setReport(null)
    let alive = true
    window.api.shifts.getReport(shiftId)
      .then((r) => alive && setReport(r))
      .catch((e) => alive && setError(errorText(e, t('common.error'))))
    return () => { alive = false }
  }, [shiftId, initialReport, t])

  const reveal = async (): Promise<void> => {
    if (shiftId === null) return
    setRevealing(true)
    try {
      let used: ApprovalInput | undefined
      const result = await withApproval(async (a) => {
        if (!a) throw new Error('APPROVAL_REQUIRED:view_expected')
        used = a
        return window.api.shifts.getReport(shiftId, a)
      }, { action: 'view_expected', reason: t('cashAdmin.current.revealReason') })
      if (result) {
        setReport(result)
        setApproval(used)
      }
    } catch (e) {
      toast.error(t('cashAdmin.current.revealFailed'), { description: parseApprovalError(e) ? t('cashAdmin.approvalNeeded') : errorText(e, '') })
    } finally {
      setRevealing(false)
    }
  }

  const reprint = async (): Promise<void> => {
    if (shiftId === null) return
    try {
      const result = await window.api.shifts.printReport(shiftId, approval)
      if (result.success) toast.success(t('cashAdmin.report.printed'))
      else toast.error(t('cashAdmin.printFailed'), { description: result.error })
    } catch (e) {
      toast.error(t('cashAdmin.printFailed'), { description: errorText(e, '') })
    }
  }

  const title = report
    ? t(report.kind === 'Z' ? 'cashAdmin.report.zTitle' : 'cashAdmin.report.xTitle', { id: report.shift.id })
    : t('cashAdmin.report.title')

  return (
    <Modal
      isOpen={shiftId !== null}
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.close')}</Button>
          <Button size="lg" icon={<Printer className="h-5 w-5" />} cooldownMs={800} disabled={!report} onClick={reprint}>
            {report?.kind === 'Z' ? t('cashAdmin.report.reprint') : t('cashAdmin.current.printX')}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm font-medium text-danger-ink bg-danger-soft rounded-xl p-3">{error}</p>
      ) : report ? (
        <ShiftReportView report={report} onReveal={report.blind ? reveal : undefined} revealing={revealing} />
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}
    </Modal>
  )
}
