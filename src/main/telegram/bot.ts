import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { stockRepo } from '../database/repositories/stock.repo'
import { workersRepo } from '../database/repositories/workers.repo'
import { analyticsRepo } from '../database/repositories/analytics.repo'

let bot: any = null
let isRunning = false
// bot.start() resolves its handshake asynchronously, so isRunning stays false while connecting.
// Guarding re-entry on isRunning alone let a second Start click build a SECOND Bot and long-poll
// the same token — Telegram answers 409 Conflict and both pollers stall.
let isStarting = false

/**
 * Escape user/menu-derived text for Telegram HTML parse_mode.
 * Previously the notification used Markdown and interpolated raw item names / notes;
 * a single stray *, _, [ or ` made Telegram reject the message (400) and the owner
 * silently never saw the new order. HTML mode only needs &, <, > escaped.
 */
function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Render a stored timestamp as the restaurant's local wall-clock time.
 * orders.created_at is UTC ISO; SQLite's datetime('now') default is UTC *without* a zone marker,
 * which JS would otherwise parse as local time. Tag it before parsing.
 */
function formatLocalTime(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

export function startBot(): { success: boolean; error?: string } {
  const token = settingsRepo.get('telegram_bot_token')
  const chatId = settingsRepo.get('telegram_chat_id')

  if (!token || !chatId) {
    return { success: false, error: 'Token or Chat ID not configured' }
  }

  // A live-or-connecting bot means there's nothing to do. Checking `isRunning` alone raced the
  // async handshake and let a second poller spawn on the same token (Telegram 409 Conflict).
  if (bot || isStarting) {
    return { success: true }
  }

  try {
    isStarting = true
    const { Bot } = require('grammy')
    bot = new Bot(token)
    const thisBot = bot

    // Security: only respond to authorized chat ID
    bot.use(async (ctx: any, next: any) => {
      if (ctx.chat?.id.toString() === chatId) {
        await next()
      }
    })

    registerCommands(bot)

    bot.catch((err: any) => {
      console.error('Telegram bot error:', err)
    })

    // bot.start() is async (grammy calls getMe first). With a bad/revoked token or no network
    // it rejects AFTER this function returns, so we must NOT set isRunning=true unconditionally
    // here — otherwise the settings UI shows "running", auto-start re-arms it every launch, and
    // every notification fails silently. Let onStart flip isRunning, and catch the rejection.
    bot.start({
      onStart: () => {
        isRunning = true
        isStarting = false
      },
      drop_pending_updates: true
    }).catch((err: any) => {
      console.error('Telegram bot failed to start:', err)
      isStarting = false
      // Only tear down if this is still the CURRENT bot — a later startBot() may have replaced
      // it, and nulling that one would silently kill a working connection.
      if (bot === thisBot) {
        isRunning = false
        // Reset so a later Start rebuilds the bot (grammy neuters bot.use after start()).
        bot = null
      }
    })

    return { success: true }
  } catch (err: any) {
    isRunning = false
    isStarting = false
    bot = null
    return { success: false, error: err.message }
  }
}

export function stopBot(): void {
  if (bot) {
    try { bot.stop() } catch { /* never started */ }
    bot = null
    isRunning = false
    isStarting = false
  }
}

export function isBotRunning(): boolean {
  return isRunning
}

/** Send any message to the configured Telegram chat. Works even if bot is not started. */
export async function sendMessageToChat(message: string): Promise<boolean> {
  const token = settingsRepo.get('telegram_bot_token')
  const chatId = settingsRepo.get('telegram_chat_id')
  if (!token || !chatId) return false
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
    })
    const data = await res.json() as { ok: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

export function sendOrderNotification(order: any): void {
  if (!bot || !isRunning) return
  const notifySetting = settingsRepo.get('telegram_order_notifications')
  // Default to enabled if setting was never explicitly set (backward compat)
  if (notifySetting === 'false') return

  const chatId = settingsRepo.get('telegram_chat_id')
  if (!chatId) return

  try {
    const c = escapeHtml(getCurrency())
    const items = (order.items || [])
      .map((i: any) => `  ${i.quantity}x ${escapeHtml(i.menu_item_name)}`)
      .join('\n')

    const typeEmoji = order.order_type === 'delivery' ? '🛵' : order.order_type === 'takeout' ? '🥡' : '🍽️'
    const typeName = order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'takeout' ? 'Take Out' : 'At Table'

    let msg = `🔔 <b>New Order #${escapeHtml(order.daily_number)}</b>\n`
    msg += `${typeEmoji} ${typeName}`
    if (order.table_number) msg += ` — Table ${escapeHtml(order.table_number)}`
    if (order.customer_phone) msg += `\n📞 ${escapeHtml(order.customer_phone)}`
    msg += `\n\n${items}\n\n`
    msg += `💰 <b>Total: ${Number(order.total || 0).toFixed(2)} ${c}</b>`
    if (order.notes) msg += `\n📝 ${escapeHtml(order.notes)}`

    bot.api.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {})
  } catch {
    // Silent fail — don't block order creation
  }
}

function getCurrency(): string {
  return settingsRepo.get('currency_symbol') || settingsRepo.get('currency') || 'DA'
}

/** Restaurant-local date (YYYY-MM-DD) — matches orders.repo so /today etc. align with stored order_date. */
function localDate(d = new Date()): string {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().split('T')[0]
}

function registerCommands(bot: any): void {
  bot.command('start', async (ctx: any) => {
    await ctx.reply('Welcome! Use /help to see available commands.')
  })

  bot.command('help', async (ctx: any) => {
    const msg =
      `🤖 *Fast Food Manager Bot*\n\n` +
      `Available commands:\n\n` +
      `/today — Today's orders summary\n` +
      `/stock — Low stock alerts\n` +
      `/revenue — Today's revenue\n` +
      `/revenue week — This week's revenue\n` +
      `/revenue month — This month's revenue\n` +
      `/workers — Today's attendance\n` +
      `/status — App status\n` +
      `/help — Show this help`
    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })

  bot.command('today', async (ctx: any) => {
    try {
      const today = localDate()
      const summary = analyticsRepo.getProfitSummary(today, today)
      const topItems = analyticsRepo.getTopSellingItems(today, today, 5)
      const c = escapeHtml(getCurrency())

      let msg = `📊 <b>Today's Summary</b> (${today})\n\n`
      msg += `🧾 Orders: ${summary.order_count}\n`
      msg += `💰 Revenue: ${Number(summary.total_revenue || 0).toFixed(2)} ${c}\n`
      msg += `📦 Stock Cost: ${Number(summary.total_stock_cost || 0).toFixed(2)} ${c}\n`
      msg += `👷 Worker Cost: ${Number(summary.total_worker_cost || 0).toFixed(2)} ${c}\n`
      msg += `✅ Net Profit: ${Number(summary.net_profit || 0).toFixed(2)} ${c}\n`

      if (topItems.length > 0) {
        msg += `\n🔥 <b>Top Items:</b>\n`
        topItems.forEach((item: any, i: number) => {
          msg += `${i + 1}. ${escapeHtml(item.name)} — ${item.total_quantity}x (${Number(item.total_revenue || 0).toFixed(2)} ${c})\n`
        })
      }

      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch (err) {
      await ctx.reply('Error fetching today data.')
    }
  })

  bot.command('stock', async (ctx: any) => {
    try {
      const lowStock = stockRepo.getLowStock()

      if (lowStock.length === 0) {
        await ctx.reply('✅ All stock levels are OK. No alerts.')
        return
      }

      let msg = `⚠️ <b>Low Stock Alerts</b> (${lowStock.length} items)\n\n`
      lowStock.forEach((item: any) => {
        const icon = item.quantity <= 0 ? '🔴' : '🟡'
        msg += `${icon} <b>${escapeHtml(item.name)}</b>: ${item.quantity} ${escapeHtml(item.unit_type)} (threshold: ${item.alert_threshold})\n`
      })

      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch (err) {
      await ctx.reply('Error fetching stock data.')
    }
  })

  bot.command('revenue', async (ctx: any) => {
    try {
      const period = ctx.match?.trim().toLowerCase() || 'today'
      const today = new Date()
      let startDate: string
      // Restaurant-LOCAL dates so /revenue matches the stored order_date buckets. UTC here
      // reported yesterday as "Today" past local midnight, and on the 1st of the month made
      // startDate (local new month) > endDate (UTC last day of prev month) → 0 revenue.
      const endDate = localDate(today)
      let periodLabel: string

      if (period === 'week') {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        startDate = localDate(weekAgo)
        periodLabel = 'This Week'
      } else if (period === 'month') {
        startDate = endDate.slice(0, 8) + '01'
        periodLabel = 'This Month'
      } else {
        startDate = endDate
        periodLabel = 'Today'
      }

      const summary = analyticsRepo.getProfitSummary(startDate, endDate)
      // HTML mode + escaped currency, matching the other commands. /revenue was the last
      // command left on Markdown, so a currency symbol containing * _ [ or ` made the reply
      // throw (400) and the owner saw only "Error fetching revenue data."
      const c = escapeHtml(getCurrency())

      let msg = `💰 <b>Revenue Report — ${periodLabel}</b>\n`
      msg += `(${startDate} to ${endDate})\n\n`
      msg += `Revenue: ${Number(summary.total_revenue || 0).toFixed(2)} ${c}\n`
      msg += `Orders: ${summary.order_count}\n`
      msg += `Costs: ${(Number(summary.total_stock_cost || 0) + Number(summary.total_worker_cost || 0)).toFixed(2)} ${c}\n`
      msg += `Net Profit: ${Number(summary.net_profit || 0).toFixed(2)} ${c}\n`

      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch (err) {
      await ctx.reply('Error fetching revenue data.')
    }
  })

  bot.command('workers', async (ctx: any) => {
    try {
      const today = localDate()
      const attendance = workersRepo.getAttendance(today)
      const allWorkers = workersRepo.getAll()
      const c = escapeHtml(getCurrency())

      if (attendance.length === 0) {
        await ctx.reply(
          `👷 <b>Workers</b> (${today})\n\nNo attendance recorded yet today.\nTotal active workers: ${allWorkers.length}`,
          { parse_mode: 'HTML' }
        )
        return
      }

      let totalPay = 0
      let msg = `👷 <b>Workers Attendance</b> (${today})\n\n`

      attendance.forEach((a: any) => {
        const icon = a.shift_type === 'full' ? '🟢' : a.shift_type === 'half' ? '🟡' : '🔴'
        const name = escapeHtml(a.worker_name || a.name || `Worker #${a.worker_id}`)
        msg += `${icon} ${name}: ${escapeHtml(a.shift_type)} — ${Number(a.pay_amount || 0).toFixed(2)} ${c}\n`
        totalPay += Number(a.pay_amount || 0)
      })

      msg += `\nTotal recorded: ${attendance.length}/${allWorkers.length}\n`
      msg += `Total pay today: ${totalPay.toFixed(2)} ${c}`

      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch (err) {
      await ctx.reply('Error fetching worker data.')
    }
  })

  bot.command('status', async (ctx: any) => {
    try {
      const today = localDate()
      // Exclude cancelled orders, so "Today's orders" here agrees with /today and the Day Recap.
      // getTodayOrders() returns every order regardless of status.
      const todayOrders = ordersRepo.getTodayOrders().filter((o: any) => o.status !== 'cancelled')
      const restaurantName = escapeHtml(settingsRepo.get('restaurant_name') || 'Restaurant')
      const lowCount = stockRepo.getLowStockCount()

      const lastOrder = todayOrders.length > 0 ? todayOrders[0] : null

      let msg = `🖥️ <b>${restaurantName} — Status</b>\n\n`
      msg += `✅ App is running\n`
      msg += `📅 Date: ${today}\n`
      msg += `🧾 Today's orders: ${todayOrders.length}\n`
      if (lastOrder) {
        // created_at is UTC ISO; print the restaurant's local wall-clock time instead.
        msg += `🕐 Last order: #${lastOrder.daily_number} at ${escapeHtml(formatLocalTime(lastOrder.created_at))}\n`
      }

      if (lowCount > 0) {
        msg += `\n⚠️ ${lowCount} stock items are low!`
      }

      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch (err) {
      await ctx.reply('Error fetching status.')
    }
  })
}
