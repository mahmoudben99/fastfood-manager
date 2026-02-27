import { NextRequest, NextResponse } from 'next/server'
import { generateSerialCode, generateUnlockCode } from '@/lib/keygen'

export async function POST(request: NextRequest) {
  const { machineId } = await request.json()

  if (!machineId || typeof machineId !== 'string') {
    return NextResponse.json({ error: 'Machine ID is required' }, { status: 400 })
  }

  const id = machineId.trim().toUpperCase()
  if (id.length < 8) {
    return NextResponse.json({ error: 'Machine ID too short' }, { status: 400 })
  }

  const serialCode = generateSerialCode(id)
  const unlockCode = generateUnlockCode(id)

  return NextResponse.json({ serialCode, unlockCode })
}
