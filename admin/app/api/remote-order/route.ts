import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json()
  const { machineId, items, orderType, tableNumber, customerPhone, customerName } = body

  if (!machineId || !items || items.length === 0) {
    return NextResponse.json({ error: 'Invalid order' }, { status: 400 })
  }

  const { data, error } = await supabase.from('remote_orders').insert({
    machine_id: machineId,
    order_data: { items, orderType, tableNumber, customerPhone, customerName },
    status: 'pending'
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, orderId: data.id })
}
