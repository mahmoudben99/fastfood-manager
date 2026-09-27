/**
 * `insights:*` IPC — see the `insights` block in src/preload/index.ts for the renderer API and
 * src/shared/insights.ts for every return shape. Inputs are validated here (dates YYYY-MM-DD,
 * ranges ≤ 366 days, ids positive integers); invalid input rejects with a readable message.
 */
import { ipcMain } from 'electron'
import { getDb } from '../database/connection'
import { settingsRepo } from '../database/repositories/settings.repo'
import { printerAssignmentsRepo } from '../database/repositories/printer-assignments.repo'
import {
  serializeInsightsSettings,
  type DashboardSummary, type InsightAlert, type InsightsPrintResult, type InsightsSendResult,
  type InsightsSettings, type MenuProfitReport, type PrepForecast, type RushHoursReport,
  type ShoppingList, type UpsellSuggestion
} from '../../shared/insights'
import { targetPrinters } from '../services/print-routing'
import { routing } from '../services/print-dispatch'
import { printHtml } from '../services/print-window'
import { assertIsoDate, localDateOf } from '../services/insights/dates'
import { buildForecast } from '../services/insights/forecast'
import { buildShoppingList } from '../services/insights/shopping-list'
import { buildMenuProfit } from '../services/insights/profit'
import { upsellCache } from '../services/insights/upsell'
import { buildRushHours } from '../services/insights/rush-hours'
import { evaluateAlerts } from '../services/insights/alerts'
import { buildDashboardSummary } from '../services/insights/dashboard'
import { buildPrepListHtml, composeMorningPrepMessage } from '../services/insights/reports'
import { readInsightsEnv, readSentKeys } from '../services/insights/scheduler'
import { sendInsightsMessage, telegramConfigured } from '../services/insights/runtime'

function dateOrToday(date: unknown): string {
  return date === undefined || date === null || date === '' ? localDateOf(new Date()) : assertIsoDate(date)
}

function receiptPrinter(): string | null {
  return targetPrinters(routing(), { documentType: 'receipt', scope: 'all', workerId: null })[0] ?? null
}

function prepListHtml(date: string, printerName: string | null): string {
  const db = getDb()
  const env = readInsightsEnv(db)
  const printer = printerName ? printerAssignmentsRepo.getSettingsForPrinter(printerName, 'receipt') : null
  return buildPrepListHtml(buildShoppingList(db, date), {
    lang: env.lang,
    currency: env.currency,
    paperWidth: printer?.paper_width || settingsRepo.get('printer_width'),
    restaurantName: settingsRepo.get('restaurant_name') || undefined
  })
}

export function registerInsightsHandlers(): void {
  ipcMain.handle('insights:getForecast', (_, date?: string, options?: { trend?: boolean }): PrepForecast =>
    buildForecast(getDb(), dateOrToday(date), { trend: options?.trend !== false }))

  ipcMain.handle('insights:getShoppingList', (_, date?: string): ShoppingList =>
    buildShoppingList(getDb(), dateOrToday(date)))

  ipcMain.handle('insights:getPrepListHtml', (_, date?: string): string =>
    prepListHtml(dateOrToday(date), receiptPrinter()))

  ipcMain.handle('insights:printPrepList', async (_, date?: string): Promise<InsightsPrintResult> => {
    const day = dateOrToday(date)
    const printer = receiptPrinter()
    if (!printer) return { success: false, error: 'No printer configured for the customer receipt' }
    return printHtml(prepListHtml(day, printer), printer)
  })

  ipcMain.handle('insights:sendMorningPrep', async (_, date?: string): Promise<InsightsSendResult> => {
    if (!telegramConfigured()) return { ok: false, error: 'Telegram bot token or chat ID is not configured' }
    const db = getDb()
    const env = readInsightsEnv(db)
    const ok = await sendInsightsMessage(composeMorningPrepMessage(buildShoppingList(db, dateOrToday(date)), env))
    return ok ? { ok } : { ok, error: 'Telegram did not accept the message (check the connection)' }
  })

  ipcMain.handle('insights:getMenuProfit', (_, startDate: string, endDate: string): MenuProfitReport => {
    const db = getDb()
    return buildMenuProfit(db, startDate, endDate, { marginWarnPct: readInsightsEnv(db).settings.profitMarginWarnPct })
  })

  ipcMain.handle('insights:getUpsellSuggestions', (_, cartMenuItemIds: number[], limit?: number): UpsellSuggestion[] =>
    upsellCache.suggestions(getDb(), cartMenuItemIds, limit ?? 3))

  ipcMain.handle('insights:getRushHours', (_, startDate: string, endDate: string): RushHoursReport =>
    buildRushHours(getDb(), startDate, endDate))

  ipcMain.handle('insights:getAlerts', (): InsightAlert[] => {
    const db = getDb()
    const now = new Date()
    return evaluateAlerts(db, { now, ...readInsightsEnv(db), sentKeys: readSentKeys(db, localDateOf(now)) })
  })

  ipcMain.handle('insights:getDashboardSummary', (): DashboardSummary => {
    const db = getDb()
    const now = new Date()
    return buildDashboardSummary(db, { now, ...readInsightsEnv(db), sentKeys: readSentKeys(db, localDateOf(now)) })
  })

  ipcMain.handle('insights:getSettings', (): InsightsSettings => readInsightsEnv(getDb()).settings)

  ipcMain.handle('insights:saveSettings', (_, patch: Partial<InsightsSettings>): InsightsSettings => {
    if (!patch || typeof patch !== 'object') throw new Error('Settings must be an object')
    settingsRepo.setMultiple(serializeInsightsSettings(patch))
    return readInsightsEnv(getDb()).settings
  })
}
