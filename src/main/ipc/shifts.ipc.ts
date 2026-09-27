import { ipcMain } from 'electron'
import { getDb } from '../database/connection'
import type { ApprovalInput } from '../../shared/cash'
import type { CashMovementInput, CloseShiftInput, OpenShiftInput } from '../../shared/shift-report'
import {
  approvalPolicy, discountNeedsApproval, isGuarded, listApprovals, requireApproval, saveApprovalPolicy, setManagerPin
} from '../services/approvals'
import {
  addCashMovement, closeShift, currentShiftReport, getOpenShift, listCashMovements, listShifts, openShift, shiftReport
} from '../services/shifts'
import { printShiftReport } from '../services/shift-report'

/** Reveal the expected cash during a blind count only with a manager credential. */
function reveal(approval?: ApprovalInput): boolean {
  if (!approval) return false
  requireApproval(getDb(), 'view_expected', approval)
  return true
}

/** v4 shifts / cash drawer IPC (preload namespace `shifts`) and manager approvals (`approvals`). */
export function registerShiftsHandlers(): void {
  ipcMain.handle('shifts:getCurrent', () => getOpenShift(getDb()))
  ipcMain.handle('shifts:open', (_, input: OpenShiftInput) => openShift(getDb(), input))

  ipcMain.handle('shifts:addMovement', (_, input: CashMovementInput, approval?: ApprovalInput) => {
    const db = getDb()
    return db.transaction(() => {
      if (input?.kind === 'pay_out') requireApproval(db, 'pay_out', approval, { detail: input })
      return addCashMovement(db, input)
    })()
  })
  ipcMain.handle('shifts:listMovements', (_, shiftId?: number) => {
    const id = shiftId ?? getOpenShift(getDb())?.id
    return id ? listCashMovements(getDb(), id) : []
  })

  /** X report of the open shift (expected cash hidden during a blind count unless approved). */
  ipcMain.handle('shifts:xReport', (_, approval?: ApprovalInput) => currentShiftReport(getDb(), new Date(), reveal(approval)))
  /** Stored Z report of a closed shift, or the live X report of the open one. */
  ipcMain.handle('shifts:getReport', (_, shiftId: number, approval?: ApprovalInput) =>
    shiftReport(getDb(), shiftId, new Date(), reveal(approval))
  )
  ipcMain.handle('shifts:list', (_, options?: { from?: string; to?: string; limit?: number }) => listShifts(getDb(), options))

  ipcMain.handle('shifts:close', async (_, input: CloseShiftInput) => {
    const result = closeShift(getDb(), input)
    const print = input?.print ? await printShiftReport(result.report) : undefined
    return { ...result, print }
  })

  /** Print a shift's report on the receipt printer (default: the open shift's X report). */
  ipcMain.handle('shifts:printReport', async (_, shiftId?: number, approval?: ApprovalInput) => {
    const db = getDb()
    const report = shiftId ? shiftReport(db, shiftId, new Date(), reveal(approval)) : currentShiftReport(db, new Date(), reveal(approval))
    return printShiftReport(report)
  })

  // ── Manager approvals ──
  ipcMain.handle('approvals:getPolicy', () => approvalPolicy(getDb()))
  /** Does this action need a PIN right now? For 'discount' pass { subtotal, discount, allowance }. */
  ipcMain.handle(
    'approvals:check',
    (_, action: Parameters<typeof isGuarded>[1], context?: { subtotal: number; discount: number; allowance?: number }) => ({
      required: action === 'discount' && context
        ? discountNeedsApproval(getDb(), { ...context, allowance: context.allowance ?? 0 })
        : isGuarded(getDb(), action)
    })
  )
  ipcMain.handle('approvals:savePolicy', (_, adminPassword: string, policy: Parameters<typeof saveApprovalPolicy>[2]) =>
    saveApprovalPolicy(getDb(), adminPassword, policy)
  )
  ipcMain.handle('approvals:setManagerPin', (_, adminPassword: string, pin: string) => {
    setManagerPin(getDb(), adminPassword, pin)
    return approvalPolicy(getDb())
  })
  ipcMain.handle('approvals:list', (_, options?: { shiftId?: number; orderId?: number }) => listApprovals(getDb(), options))
}
