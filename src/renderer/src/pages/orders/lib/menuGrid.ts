import { removeRepeatedPrefix } from '../../../utils/removeRepeatedPrefix'
import type { MenuItemData } from '../types'
import { localName, SIZE_PATTERNS, stripSize } from './names'

export type SortMode = 'name' | 'price'
export type SortDirection = 'asc' | 'desc'

export type GridEntry =
  | { type: 'single'; key: string; item: MenuItemData; label: string }
  | { type: 'group'; key: string; label: string; items: MenuItemData[] }

/**
 * Tile labels without the word every item of a category starts with ("Pizza Margherita" →
 * "Margherita"). Computed over the WHOLE category so a label never changes while searching.
 */
export function simplifiedLabels(items: MenuItemData[], foodLanguage: string): Map<number, string> {
  const byCategory = new Map<number, MenuItemData[]>()
  for (const item of items) {
    const list = byCategory.get(item.category_id)
    if (list) list.push(item)
    else byCategory.set(item.category_id, [item])
  }
  const labels = new Map<number, string>()
  for (const list of byCategory.values()) {
    const simplified = removeRepeatedPrefix(list.map((i) => localName(i, foodLanguage)), 0.5)
    for (const item of list) {
      const full = localName(item, foodLanguage)
      labels.set(item.id, simplified.get(full) || full)
    }
  }
  return labels
}

/**
 * Grid entries in a FIXED order for the chosen sort (muscle memory: never by popularity).
 * Compact mode folds 3+ size variants of one product into a single tile.
 */
export function buildGrid(
  items: MenuItemData[],
  opts: { compact: boolean; sortMode: SortMode; sortDirection: SortDirection; foodLanguage: string; labels: Map<number, string> }
): GridEntry[] {
  const { compact, sortMode, sortDirection, foodLanguage, labels } = opts
  const entries: (GridEntry & { sortName: string; sortPrice: number })[] = []
  const grouped = new Set<number>()

  if (compact) {
    const groups = new Map<string, MenuItemData[]>()
    for (const item of items) {
      const name = localName(item, foodLanguage)
      if (!SIZE_PATTERNS.test(name)) continue
      const key = `${item.category_id}::${stripSize(name).toLowerCase()}`
      const list = groups.get(key)
      if (list) list.push(item)
      else groups.set(key, [item])
    }
    for (const [key, list] of groups) {
      if (list.length < 3) continue
      const sorted = [...list].sort((a, b) => a.price - b.price)
      sorted.forEach((i) => grouped.add(i.id))
      const first = sorted[0]
      entries.push({
        type: 'group',
        key: `g:${key}`,
        label: stripSize(labels.get(first.id) || localName(first, foodLanguage)),
        items: sorted,
        sortName: stripSize(localName(first, foodLanguage)).toLowerCase(),
        sortPrice: first.price
      })
    }
  }

  for (const item of items) {
    if (grouped.has(item.id)) continue
    entries.push({
      type: 'single',
      key: `i:${item.id}`,
      item,
      label: labels.get(item.id) || localName(item, foodLanguage),
      sortName: localName(item, foodLanguage).toLowerCase(),
      sortPrice: item.price
    })
  }

  const dir = sortDirection === 'asc' ? 1 : -1
  entries.sort((a, b) =>
    sortMode === 'name'
      ? dir * a.sortName.localeCompare(b.sortName)
      : dir * (a.sortPrice - b.sortPrice) || a.sortName.localeCompare(b.sortName)
  )
  return entries.map(({ sortName: _n, sortPrice: _p, ...entry }) => entry as GridEntry)
}
