import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  const { machineId, pin } = await req.json()
  if (!machineId || !pin) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data } = await supabase
    .from('owner_pins')
    .select('pin_hash')
    .eq('machine_id', machineId)
    .single()

  if (!data) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // The stored hash is a bcrypt hash of the admin password
  const valid = bcrypt.compareSync(pin, data.pin_hash)

  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
