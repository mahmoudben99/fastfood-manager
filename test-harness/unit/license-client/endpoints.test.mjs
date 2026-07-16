import assert from 'node:assert/strict'
import test from 'node:test'

// CONTRACT.md §4 requires these semantics. The pure resolver avoids Electron app-path and
// module-cache coupling, while getEndpoints() remains the production cached entry point.
const ENDPOINTS_MODULE = new URL('../../../src/main/config/endpoints.ts', import.meta.url).href

test('endpoints_precedence: env beats file beats baked; invalid overrides fall through per field', async () => {
  const endpoints = await import(ENDPOINTS_MODULE)
  assert.equal(typeof endpoints.resolveEndpoints, 'function', 'endpoints.ts must export pure resolveEndpoints for this deterministic acceptance test')
  const baked = { supabaseUrl: 'https://baked.supabase.co', supabaseAnonKey: 'baked-key', licenseServerUrl: 'https://baked-license.example' }
  const resolved = endpoints.resolveEndpoints({
    baked,
    file: { supabaseUrl: 'https://file.supabase.co', supabaseAnonKey: '', licenseServerUrl: 'http://invalid-file.example' },
    env: { FFM_SUPABASE_URL: 'https://env.supabase.co', FFM_SUPABASE_ANON_KEY: '', FFM_LICENSE_SERVER_URL: 'https://env-license.example/' },
    log: () => {}
  })
  assert.deepEqual(resolved.values, {
    supabaseUrl: 'https://env.supabase.co', supabaseAnonKey: 'baked-key', licenseServerUrl: 'https://env-license.example'
  })
  assert.deepEqual(resolved.source, { supabaseUrl: 'env', supabaseAnonKey: 'baked', licenseServerUrl: 'env' })

  const fallback = endpoints.resolveEndpoints({
    baked, file: { supabaseUrl: 'not a url', supabaseAnonKey: 'file-key', licenseServerUrl: 'https://file-license.example/' },
    env: { FFM_SUPABASE_URL: 'ftp://bad.example', FFM_LICENSE_SERVER_URL: 'not-a-url' }, log: () => {}
  })
  assert.deepEqual(fallback.values, {
    supabaseUrl: 'https://baked.supabase.co', supabaseAnonKey: 'file-key', licenseServerUrl: 'https://file-license.example'
  })
  assert.deepEqual(fallback.source, { supabaseUrl: 'baked', supabaseAnonKey: 'file', licenseServerUrl: 'file' })
})
