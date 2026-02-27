import { createHmac } from 'crypto'

const SECRET_KEY = process.env.FFM_SECRET_KEY!
const UNLOCK_KEY = process.env.FFM_UNLOCK_KEY!

/** Generate the serial activation code for a given machine ID. */
export function generateSerialCode(machineId: string): string {
  const hmac = createHmac('sha256', SECRET_KEY).update(machineId.toUpperCase()).digest('hex')
  const code = hmac.substring(0, 20).toUpperCase()
  return `${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10, 15)}-${code.slice(15, 20)}`
}

/** Generate the permanent HMAC-based unlock/reset code for a machine. */
export function generateUnlockCode(machineId: string): string {
  const hmac = createHmac('sha256', UNLOCK_KEY).update(machineId.toUpperCase()).digest('hex')
  return hmac.substring(0, 8).toUpperCase()
}

/** Generate a random 8-char one-time reset code (stored in DB). */
export function generateOneTimeCode(): string {
  const bytes = Buffer.from(
    Array.from({ length: 8 }, () => Math.floor(Math.random() * 256))
  )
  return bytes.toString('hex').substring(0, 8).toUpperCase()
}
