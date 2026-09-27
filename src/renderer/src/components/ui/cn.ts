/** Join class names, skipping falsy values. (No tailwind-merge: later utilities do NOT win by order.) */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ')
}
