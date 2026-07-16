const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..', '..')
require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, filename)
}

const originalLoad = Module._load
let auth
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'next/headers') return { cookies: async () => ({ get: () => undefined }) }
  if (request === 'next/server') return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } }
  if (request === '@/lib/auth') return auth
  return originalLoad.call(this, request, parent, isMain)
}

;(async () => {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  delete process.env.OWNER_SESSION_SECRET
  auth = require(path.join(root, 'admin/lib/auth.ts'))
  const ownerToken = await auth.createOwnerSession('restaurant-1')
  assert.equal(await auth.verifySession(ownerToken), false)

  const otherwiseValidAdminToken = await auth.createSession()
  delete process.env.SESSION_SECRET
  assert.equal(await auth.verifySession(otherwiseValidAdminToken), false)
  await assert.rejects(() => auth.createOwnerSession('restaurant-1'), /at least 32 characters/)
  process.env.SESSION_SECRET = 'short'
  assert.equal(await auth.verifySession(otherwiseValidAdminToken), false)

  const route = require(path.join(root, 'admin/app/api/login/route.ts'))
  for (const password of [undefined, 'short']) {
    if (password === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = password
    const response = await route.POST({ json: async () => ({ password: 'anything' }) })
    assert.equal(response.status, 503)
  }
  console.log('admin auth checks passed')
})().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
