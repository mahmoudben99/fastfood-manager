export interface PhoneNormalizationOptions {
  /**
   * Search boxes commonly contain only the first few digits. In that case we still
   * canonicalize an Algerian trunk prefix (05 -> +2135) without treating the partial
   * value as a valid customer identity for inserts/lookups.
   */
  allowPartial?: boolean
}

/**
 * Return the canonical identity for an Algerian customer phone.
 *
 * Algeria's country code is +213 and its national number is nine digits. Restaurant
 * staff commonly enter the same number as 0550123456, 213550123456,
 * +213 550 12 34 56, or with Arabic numerals. All of those forms must resolve to the
 * same loyalty customer. Explicit non-Algerian international numbers are retained in
 * E.164-like form rather than being misclassified as Algerian local numbers.
 */
export function normalizeAlgerianPhone(
  value: string,
  options: PhoneNormalizationOptions = {}
): string | null {
  if (typeof value !== 'string') return null

  const text = value
    .normalize('NFKC')
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()

  const explicitlyInternational = /^(?:\+|00)/.test(text)
  let digits = text.replace(/\D/g, '')
  if (text.startsWith('00') && digits.startsWith('00')) digits = digits.slice(2)
  if (!digits) return null

  // Accept the optional domestic trunk zero sometimes written after +213.
  if (digits.startsWith('213')) {
    let national = digits.slice(3)
    if (national.startsWith('0')) national = national.slice(1)
    if (national.length === 9 || (options.allowPartial && national.length > 0 && national.length < 9)) {
      return `+213${national}`
    }
  }

  if (digits.startsWith('0')) {
    const national = digits.slice(1)
    if (national.length === 9 || (options.allowPartial && national.length > 0 && national.length < 9)) {
      return `+213${national}`
    }
  }

  // A nine-digit number without its domestic zero is also a complete Algerian NSN.
  if (digits.length === 9) return `+213${digits}`

  // Preserve explicitly international foreign numbers. The E.164 ceiling is 15 digits.
  if (explicitlyInternational && digits.length >= 7 && digits.length <= 15) return `+${digits}`

  // For partial searches, an interior run such as "55012" can match the canonical key.
  if (options.allowPartial && digits.length > 0 && digits.length <= 15) return digits

  return null
}
