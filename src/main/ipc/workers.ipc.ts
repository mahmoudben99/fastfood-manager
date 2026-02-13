import { ipcMain } from 'electron'
import { workersRepo, type CreateWorkerInput } from '../database/repositories/workers.repo'

export function registerWorkersHandlers(): void {
  ipcMain.handle('workers:getAll', () => {
    return workersRepo.getAll()
  })

  ipcMain.handle('workers:getById', (_, id: number) => {
    return workersRepo.getById(id)
  })

  ipcMain.handle('workers:getByCategoryId', (_, categoryId: number) => {
    return workersRepo.getByCategoryId(categoryId)
  })

  ipcMain.handle('workers:create', (_, input: CreateWorkerInput) => {
    return workersRepo.create(input)
  })

  ipcMain.handle('workers:update', (_, id: number, input: Partial<CreateWorkerInput>) => {
    return workersRepo.update(id, input)
  })

  ipcMain.handle('workers:delete', (_, id: number) => {
    return workersRepo.delete(id)
  })

  ipcMain.handle('workers:getAttendance', (_, date: string) => {
    return workersRepo.getAttendance(date)
  })

  ipcMain.handle(
    'workers:setAttendance',
    (_, workerId: number, date: string, shiftType: string, payAmount: number, notes?: string) => {
      workersRepo.setAttendance(workerId, date, shiftType, payAmount, notes)
      return true
    }
  )

  ipcMain.handle(
    'workers:getAttendanceRange',
    (_, startDate: string, endDate: string, workerId?: number) => {
      return workersRepo.getAttendanceRange(startDate, endDate, workerId)
    }
  )
}
