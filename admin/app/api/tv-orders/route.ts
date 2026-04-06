import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const machineId = searchParams.get('machineId')

  if (!machineId) {
    return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
  }

  const { data } = await supabase
    .from('owner_orders')
    .select('order_number')
    .eq('machine_id', machineId)
    .eq('status', 'preparing')
    .order('created_at', { ascending: true })

  const orders = (data || []).map((o: { order_number: number }) => o.order_number)

  return NextResponse.json({ orders })
}
