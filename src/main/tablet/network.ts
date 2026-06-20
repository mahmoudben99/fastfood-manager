import os from 'os'

/**
 * LAN address detection for the TV/tablet display.
 *
 * The old getLocalIP() returned the FIRST non-internal IPv4 address, which on a real
 * restaurant PC (WiFi + a wired NIC to the thermal printer + VirtualBox/Hyper-V/VPN
 * virtual adapters) was essentially random — it frequently picked the printer's network
 * or a virtual adapter, so the TV could never reach it ("confused with the printer LAN").
 *
 * Fix: enumerate EVERY candidate IPv4, drop the obviously-unreachable ones (loopback,
 * link-local, known virtual ranges), rank the rest best-first, and expose the FULL list.
 * The TV app then probes every address and uses whichever actually answers — so even if a
 * printer/virtual NIC sneaks through, it just fails the probe and the TV moves on.
 */

// Interface names that are almost never the shop's WiFi/LAN.
const VIRTUAL_NAME_PATTERNS = [
  'vethernet', 'virtualbox', 'vmware', 'hyper-v', 'loopback', 'bluetooth',
  'vpn', 'tap', 'tun', 'docker', 'wsl', 'npcap', 'zerotier', 'tailscale', 'radmin'
]

function isVirtualName(name: string): boolean {
  const n = name.toLowerCase()
  return VIRTUAL_NAME_PATTERNS.some((p) => n.includes(p))
}

function scoreCandidate(name: string, address: string): number {
  let s = 0
  if (isVirtualName(name)) s -= 100
  if (address.startsWith('192.168.56.')) s -= 80 // VirtualBox host-only default
  if (address.startsWith('172.')) s -= 30 // often Docker / Hyper-V (172.16-31)
  if (address.startsWith('192.168.')) s += 50 // typical home/shop WiFi
  if (address.startsWith('10.')) s += 30 // common private range
  return s
}

/** All reachable LAN IPv4 addresses, best candidate first. */
export function getLanIPs(): string[] {
  const nets = os.networkInterfaces()
  const candidates: { address: string; score: number }[] = []
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      if (addr.address.startsWith('169.254.')) continue // link-local / APIPA — never routable to the TV
      candidates.push({ address: addr.address, score: scoreCandidate(name, addr.address) })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of candidates) {
    if (!seen.has(c.address)) {
      seen.add(c.address)
      out.push(c.address)
    }
  }
  return out
}

/** Single best LAN IP — for the human-facing URL/QR. The TV uses the full list instead. */
export function getBestLanIP(): string {
  return getLanIPs()[0] || '127.0.0.1'
}
