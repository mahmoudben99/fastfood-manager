import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const { machineId, action, days, expiresAt } = await request.json()

  if (!machineId || !action) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Fetch current trial
  const { data: trial, error: fetchErr } = await supabase
    .from('trials')
    .select('*')
    .eq('machine_id', machineId)
    .single()

  if (fetchErr || !trial) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  let updateData: Record<string, unknown> = {}

  switch (action) {
    case 'extend': {
      if (!days || days < 1) return NextResponse.json({ error: 'Invalid days' }, { status: 400 })
      const currentExpiry = new Date(trial.expires_at)
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date()
      const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
      updateData = { expires_at: newExpiry.toISOString(), status: 'active', updated_at: new Date().toISOString() }
      break
    }
    case 'pause': {
      if (trial.status !== 'active') return NextResponse.json({ error: 'Trial is not active' }, { status: 400 })
      const remainingMs = new Date(trial.expires_at).getTime() - Date.now()
      if (remainingMs <= 0) return NextResponse.json({ error: 'Trial already expired' }, { status: 400 })
      updateData = {
        status: 'paused',
        paused_remaining_ms: Math.max(0, remainingMs),
        expires_at: new Date().toISOString(), // freeze the clock
        updated_at: new Date().toISOString()
      }
      break
    }
    case 'resume': {
      if (trial.status !== 'paused') return NextResponse.json({ error: 'Trial is not paused' }, { status: 400 })
      const remaining = trial.paused_remaining_ms || 0
      const newExpiry = new Date(Date.now() + remaining)
      updateData = {
        status: 'active',
        expires_at: newExpiry.toISOString(),
        paused_remaining_ms: null,
        updated_at: new Date().toISOString()
      }
      break
    }
    case 'terminate': {
      updateData = {
        status: 'expired',
        expires_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      break
    }
    case 'reactivate': {
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      updateData = {
        status: 'active',
        expires_at: newExpiry.toISOString(),
        paused_remaining_ms: null,
        updated_at: new Date().toISOString()
      }
      break
    }
    case 'reduce': {
      if (!days || days < 1) return NextResponse.json({ error: 'Invalid days' }, { status: 400 })
      const reduceMs = days * 24 * 60 * 60 * 1000
      if (trial.status === 'paused') {
        const remaining = (trial.paused_remaining_ms || 0) - reduceMs
        if (remaining <= 0) {
          updateData = { status: 'expired', expires_at: new Date().toISOString(), paused_remaining_ms: 0, updated_at: new Date().toISOString() }
        } else {
          updateData = { paused_remaining_ms: remaining, updated_at: new Date().toISOString() }
        }
      } else {
        const newExpiry = new Date(trial.expires_at).getTime() - reduceMs
        if (newExpiry <= Date.now()) {
          updateData = { status: 'expired', expires_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        } else {
          updateData = { expires_at: new Date(newExpiry).toISOString(), updated_at: new Date().toISOString() }
        }
      }
      break
    }
    case 'setExpiry': {
      if (!expiresAt) return NextResponse.json({ error: 'Missing expiresAt' }, { status: 400 })
      const newDate = new Date(expiresAt)
      if (isNaN(newDate.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
      updateData = {
        expires_at: newDate.toISOString(),
        status: newDate.getTime() > Date.now() ? 'active' : 'expired',
        paused_remaining_ms: null,
        updated_at: new Date().toISOString()
      }
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('trials')
    .update(updateData)
    .eq('machine_id', machineId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
