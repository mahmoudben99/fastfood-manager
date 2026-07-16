import { createHash } from 'node:crypto'

/** CONTRACT §1.2: server stores only SHA-256(secret) hex. */
export function sha256hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
