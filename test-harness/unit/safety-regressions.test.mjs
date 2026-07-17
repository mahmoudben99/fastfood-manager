import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import os from 'node:os'
import test from 'node:test'
import { recipeQuantityInStockUnits } from '../../src/main/services/stock-units.ts'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

test('legacy ratio conversion returns a deduction without rewriting the input record', () => {
  const storedRecipe = { quantity: 0.15, unit: 'g' }
  const deduction = recipeQuantityInStockUnits(storedRecipe.quantity, storedRecipe.unit, 'kg')
  assert.equal(deduction, 0.00015)
  assert.equal(storedRecipe.quantity, 0.15)
})

test('SQLite-backed IPC safety regressions run against an isolated Electron userData directory', () => {
  const electron = require('electron')
  const runner = join(here, 'electron-safety-runner.mjs')
  const output = execFileSync(electron, [runner], {
    cwd: os.tmpdir(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  })
  assert.match(output, /electron safety IPC checks passed/)
})
