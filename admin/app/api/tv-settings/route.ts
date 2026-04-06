import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const machineId = searchParams.get('machineId')
  const profile = searchParams.get('profile') || 'default'

  if (!machineId) {
    return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
  }

  const { data } = await supabase
    .from('display_settings')
    .select('settings')
    .eq('machine_id', machineId)
    .eq('profile_name', profile)
    .single()

  if (!data) {
    return NextResponse.json({ settings: null })
  }

  return NextResponse.json({ settings: data.settings })
}
