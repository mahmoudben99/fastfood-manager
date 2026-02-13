import { ipcMain } from 'electron'
import { analyticsRepo } from '../database/repositories/analytics.repo'

export function registerAnalyticsHandlers(): void {
  ipcMain.handle('analytics:getProfitSummary', (_, startDate: string, endDate: string) => {
    return analyticsRepo.getProfitSummary(startDate, endDate)
  })

  ipcMain.handle('analytics:getRevenueByDay', (_, startDate: string, endDate: string) => {
    return analyticsRepo.getRevenueByDay(startDate, endDate)
  })

  ipcMain.handle('analytics:getCostsByDay', (_, startDate: string, endDate: string) => {
    return analyticsRepo.getCostsByDay(startDate, endDate)
  })

  ipcMain.handle(
    'analytics:getTopSellingItems',
    (_, startDate: string, endDate: string, limit?: number) => {
      return analyticsRepo.getTopSellingItems(startDate, endDate, limit)
    }
  )

  ipcMain.handle(
    'analytics:getWorstSellingItems',
    (_, startDate: string, endDate: string, limit?: number) => {
      return analyticsRepo.getWorstSellingItems(startDate, endDate, limit)
    }
  )

  ipcMain.handle(
    'analytics:getRevenueByCategory',
    (_, startDate: string, endDate: string) => {
      return analyticsRepo.getRevenueByCategory(startDate, endDate)
    }
  )

  ipcMain.handle(
    'analytics:getWorkerPerformance',
    (_, startDate: string, endDate: string) => {
      return analyticsRepo.getWorkerPerformance(startDate, endDate)
    }
  )

  ipcMain.handle('analytics:getMonthlyTrends', (_, year: number) => {
    return analyticsRepo.getMonthlyTrends(year)
  })

  ipcMain.handle(
    'analytics:getOrderTypeBreakdown',
    (_, startDate: string, endDate: string) => {
      return analyticsRepo.getOrderTypeBreakdown(startDate, endDate)
    }
  )
}
