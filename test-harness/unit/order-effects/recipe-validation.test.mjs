// WP-F acceptance tests — recipe/stock unit compatibility validated at menu-save time
// (frozen; see order-effects.contract.d.ts / ASSUMPTION 7).
//
// Covers brief item:
//   15. recipe_save_validation
//
// This module is pure (no better-sqlite3, no Electron), so unlike the other files in
// this folder it can run under plain `node --test` too. The loader below is still
// needed purely to resolve this codebase's extensionless relative TS imports (e.g.
// recipe-validation.ts's own import of stock-units.ts) under Node's native
// type-stripping — see create-order.test.mjs's header comment for the full story.

import { register } from 'node:module'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild
export async function initialize(data) { esbuild = await import(data.esbuildEntry) }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    try { return await nextResolve(specifier, context) }
    catch (err) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const base = path.resolve(parentDir, specifier)
      const candidates = [base + '.ts', path.join(base, 'index.ts')]
      for (const cand of candidates) {
        if (existsSync(cand) && statSync(cand).isFile()) return nextResolve(pathToFileURL(cand).href, context)
      }
      throw err
    }
  }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8')
    const result = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'node20' })
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
`
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry } })

const { validateRecipeIngredientAgainstStock } = await import(
  '../../../src/main/services/recipe-validation.ts'
)

test('recipe_save_validation: a compatible unit against an active stock row passes', () => {
  const stock = { id: 1, name: 'Beef', unit_type: 'kg', is_active: 1 }
  assert.doesNotThrow(() =>
    validateRecipeIngredientAgainstStock({ stock_item_id: 1, quantity: 150, unit: 'g' }, stock)
  )
})

test('recipe_save_validation: an inactive stock row is rejected', () => {
  const stock = { id: 2, name: 'Retired Sauce', unit_type: 'l', is_active: 0 }
  assert.throws(
    () => validateRecipeIngredientAgainstStock({ stock_item_id: 2, quantity: 10, unit: 'ml' }, stock),
    /active stock item/i
  )
})

test('recipe_save_validation: a missing/unknown stock row is rejected', () => {
  assert.throws(
    () => validateRecipeIngredientAgainstStock({ stock_item_id: 999, quantity: 10, unit: 'g' }, undefined),
    /active stock item/i
  )
})

test('recipe_save_validation: an incompatible unit (100g recipe vs a stock item tracked in litres) is rejected and names the exact pair', () => {
  const stock = { id: 3, name: 'Cooking Oil', unit_type: 'liter', is_active: 1 }
  assert.throws(
    () => validateRecipeIngredientAgainstStock({ stock_item_id: 3, quantity: 100, unit: 'g' }, stock),
    (err) => {
      assert.match(err.message, /g/)
      assert.match(err.message, /Cooking Oil/)
      assert.match(err.message, /liter/)
      return true
    }
  )
})
