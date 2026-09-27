/**
 * Category accent colours (tokens --cat-1 .. --cat-10). Pick by a stable key (category id), never
 * by list position, so a category keeps its colour when others are added/reordered (muscle memory).
 */

export const CATEGORY_COLOR_COUNT = 10

export type CategoryColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** Stable 1..10 index for a category id (or any number/string key). */
export function categoryColorIndex(key: number | string | null | undefined): CategoryColorIndex {
  if (key === null || key === undefined || key === '') return 10
  const n =
    typeof key === 'number'
      ? Math.abs(Math.trunc(key))
      : Array.from(key).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return (((n - 1) % CATEGORY_COLOR_COUNT + CATEGORY_COLOR_COUNT) % CATEGORY_COLOR_COUNT + 1) as CategoryColorIndex
}

/** CSS colour value for inline styles: `style={{ '--cat': categoryColor(cat.id) }}`. */
export function categoryColor(key: number | string | null | undefined): string {
  return `var(--cat-${categoryColorIndex(key)})`
}

/** Soft tint of the category colour, for chip / tile backgrounds (works in both themes). */
export function categoryTint(key: number | string | null | undefined, percent = 14): string {
  return `color-mix(in oklab, var(--cat-${categoryColorIndex(key)}) ${percent}%, var(--surface))`
}
