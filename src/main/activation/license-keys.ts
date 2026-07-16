import type { Key } from './license-client'

/**
 * Baked Ed25519 verification keys for signed license artifacts (CONTRACT.md §1.4).
 *
 * Ordered CURRENT first, then PREVIOUS — the verifier selects by the artifact's `kid`, so shipping
 * [new, current] before flipping the server key gives a seamless rotation with no lockout. Each
 * `pub` is the raw 32-byte Ed25519 public key, base64url (no padding). These are PUBLIC keys; the
 * private signing key lives only in the Cloudflare Worker secret store.
 */
export const BAKED_LICENSE_KEYS: readonly Key[] = [
  { kid: 'k1', pub: 'n5iperrudd9ibATzrDltSq4ZeuX8ok33etbDxpcsR-0' }
]
