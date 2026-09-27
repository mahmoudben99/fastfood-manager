/** Localized names for menu data (the "food language" setting, independent of the UI language). */
export interface Named {
  name: string
  name_ar?: string | null
  name_fr?: string | null
}

export function localName(item: Named, foodLanguage: string): string {
  if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
  if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
  return item.name
}

/**
 * Size suffixes (longer first): S/M/L/XL/XS/XXL, French Grande/Grand/Petit/Moyen/Normal/Géant,
 * the N/G/P abbreviations common in Algeria, Small/Medium/Large.
 */
export const SIZE_PATTERNS = /\s+(XXL|XL|XS|Small|Medium|Large|Grande|Grand|Geant|Géant|Petit|Moyen|Normal|S|M|L|N|G|P)\s*$/i

export function sizeLabel(name: string): string {
  const match = name.match(SIZE_PATTERNS)
  return match ? match[1].toUpperCase() : name
}

export function stripSize(name: string): string {
  const match = name.match(SIZE_PATTERNS)
  return match ? name.slice(0, match.index!).trim() : name
}

/** Search across every language of the item. */
export function matchesQuery(item: Named, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return item.name.toLowerCase().includes(q) ||
    Boolean(item.name_ar && item.name_ar.includes(query.trim())) ||
    Boolean(item.name_fr && item.name_fr.toLowerCase().includes(q))
}
