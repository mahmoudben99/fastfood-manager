import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { stockRepo } from '../database/repositories/stock.repo'
import { workersRepo } from '../database/repositories/workers.repo'
import { analyticsRepo } from '../database/repositories/analytics.repo'

let bot: any = null
let isRunning = false

export function startBot(): { success: boolean; error?: string } {
  const token = settingsRepo.get('telegram_bot_token')
  const chatId = settingsRepo.get('telegram_chat_id')

  if (!token || !chatId) {
    return { success: false, error: 'Token or Chat ID not configured' }
  }

  if (isRunning && bot) {
    return { success: true }
  }

  try {
    const { Bot } = require('grammy')
    bot = new Bot(token)

    // Security: only respond to authorized chat ID
    bot.use(async (ctx, next) => {
      if (ctx.chat?.id.toString() === chatId) {
        await next()
      }
    })

    registerCommands(bot)

    bot.catch((err) => {
      console.error('Telegram bot error:', err)
    })

    bot.start({
      onStart: () => {
        isRunning = true
      },
      drop_pending_updates: true
    })

    isRunning = true
    return { success: true }
  } catch (err: any) {
    isRunning = false
    return { success: false, error: err.message }
  }
}

export function stopBot(): void {
  if (bot) {
    bot.stop()
    bot = null
    isRunning = false
  }
}

export function isBotRunning(): boolean {
  return isRunning
}

function getCurrency(): string {
  return settingsRepo.get('currency_symbol') || '$'
}

function registerCommands(bot: any): void {
  bot.command('start', async (ctx) => {
    await ctx.reply('Welcome! Use /help to see available commands.')
  })

  bot.command('help', async (ctx) => {
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

  bot.command('today', async (ctx) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const summary = analyticsRepo.getProfitSummary(today, today)
      const topItems = analyticsRepo.getTopSellingItems(today, today, 5)
      const c = getCurrency()

      let msg = `📊 *Today's Summary* (${today})\n\n`
      msg += `🧾 Orders: ${summary.order_count}\n`
      msg += `💰 Revenue: ${Number(summary.total_revenue || 0).toFixed(2)} ${c}\n`
      msg += `📦 Stock Cost: ${Number(summary.total_stock_cost || 0).toFixed(2)} ${c}\n`
      msg += `👷 Worker Cost: ${Number(summary.total_worker_cost || 0).toFixed(2)} ${c}\n`
      msg += `✅ Net Profit: ${Number(summary.net_profit || 0).toFixed(2)} ${c}\n`

      if (topItems.length > 0) {
        msg += `\n🔥 *Top Items:*\n`
        topItems.forEach((item: any, i: number) => {
          msg += `${i + 1}. ${item.name} — ${item.total_quantity}x (${Number(item.total_revenue || 0).toFixed(2)} ${c})\n`
        })
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' })
    } catch (err) {
      await ctx.reply('Error fetching today data.')
    }
  })

  bot.command('stock', async (ctx) => {
    try {
      const lowStock = stockRepo.getLowStock()

      if (lowStock.length === 0) {
        await ctx.reply('✅ All stock levels are OK. No alerts.')
        return
      }

      let msg = `⚠️ *Low Stock Alerts* (${lowStock.length} items)\n\n`
      lowStock.forEach((item: any) => {
        const icon = item.quantity <= 0 ? '🔴' : '🟡'
        msg += `${icon} *${item.name}*: ${item.quantity} ${item.unit_type} (threshold: ${item.alert_threshold})\n`
      })

      await ctx.reply(msg, { parse_mode: 'Markdown' })
    } catch (err) {
      await ctx.reply('Error fetching stock data.')
    }
  })

  bot.command('revenue', async (ctx) => {
    try {
      const period = ctx.match?.trim().toLowerCase() || 'today'
      const today = new Date()
      let startDate: string
      const endDate = today.toISOString().split('T')[0]
      let periodLabel: string

      if (period === 'week') {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        startDate = weekAgo.toISOString().split('T')[0]
        periodLabel = 'This Week'
      } else if (period === 'month') {
        startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
        periodLabel = 'This Month'
      } else {
        startDate = endDate
        periodLabel = 'Today'
      }

      const summary = analyticsRepo.getProfitSummary(startDate, endDate)
      const c = getCurrency()

      let msg = `💰 *Revenue Report — ${periodLabel}*\n`
      msg += `(${startDate} to ${endDate})\n\n`
      msg += `Revenue: ${Number(summary.total_revenue || 0).toFixed(2)} ${c}\n`
      msg += `Orders: ${summary.order_count}\n`
      msg += `Costs: ${(Number(summary.total_stock_cost || 0) + Number(summary.total_worker_cost || 0)).toFixed(2)} ${c}\n`
      msg += `Net Profit: ${Number(summary.net_profit || 0).toFixed(2)} ${c}\n`

      await ctx.reply(msg, { parse_mode: 'Markdown' })
    } catch (err) {
      await ctx.reply('Error fetching revenue data.')
    }
  })

  bot.command('workers', async (ctx) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const attendance = workersRepo.getAttendance(today)
      const allWorkers = workersRepo.getAll()
      const c = getCurrency()

      if (attendance.length === 0) {
        await ctx.reply(
          `👷 *Workers* (${today})\n\nNo attendance recorded yet today.\nTotal active workers: ${allWorkers.length}`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      let totalPay = 0
      let msg = `👷 *Workers Attendance* (${today})\n\n`

      attendance.forEach((a: any) => {
        const icon = a.shift_type === 'full' ? '🟢' : a.shift_type === 'half' ? '🟡' : '🔴'
        const name = a.worker_name || a.name || `Worker #${a.worker_id}`
        msg += `${icon} ${name}: ${a.shift_type} — ${Number(a.pay_amount || 0).toFixed(2)} ${c}\n`
        totalPay += Number(a.pay_amount || 0)
      })

      msg += `\nTotal recorded: ${attendance.length}/${allWorkers.length}\n`
      msg += `Total pay today: ${totalPay.toFixed(2)} ${c}`

      await ctx.reply(msg, { parse_mode: 'Markdown' })
    } catch (err) {
      await ctx.reply('Error fetching worker data.')
    }
  })

  bot.command('status', async (ctx) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const todayOrders = ordersRepo.getTodayOrders()
      const restaurantName = settingsRepo.get('restaurant_name') || 'Restaurant'
      const lowCount = stockRepo.getLowStockCount()

      const lastOrder = todayOrders.length > 0 ? todayOrders[0] : null

      let msg = `🖥️ *${restaurantName} — Status*\n\n`
      msg += `✅ App is running\n`
      msg += `📅 Date: ${today}\n`
      msg += `🧾 Today's orders: ${todayOrders.length}\n`
      if (lastOrder) {
        msg += `🕐 Last order: #${lastOrder.daily_number} at ${lastOrder.created_at}\n`
      }

      if (lowCount > 0) {
        msg += `\n⚠️ ${lowCount} stock items are low!`
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' })
    } catch (err) {
      await ctx.reply('Error fetching status.')
    }
  })
}
