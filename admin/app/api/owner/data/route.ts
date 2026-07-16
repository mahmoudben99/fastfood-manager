import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getOwnerSessionToken, verifyOwnerSession } from '@/lib/auth'
import { formatAlgiersDate } from '@/lib/dates'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  if (!machineId) {
    return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
  }

  // machineId is NOT a credential — it is embedded in the public /tv/<id> and /r/<id> URLs.
  // Require the signed owner session issued by /api/owner/verify-pin.
  const token = await getOwnerSessionToken(machineId)
  if (!(await verifyOwnerSession(token, machineId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The restaurant's LOCAL day, supplied by the owner's browser (which sits in the restaurant's
  // timezone). This server runs on Vercel in UTC, so bucketing by UTC `created_at` — as this route
  // used to — dropped every order placed between local midnight and 01:00 in Algeria (UTC+1),
  // i.e. the busiest hour, and attributed it to "yesterday".
  const requestedDate = url.searchParams.get('date')
  const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')
    ? (requestedDate as string)
    : formatAlgiersDate()

  // Restaurant currency symbol (falls back to DA)
  const { data: ds, error: settingsError } = await supabase
    .from('display_settings')
    .select('settings')
    .eq('machine_id', machineId)
    .eq('profile_name', 'default')
    .single()
  if (settingsError) {
    return NextResponse.json({ error: 'Owner data is temporarily unavailable' }, { status: 503 })
  }
  const currency = (ds?.settings as any)?.currency_symbol || (ds?.settings as any)?.currency || 'DA'

  // owner_orders.order_date is written by the POS as the restaurant-local calendar day
  // (see src/main/sync/owner-sync.ts), which is exactly the bucket we want.
  //
  // Stats must cover the WHOLE day: the old query took only the newest 100 rows, so on a busy
  // day the dashboard silently under-reported revenue. Page through everything, selecting just
  // the three columns the stats need to keep the payload small.
  const statRows: { total: number; status: string; items_summary: string | null }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('owner_orders')
      .select('total, status, items_summary')
      .eq('machine_id', machineId)
      .eq('order_date', today)
      .range(from, from + PAGE - 1)
    if (error) {
      return NextResponse.json({ error: 'Owner data is temporarily unavailable' }, { status: 503 })
    }
    if (!data || data.length === 0) break
    statRows.push(...(data as any[]))
    if (data.length < PAGE) break
  }

  // The order list the UI renders is still capped — nobody scrolls 500 rows on a phone.
  const { data: orders, error: ordersError } = await supabase
    .from('owner_orders')
    .select('*')
    .eq('machine_id', machineId)
    .eq('order_date', today)
    .order('created_at', { ascending: false })
    .limit(100)

  if (ordersError) {
    return NextResponse.json({ error: 'Owner data is temporarily unavailable' }, { status: 503 })
  }
  const orderList = orders || []

  // Compute stats (exclude cancelled) over EVERY order of the day, not just the newest page.
  const nonCancelled = statRows.filter((o: any) => o.status !== 'cancelled')
  const totalRevenue = nonCancelled.reduce((s: number, o: any) => s + Number(o.total), 0)
  const orderCount = nonCancelled.length
  const avgOrder = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0

  // Popular items — parse "2x Burger, 1x Fries" format
  const itemCounts = new Map<string, number>()
  for (const order of nonCancelled) {
    if (!order.items_summary) continue
    const parts = order.items_summary.split(', ')
    for (const part of parts) {
      const match = part.match(/^(\d+)x\s+(.+)$/)
      if (match) {
        const qty = parseInt(match[1])
        const name = match[2]
        itemCounts.set(name, (itemCounts.get(name) || 0) + qty)
      }
    }
  }
  const popularItems = Array.from(itemCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  return NextResponse.json({
    orders: orderList,
    stats: { totalRevenue, orderCount, avgOrder },
    popularItems,
    currency
  })
}
