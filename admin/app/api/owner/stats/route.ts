import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  const period = url.searchParams.get('period') || 'week'

  if (!machineId) {
    return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
  }

  const days = period === 'month' ? 30 : 7
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data } = await supabase
    .from('daily_stats')
    .select('date, order_count, total_revenue, avg_order_value')
    .eq('machine_id', machineId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  return NextResponse.json({ days: data || [] })
}
