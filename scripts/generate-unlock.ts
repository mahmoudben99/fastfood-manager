/**
 * Unlock Code Generator — Seller Tool (Password Reset)
 *
 * Usage: npx tsx scripts/generate-unlock.ts <MACHINE_ID>
 *
 * The customer forgot their admin password.
 * They give you their Machine ID (shown on the forgot password screen).
 * Run this script to generate an unlock code so they can set a new password.
 */

import { createHmac } from 'crypto'

const UNLOCK_KEY = 'FFM-2024-UNLOCK-KEY-DO-NOT-SHARE'

function generateUnlockCode(machineId: string): string {
  const hmac = createHmac('sha256', UNLOCK_KEY).update(machineId.toUpperCase()).digest('hex')
  return hmac.substring(0, 8).toUpperCase()
}

const machineId = process.argv[2]
if (!machineId) {
  console.error('Usage: npx tsx scripts/generate-unlock.ts <MACHINE_ID>')
  process.exit(1)
}

const code = generateUnlockCode(machineId)
console.log(`\nMachine ID:  ${machineId.toUpperCase()}`)
console.log(`Unlock Code: ${code}\n`)
