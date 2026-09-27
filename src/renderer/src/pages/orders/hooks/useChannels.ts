import { useEffect, useState } from 'react'

/** A delivery platform the order can be sold on (window.api.channels, v4 fiscal/channels). */
export interface PlatformChannel {
  id: string
  label: string
  builtin: boolean
}

interface SalesChannelRow {
  id: string
  label: string
  builtin: boolean
  orderType: string
  enabled: boolean
}

let cache: Promise<PlatformChannel[]> | null = null

function loadPlatforms(): Promise<PlatformChannel[]> {
  const api = (window.api as unknown as { channels?: { list?: () => Promise<SalesChannelRow[]> } }).channels
  if (!api?.list) return Promise.resolve([])
  cache ??= api.list()
    .then((rows) => (rows || [])
      .filter((c) => c.enabled && c.orderType === 'delivery' && c.id !== 'delivery')
      .map((c) => ({ id: c.id, label: c.label, builtin: c.builtin })))
    .catch(() => [])
  // Platforms change in admin (the screen remounts after); re-read on the next mount.
  const current = cache
  setTimeout(() => { if (cache === current) cache = null }, 30_000)
  return current
}

/** Enabled delivery platforms besides "direct" (Yassir, custom ones); [] on builds without channels. */
export function useDeliveryPlatforms(): PlatformChannel[] {
  const [platforms, setPlatforms] = useState<PlatformChannel[]>([])
  useEffect(() => {
    let alive = true
    loadPlatforms().then((list) => alive && setPlatforms(list))
    return () => { alive = false }
  }, [])
  return platforms
}
