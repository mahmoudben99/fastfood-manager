import { spawn } from 'child_process'

/**
 * Windows Firewall helper for the LAN display port.
 *
 * A restaurant PC often blocks inbound connections to the local display server (Windows
 * classifies the network "Public", or the user dismissed the first-time firewall prompt),
 * so the TV can't reach http://<pc-ip>:3333. Firewall rules need admin, so we run an
 * ELEVATED netsh once (a single UAC prompt) when the user opts in from the TV setup screen.
 *
 * This is an OPTIMISATION, not a hard requirement: if the user declines UAC, the TV app's
 * cloud fallback still keeps the display working — they just lose the instant LAN path.
 */

const RULE_NAME = 'Fast Food Manager Display'

/**
 * Add (idempotently) an inbound allow rule for the given TCP port, elevated.
 * Resolves true if the elevated process exited cleanly, false otherwise (incl. declined UAC).
 */
export function addFirewallRule(port: number): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    try {
      // Delete any prior rule of the same name, then add a fresh one, so re-running is clean.
      const del = `netsh advfirewall firewall delete rule name='${RULE_NAME}'`
      const add =
        `netsh advfirewall firewall add rule name='${RULE_NAME}' ` +
        `dir=in action=allow protocol=TCP localport=${port} profile=any`
      // Start-Process … -Verb RunAs triggers one UAC prompt and runs both commands elevated.
      const inner = `${del}; ${add}`
      const ps =
        `$ErrorActionPreference='SilentlyContinue'; ` +
        `Start-Process -FilePath cmd.exe -ArgumentList '/c ${inner}' -Verb RunAs -WindowStyle Hidden -Wait`
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        windowsHide: true
      })
      child.on('error', () => resolve(false))
      child.on('exit', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

export { RULE_NAME as FIREWALL_RULE_NAME }
