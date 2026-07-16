import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

test('admin JWT domain separation and configuration failures fail closed', () => {
  const output = execFileSync(process.execPath, [join(here, 'admin-auth-runner.cjs')], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
  assert.match(output, /admin auth checks passed/)
})
