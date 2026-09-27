/**
 * Human-readable text of a rejected window.api call. Electron prefixes main-process errors
 * with "Error invoking remote method 'x:y': Error: …"; strip that so users see only the reason.
 */
export function ipcErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '').trim()
  return cleaned || fallback
}
