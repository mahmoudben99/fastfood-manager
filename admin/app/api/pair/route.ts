import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * TV pairing resolver. The TV app sends the 4-digit code the POS shows; we return the
 * connection info (LAN IPs to try first, plus the cloud fallback URL). The pairing fields
 * live inside the existing display_settings.settings blob — no dedicated table — written by
 * the desktop's cloud-sync. Public on purpose (allow-listed in middleware): it only exposes
 * a restaurant's own display connection info, gated by knowing the 4-digit code.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = (url.searchParams.get('code') || '').trim()
  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400, headers: CORS })
  }

  // Find the display_settings row whose settings._pairing_code matches. Take the freshest
  // in the rare event two restaurants share a 4-digit code.
  //
  // Only the 'default' profile row carries a pairing code (see cloud-sync.ts syncDisplaySettings),
  // but older installs stamped it into every profile. Prefer 'default' explicitly so an upgraded
  // machine that still has stale named-profile rows keeps pairing to the Main Display.
  const { data, error } = await supabase
    .from('display_settings')
    .select('machine_id, profile_name, settings, updated_at')
    .eq('settings->>_pairing_code', code)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Pair resolver unavailable:', error.message)
    return NextResponse.json(
      { error: 'Pairing service unavailable' },
      { status: 503, headers: { ...CORS, 'Cache-Control': 'no-store', 'Retry-After': '10' } }
    )
  }

  const rows = (data || []) as any[]
  const row = rows.find((r) => (r.profile_name || 'default') === 'default') || rows[0]
  if (!row) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: { ...CORS, 'Cache-Control': 'no-store' } }
    )
  }

  const settings = row.settings || {}
  let lanIps: string[] = []
  try {
    lanIps = JSON.parse(settings._lan_ips || '[]')
  } catch {
    lanIps = []
  }
  const port = parseInt(settings._port || '3333', 10) || 3333
  const profile = row.profile_name || 'default'

  return NextResponse.json(
    {
      machineId: row.machine_id,
      profile,
      lanIps,
      port,
      // Include the resolved profile so the cloud fallback shows the same profile the LAN
      // target does (the TV also appends ?profile to the LAN /display URL).
      cloudUrl: `https://fastfood-manager.vercel.app/tv/${row.machine_id}?profile=${encodeURIComponent(profile)}`,
      updatedAt: row.updated_at || null
    },
    { headers: { ...CORS, 'Cache-Control': 'no-store' } }
  )
}
