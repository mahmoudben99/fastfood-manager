import { registerSettingsHandlers } from './settings.ipc'
import { registerCategoriesHandlers } from './categories.ipc'
import { registerMenuHandlers } from './menu.ipc'
import { registerStockHandlers } from './stock.ipc'
import { registerWorkersHandlers } from './workers.ipc'
import { registerOrdersHandlers } from './orders.ipc'
import { registerAnalyticsHandlers } from './analytics.ipc'
import { registerBackupHandlers } from './backup.ipc'
import { registerPrinterHandlers } from './printer.ipc'
import { registerActivationHandlers } from './activation.ipc'
import { registerTrialHandlers } from './trial.ipc'
import { registerTelegramHandlers } from './telegram.ipc'
import { registerDataHandlers } from './data.ipc'

export function registerAllHandlers(): void {
  registerActivationHandlers()
  registerTrialHandlers()
  registerSettingsHandlers()
  registerCategoriesHandlers()
  registerMenuHandlers()
  registerStockHandlers()
  registerWorkersHandlers()
  registerOrdersHandlers()
  registerAnalyticsHandlers()
  registerBackupHandlers()
  registerPrinterHandlers()
  registerTelegramHandlers()
  registerDataHandlers()
}
