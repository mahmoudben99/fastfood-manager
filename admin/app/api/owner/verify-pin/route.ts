import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createHash } from 'crypto'

export async function POST(req: Request) {
  const { machineId, pin } = await req.json()
  if (!machineId || !pin) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const pinHash = createHash('sha256').update(pin + ':ffm-owner').digest('hex')

  const { data } = await supabase
    .from('owner_pins')
    .select('pin_hash')
    .eq('machine_id', machineId)
    .single()

  if (!data || data.pin_hash !== pinHash) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
