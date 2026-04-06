import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  if (!machineId) {
    return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: orders } = await supabase
    .from('owner_orders')
    .select('*')
    .eq('machine_id', machineId)
    .gte('created_at', today + 'T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(100)

  const orderList = orders || []

  // Compute stats (exclude cancelled)
  const nonCancelled = orderList.filter((o: any) => o.status !== 'cancelled')
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
    popularItems
  })
}
