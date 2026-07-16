import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createOwnerSession, ownerCookieName } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  const { machineId, pin } = await req.json()
  if (!machineId || !pin) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('owner_pins')
    .select('pin_hash')
    .eq('machine_id', machineId)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Owner login is temporarily unavailable' }, { status: 503 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // The stored hash is a bcrypt hash of the admin password
  const valid = bcrypt.compareSync(pin, data.pin_hash)

  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Mint a signed, HttpOnly session bound to this machineId. The owner data APIs require it —
  // previously they accepted a bare machineId, which is public (it appears in /tv/<id> URLs).
  const token = await createOwnerSession(machineId)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ownerCookieName(machineId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 // 24h, matching the dashboard's session lifetime
  })
  return response
}
