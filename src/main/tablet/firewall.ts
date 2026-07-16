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
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return Promise.resolve(false)

  return new Promise((resolve) => {
    try {
      // The elevated script. Three things the previous version got wrong:
      //   1. It joined the two netsh calls with `;`, which cmd.exe does NOT treat as a command
      //      separator, so the second command was never run as a command.
      //   2. It wrapped the rule name in SINGLE quotes. netsh doesn't accept those as quoting,
      //      and they also terminated the enclosing PowerShell single-quoted string early.
      //   3. `Start-Process -Wait` without -PassThru yields PowerShell's own exit code, so the
      //      function returned `true` even when netsh failed or the user declined UAC.
      // Passing the name via a PS variable (`name=$n`) hands netsh one correctly-quoted argv
      // entry, and `exit $LASTEXITCODE` propagates the real result of the `add`.
      const inner = [
        `$ErrorActionPreference='SilentlyContinue'`,
        `$n='${RULE_NAME.replace(/'/g, "''")}'`,
        `netsh advfirewall firewall delete rule name=$n | Out-Null`,
        `netsh advfirewall firewall add rule name=$n dir=in action=allow protocol=TCP localport=${port} profile=any | Out-Null`,
        `exit $LASTEXITCODE`
      ].join('; ')

      // -EncodedCommand takes base64 UTF-16LE, so no quoting survives to be mangled.
      const encoded = Buffer.from(inner, 'utf16le').toString('base64')
      const outer =
        `try { ` +
        `$p = Start-Process powershell.exe ` +
        `-ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}' ` +
        `-Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; ` +
        `exit $p.ExitCode ` +
        `} catch { exit 1 }`

      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], {
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
