import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import os from 'node:os'
import test from 'node:test'
import { recipeQuantityInStockUnits, recipeUnitCompatibleWithStock } from '../../src/main/services/stock-units.ts'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

test('stock unit families: g/kg, ml/L and pieces convert only within their family', () => {
  assert.equal(recipeQuantityInStockUnits(150, 'g', 'kg'), 0.15)
  assert.equal(recipeQuantityInStockUnits(2, 'kg', 'kg'), 2)
  assert.equal(recipeQuantityInStockUnits(0.5, 'L', 'liter'), 0.5)
  assert.equal(recipeQuantityInStockUnits(330, 'ml', 'liter'), 0.33)
  assert.equal(recipeQuantityInStockUnits(1, 'pcs', 'unit'), 1)
  assert.equal(recipeUnitCompatibleWithStock('g', 'kg'), true)
  assert.equal(recipeUnitCompatibleWithStock('litre', 'liter'), true)
  assert.equal(recipeUnitCompatibleWithStock('g', 'unit'), false)
  assert.equal(recipeUnitCompatibleWithStock('unit', 'kg'), false)
  assert.throws(() => recipeQuantityInStockUnits(1, 'g', 'unit'), /incompatible/)
})

test('SQLite-backed menu/stock/category regressions (migration 020, soft delete, unit guard, restore)', () => {
  const electron = require('electron')
  const runner = join(here, 'menu-stock-runner.mjs')
  const output = execFileSync(electron, [runner], {
    cwd: os.tmpdir(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  })
  assert.match(output, /menu\/stock\/category checks passed/)
})
