/**
 * Removes the common first word from item names if it's repeated across most items.
 * E.g., ["Pizza Margherita", "Pizza Pepperoni", "Pizza Veggie"] → ["Margherita", "Pepperoni", "Veggie"]
 *
 * @param items - Array of item names
 * @param threshold - Minimum percentage of items that must share the prefix (default 0.6 = 60%)
 * @returns Map of original name to simplified name
 */
export function removeRepeatedPrefix(items: string[], threshold: number = 0.6): Map<string, string> {
  const result = new Map<string, string>()

  if (items.length === 0) return result

  // Count first words
  const firstWordCounts = new Map<string, number>()
  items.forEach((item) => {
    const firstWord = item.trim().split(/\s+/)[0]
    if (firstWord) {
      firstWordCounts.set(firstWord, (firstWordCounts.get(firstWord) || 0) + 1)
    }
  })

  // Find the most common first word
  let mostCommonWord = ''
  let maxCount = 0
  firstWordCounts.forEach((count, word) => {
    if (count > maxCount) {
      maxCount = count
      mostCommonWord = word
    }
  })

  // Check if the most common word appears in enough items
  const shouldRemove = maxCount / items.length >= threshold && maxCount > 1

  items.forEach((item) => {
    const trimmed = item.trim()
    if (shouldRemove && trimmed.startsWith(mostCommonWord + ' ')) {
      // Remove the repeated prefix
      const simplified = trimmed.substring(mostCommonWord.length + 1).trim()
      result.set(item, simplified || item) // Fallback to original if empty
    } else {
      result.set(item, item)
    }
  })

  return result
}

/**
 * Get the simplified name for a single item from a map
 */
export function getSimplifiedName(originalName: string, simplifiedMap: Map<string, string>): string {
  return simplifiedMap.get(originalName) || originalName
}
