/**
 * Human-readable text for a rejected `window.api.*` call. Electron wraps main-process errors as
 * "Error invoking remote method 'x:y': Error: <message>" — keep only the message.
 */
export function ipcErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(\w*Error):\s*/, '').trim() || raw
}
