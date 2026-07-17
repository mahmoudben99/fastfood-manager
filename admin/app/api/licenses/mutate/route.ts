import { NextRequest, NextResponse } from 'next/server'
import { mutateLicense, type MutateAction, type MutateArgs } from '@/lib/license-server'

// setInfo is intentionally excluded — it is not one of the seller-facing actions this
// wave's UI exposes (Extend / Set plan / Revoke / Reinstate / Grant trial / Rebind
// device / Tombstone). Keeping the allow-list narrow limits what a forged request body
// can trigger even though this route already sits behind the admin session gate
// (middleware.ts protects everything under /api/** except its explicit allow-list).
const ALLOWED_ACTIONS_LIST: MutateAction[] = [
  'setPlan',
  'extend',
  'grantTrial',
  'revoke',
  'reinstate',
  'rebindDevice',
  'tombstone'
]
const ALLOWED_ACTIONS: ReadonlySet<MutateAction> = new Set(ALLOWED_ACTIONS_LIST)

const MACHINE_ID = /^[A-Z0-9]{6,64}$/

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'bad_input' }, { status: 400 })
    }
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const machineId = typeof body.machineId === 'string' ? body.machineId.trim().toUpperCase() : ''
  if (!MACHINE_ID.test(machineId)) {
    return NextResponse.json({ error: 'bad_machine_id' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? (body.action as MutateAction) : undefined
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  }

  const args: MutateArgs = {}
  if (body.plan === 'monthly' || body.plan === 'yearly' || body.plan === 'lifetime') args.plan = body.plan
  if (typeof body.until === 'string') args.until = body.until
  if (typeof body.days === 'number') args.days = body.days

  const result = await mutateLicense(machineId, action, args)
  if (!result.ok) {
    const status = result.error === 'not_configured' ? 503 : result.status || 502
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ license: result.data })
}
