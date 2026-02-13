import { ipcMain } from 'electron'
import { settingsRepo } from '../database/repositories/settings.repo'
import { startBot, stopBot, isBotRunning } from '../telegram/bot'

export function registerTelegramHandlers(): void {
  ipcMain.handle('telegram:getConfig', () => {
    return {
      token: settingsRepo.get('telegram_bot_token') || '',
      chatId: settingsRepo.get('telegram_chat_id') || '',
      autoStart: settingsRepo.get('telegram_auto_start') === 'true',
      orderNotifications: settingsRepo.get('telegram_order_notifications') === 'true',
      isRunning: isBotRunning()
    }
  })

  ipcMain.handle(
    'telegram:saveConfig',
    (
      _,
      config: { token: string; chatId: string; autoStart: boolean; orderNotifications: boolean }
    ) => {
      settingsRepo.setMultiple({
        telegram_bot_token: config.token,
        telegram_chat_id: config.chatId,
        telegram_auto_start: config.autoStart ? 'true' : 'false',
        telegram_order_notifications: config.orderNotifications ? 'true' : 'false'
      })
      return true
    }
  )

  ipcMain.handle('telegram:start', () => {
    return startBot()
  })

  ipcMain.handle('telegram:stop', () => {
    stopBot()
    return true
  })

  ipcMain.handle('telegram:status', () => {
    return { isRunning: isBotRunning() }
  })
}
