/** Ed25519 compact-artifact helpers for the Workers Web Crypto runtime. */

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64(value: string): ArrayBuffer {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', decodeBase64(pkcs8Base64), { name: 'Ed25519' }, false, ['sign'])
}

/**
 * Sign the exact UTF-8 JSON bytes emitted in the artifact payload segment.
 * The caller supplies `kid` in the payload, keeping signing rotation-ready.
 */
export async function signArtifact(payload: unknown, pkcs8Base64: string): Promise<string> {
  const key = await importPrivateKey(pkcs8Base64)
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, payloadBytes))
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(signature)}`
}
