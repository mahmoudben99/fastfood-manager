import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateOneTimeCode } from '@/lib/keygen'

export async function POST(request: NextRequest) {
  const { machineId } = await request.json()

  if (!machineId || typeof machineId !== 'string') {
    return NextResponse.json({ error: 'Machine ID is required' }, { status: 400 })
  }

  const id = machineId.trim().toUpperCase()
  const code = generateOneTimeCode()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('reset_codes').insert({
    machine_id: id,
    code,
    used: false,
    expires_at: expiresAt
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ code })
}
