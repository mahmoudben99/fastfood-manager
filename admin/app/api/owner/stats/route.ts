import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getOwnerSessionToken, verifyOwnerSession } from '@/lib/auth'
import { algiersDaysAgo, formatAlgiersDate } from '@/lib/dates'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const machineId = url.searchParams.get('machineId')
  const period = url.searchParams.get('period') || 'week'

  if (!machineId) {
    return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
  }

  // See /api/owner/data: machineId is public, so the signed owner session is the real credential.
  const token = await getOwnerSessionToken(machineId)
  if (!(await verifyOwnerSession(token, machineId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = formatAlgiersDate()
  const sinceStr = period === 'month' ? `${today.slice(0, 8)}01` : algiersDaysAgo(6)

  const { data, error } = await supabase
    .from('daily_stats')
    .select('date, order_count, total_revenue, avg_order_value')
    .eq('machine_id', machineId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Owner statistics are temporarily unavailable' }, { status: 503 })
  }
  return NextResponse.json({ days: data || [] })
}
