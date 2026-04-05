import { getMachineId } from '../activation/activation'
import { analyticsRepo } from '../database/repositories/analytics.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getClient } from '../activation/cloud'
import { net } from 'electron'

let syncInterval: ReturnType<typeof setInterval> | null = null

/**
 * Sync yesterday's aggregated analytics to Supabase.
 * Runs once per day, silently — client never sees this.
 */
async function syncDailyAnalytics(): Promise<void> {
  // Only sync if online
  if (!net.isOnline()) return

  const today = new Date().toISOString().split('T')[0]
  const lastSync = settingsRepo.get('last_analytics_sync_date')

  // Already synced today
  if (lastSync === today) return

  try {
    const machineId = getMachineId()
    const supabase = getClient()

    // Sync yesterday's data (complete day)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    // Get profit summary
    const summary = analyticsRepo.getProfitSummary(yesterdayStr, yesterdayStr)

    // Skip if no orders yesterday
    if (summary.order_count === 0) {
      settingsRepo.set('last_analytics_sync_date', today)
      return
    }

    const avgOrderValue = summary.order_count > 0
      ? Math.round((summary.total_revenue / summary.order_count) * 100) / 100
      : 0

    // Upsert daily stats
    await supabase.from('daily_stats').upsert(
      {
        machine_id: machineId,
        date: yesterdayStr,
        order_count: summary.order_count,
        total_revenue: summary.total_revenue,
        avg_order_value: avgOrderValue,
        synced_at: new Date().toISOString()
      },
      { onConflict: 'machine_id,date' }
    )

    // Get top 10 items
    const topItems = analyticsRepo.getTopSellingItems(yesterdayStr, yesterdayStr, 10)

    // Upsert top items
    for (let i = 0; i < topItems.length; i++) {
      const item = topItems[i] as any
      await supabase.from('daily_top_items').upsert(
        {
          machine_id: machineId,
          date: yesterdayStr,
          menu_item_name: item.name,
          quantity_sold: item.total_quantity,
          revenue: item.total_revenue,
          rank: i + 1
        },
        { onConflict: 'machine_id,date,rank' }
      )
    }

    // Mark as synced
    settingsRepo.set('last_analytics_sync_date', today)
    console.log(`[Analytics Sync] Synced ${yesterdayStr}: ${summary.order_count} orders, ${summary.total_revenue} revenue`)
  } catch (err) {
    // Silent fail — non-critical
    console.error('[Analytics Sync] Failed:', err)
  }
}

/** Start the daily analytics sync checker (runs every hour) */
export function startAnalyticsSync(): void {
  // Initial sync after 30 seconds (let the app finish starting)
  setTimeout(() => {
    syncDailyAnalytics().catch(() => {})
  }, 30000)

  // Check every hour if we need to sync
  syncInterval = setInterval(() => {
    syncDailyAnalytics().catch(() => {})
  }, 60 * 60 * 1000) // 1 hour
}

export function stopAnalyticsSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}
