import { getMachineId } from '../activation/activation'
import { analyticsRepo } from '../database/repositories/analytics.repo'
import { settingsRepo } from '../database/repositories/settings.repo'
import { localDate } from '../database/repositories/orders.repo'
import { getClient } from '../activation/cloud'
import { net } from 'electron'

let syncInterval: ReturnType<typeof setInterval> | null = null

/** Never walk back further than this when catching up a machine that was off for a long time. */
const MAX_BACKFILL_DAYS = 30
/** Re-push the last few days each run so same-day edits and cancellations reach the dashboard. */
const RESYNC_TRAILING_DAYS = 3

/** Shift a 'YYYY-MM-DD' calendar date by whole days, without timezone drift. */
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Push one local calendar day. Returns false if anything failed, so the caller can retry later. */
async function syncOneDay(machineId: string, day: string): Promise<boolean> {
  const summary = analyticsRepo.getProfitSummary(day, day)

  const supabase = getClient()
  const avgOrderValue = summary.order_count > 0
    ? Math.round((summary.total_revenue / summary.order_count) * 100) / 100
    : 0

  const { error: statsError } = await supabase.from('daily_stats').upsert(
    {
      machine_id: machineId,
      date: day,
      order_count: summary.order_count,
      total_revenue: summary.total_revenue,
      avg_order_value: avgOrderValue,
      synced_at: new Date().toISOString()
    },
    { onConflict: 'machine_id,date' }
  )
  // The old code ignored this error and then marked the day synced, so one transient failure
  // dropped that day's numbers from the owner dashboard permanently.
  if (statsError) {
    console.error(`[Analytics Sync] daily_stats upsert failed for ${day}:`, statsError.message)
    return false
  }

  // Zero is business data too. If the day's last order was cancelled after a previous sync,
  // returning early left the old non-zero revenue and top sellers in the cloud forever.
  if (summary.order_count === 0) {
    const { error: clearError } = await supabase
      .from('daily_top_items')
      .delete()
      .eq('machine_id', machineId)
      .eq('date', day)
    if (clearError) {
      console.error(`[Analytics Sync] daily_top_items clear failed for ${day}:`, clearError.message)
      return false
    }
    console.log(`[Analytics Sync] Synced ${day}: closed/zero-order day`)
    return true
  }

  const topItems = analyticsRepo.getTopSellingItems(day, day, 10) as any[]
  for (let i = 0; i < topItems.length; i++) {
    const item = topItems[i]
    const { error } = await supabase.from('daily_top_items').upsert(
      {
        machine_id: machineId,
        date: day,
        menu_item_name: item.name,
        quantity_sold: item.total_quantity,
        revenue: item.total_revenue,
        rank: i + 1
      },
      { onConflict: 'machine_id,date,rank' }
    )
    if (error) {
      console.error(`[Analytics Sync] daily_top_items upsert failed for ${day}:`, error.message)
      return false
    }
  }

  // Drop ranks left over from a previous sync of the same day (e.g. an order was cancelled and
  // the day now has fewer distinct items) — otherwise the dashboard shows phantom top sellers.
  const { error: pruneError } = await supabase
    .from('daily_top_items')
    .delete()
    .eq('machine_id', machineId)
    .eq('date', day)
    .gt('rank', topItems.length)
  if (pruneError) {
    console.error(`[Analytics Sync] daily_top_items prune failed for ${day}:`, pruneError.message)
    return false
  }

  console.log(`[Analytics Sync] Synced ${day}: ${summary.order_count} orders, ${summary.total_revenue} revenue`)
  return true
}

/** Strict single-day entry point used by the transactional outbox consumer. */
export async function syncAnalyticsDateStrict(day: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid analytics date')
  if (!net.isOnline()) throw new Error('Analytics sync is offline')
  const ok = await syncOneDay(getMachineId(), day)
  if (!ok) throw new Error(`Analytics sync failed for ${day}`)
}

/**
 * Sync completed days' aggregated analytics to Supabase. Runs hourly, silently.
 *
 * Previously it only ever pushed *exactly* yesterday and marked the job done for the day. Any day
 * the app didn't happen to run on the following day (weekend closure, PC off, holiday) was never
 * uploaded and was permanently missing from the owner dashboard. Now we track how far we have
 * synced and walk forward, and we re-push the trailing few days so later edits/cancellations of
 * those orders correct the cloud snapshot.
 */
async function syncDailyAnalytics(): Promise<void> {
  // Only sync if online
  if (!net.isOnline()) return

  // Bucket by restaurant-LOCAL date (order data uses localDate() in orders.repo); UTC here
  // detected the day rollover an hour late in UTC+1 and mislabeled the daily_stats 'date'.
  const today = localDate()
  const yesterday = shiftDate(today, -1)

  // Upgrade path: the old key stored the day the sync RAN, which meant it had synced through the
  // day before. Seed from it so an upgraded install doesn't re-push a month of history.
  let syncedThrough = settingsRepo.get('analytics_synced_through')
  if (!syncedThrough) {
    const legacy = settingsRepo.get('last_analytics_sync_date')
    if (legacy) {
      syncedThrough = shiftDate(legacy, -1)
      settingsRepo.set('analytics_synced_through', syncedThrough)
    }
  }
  const lastRun = settingsRepo.get('last_analytics_run_date')

  // Everything is already up to date and we've run today — nothing to do. (When a previous run
  // failed, syncedThrough lags and we retry on the next hourly tick instead of waiting a day.)
  if (syncedThrough === yesterday && lastRun === today) return

  try {
    const machineId = getMachineId()

    // Where to start: the day after the last fully-synced day, or just yesterday on a fresh
    // install (never backfill a machine's whole history on first run).
    let start = syncedThrough ? shiftDate(syncedThrough, 1) : yesterday

    // Always re-push the trailing window so edits/cancellations propagate.
    const resyncFrom = shiftDate(yesterday, -(RESYNC_TRAILING_DAYS - 1))
    if (resyncFrom < start) start = resyncFrom

    // Bound the catch-up. Say so out loud rather than silently dropping the older days.
    const earliest = shiftDate(yesterday, -(MAX_BACKFILL_DAYS - 1))
    if (start < earliest) {
      console.warn(
        `[Analytics Sync] Backfill clamped: days ${start}..${shiftDate(earliest, -1)} will not be uploaded ` +
        `(older than MAX_BACKFILL_DAYS=${MAX_BACKFILL_DAYS}).`
      )
      start = earliest
    }

    if (start > yesterday) return

    let progressed = syncedThrough || ''
    let allOk = true
    for (let day = start; day <= yesterday; day = shiftDate(day, 1)) {
      const ok = await syncOneDay(machineId, day)
      if (!ok) { allOk = false; break }
      if (day > progressed) progressed = day
    }

    if (progressed && progressed !== syncedThrough) {
      settingsRepo.set('analytics_synced_through', progressed)
    }
    if (allOk) settingsRepo.set('last_analytics_run_date', today)
  } catch (err) {
    // Silent fail — non-critical. syncedThrough is not advanced, so the next tick retries.
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
