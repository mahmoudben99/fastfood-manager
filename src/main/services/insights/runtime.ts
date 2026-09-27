/**
 * Production wiring of the insights scheduler: the app database, the existing Telegram owner
 * chat (telegram/bot.ts sendMessageToChat — no second bot) and a one-minute timer.
 * Started only from main/index.ts after the database is initialised; importing this module has
 * no side effects. FFM_DISABLE_INSIGHTS_SCHEDULER=1 keeps it off (test labs, diagnostics).
 */
import { getDb } from '../../database/connection'
import { settingsRepo } from '../../database/repositories/settings.repo'
import { sendMessageToChat } from '../../telegram/bot'
import { createInsightsScheduler } from './scheduler'

export const SCHEDULER_INTERVAL_MS = 60_000
const FIRST_RUN_DELAY_MS = 15_000

let timer: ReturnType<typeof setInterval> | null = null
let firstRun: ReturnType<typeof setTimeout> | null = null
let scheduler: ReturnType<typeof createInsightsScheduler> | null = null
let active: Promise<unknown> | null = null

export function telegramConfigured(): boolean {
  return !!(settingsRepo.get('telegram_bot_token') && settingsRepo.get('telegram_chat_id'))
}

export function sendInsightsMessage(html: string): Promise<boolean> {
  return sendMessageToChat(html, 'HTML')
}

function run(): void {
  if (!scheduler || active) return
  active = scheduler.tick()
    .catch((error) => console.error('[Insights] Scheduler tick failed:', error))
    .finally(() => { active = null })
}

export function startInsightsScheduler(): void {
  if (timer || process.env.FFM_DISABLE_INSIGHTS_SCHEDULER === '1') return
  scheduler = createInsightsScheduler({ db: getDb, send: sendInsightsMessage, telegramConfigured })
  // Let startup (window, bot, sync) settle before the first pass.
  firstRun = setTimeout(run, FIRST_RUN_DELAY_MS)
  timer = setInterval(run, SCHEDULER_INTERVAL_MS)
}

export async function stopInsightsScheduler(): Promise<void> {
  if (firstRun) clearTimeout(firstRun)
  if (timer) clearInterval(timer)
  firstRun = null
  timer = null
  if (active) {
    try { await active } catch { /* already logged */ }
  }
  scheduler = null
}
