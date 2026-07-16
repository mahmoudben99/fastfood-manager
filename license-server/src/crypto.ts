/**
 * Ed25519 signing for license tokens, using the Workers Web Crypto runtime.
 *
 * The PRIVATE key lives ONLY here, as a Cloudflare secret (never shipped to any client).
 * The desktop app carries only the matching PUBLIC key and can verify — but never forge —
 * a token. That is the whole point: the client can no longer lie about its own license.
 *
 * Token wire format:  base64url(payloadJSON) + "." + base64url(rawEd25519Signature)
 * The signature is computed over the exact payload bytes that are sent, so the verifier
 * checks the received bytes directly — no canonical-JSON pitfalls.
 */

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Import the PKCS8 (base64) private key produced by scripts/genkeys.mjs. */
async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  const der = b64urlDecode(pkcs8Base64.replace(/-/g, '+').replace(/_/g, '/'))
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
}

/** Sign a payload object, returning the compact token string. */
export async function signToken(payload: unknown, pkcs8Base64: string): Promise<string> {
  const key = await importPrivateKey(pkcs8Base64)
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, payloadBytes))
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`
}
