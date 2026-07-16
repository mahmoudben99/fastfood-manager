#!/usr/bin/env node
/**
 * One-off generator for a TEST-ONLY Ed25519 keypair pair (current + previous).
 * Run once (or whenever keys.local.json is missing/rotated) before running the
 * acceptance suite:
 *
 *   node license-server/test/fixtures/gen-keys.mjs
 *
 * Writes test/fixtures/keys.local.json (gitignored) and prints the exact
 * .dev.vars lines to paste into license-server/.dev.vars so the local worker
 * signs with the key this suite verifies against.
 *
 * NEVER use these keys for anything but a local/test wrangler environment.
 */

import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function genPair(kid) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const pkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' })
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' })
  const rawPub = spkiDer.subarray(spkiDer.length - 32) // strip fixed 12-byte Ed25519 SPKI prefix
  return {
    kid,
    privatePkcs8Base64: pkcs8Der.toString('base64'),
    publicRawBase64url: rawPub.toString('base64url')
  }
}

const current = genPair('k_test_current')
const previous = genPair('k_test_previous')

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'keys.local.json')
writeFileSync(outPath, JSON.stringify({ current, previous }, null, 2) + '\n')

console.log(`Wrote ${outPath}\n`)
console.log('Add these lines to license-server/.dev.vars:\n')
console.log(`LICENSE_PRIVATE_KEY=${current.privatePkcs8Base64}`)
console.log(`LICENSE_KID=${current.kid}`)
console.log(
  '\n(TEST_PREVIOUS is never given to the live server in this suite — key_rotation ' +
    'verifies it purely as a wire-format/verifier-logic check; see test/README.md.)'
)
