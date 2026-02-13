/**
 * Serial Code Generator — Seller Tool
 *
 * Usage: npx tsx scripts/generate-serial.ts <MACHINE_ID>
 *
 * The customer gives you their Machine ID (shown on the activation screen).
 * Run this script to generate their serial code.
 */

import { createHmac } from 'crypto'

const SECRET_KEY = 'FFM-2024-SERIAL-KEY-DO-NOT-SHARE'

function generateSerialCode(machineId: string): string {
  const hmac = createHmac('sha256', SECRET_KEY).update(machineId.toUpperCase()).digest('hex')
  const code = hmac.substring(0, 20).toUpperCase()
  return `${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10, 15)}-${code.slice(15, 20)}`
}

const machineId = process.argv[2]
if (!machineId) {
  console.error('Usage: npx tsx scripts/generate-serial.ts <MACHINE_ID>')
  process.exit(1)
}

const serial = generateSerialCode(machineId)
console.log(`\nMachine ID: ${machineId.toUpperCase()}`)
console.log(`Serial Code: ${serial}\n`)
