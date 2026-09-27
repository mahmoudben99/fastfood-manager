import { healBlockIds } from '../../../../../shared/settings-rules'
import type { Block, BlockConfig } from '../ReceiptBlockConfig'

export const PRESET_KEYS: Record<string, string> = {
  Classic: 'classic',
  Modern: 'modern',
  Minimal: 'minimal',
  'Full Featured': 'fullFeatured',
  'Bilingual (AR/FR)': 'bilingual'
}

// Block ids are UUIDs (v3.2.1): duplicates from older saves are healed on load.
export const newId = (): string => crypto.randomUUID()

/** Parse stored blocks; re-id duplicates so templates saved by older versions heal on load. */
export function parseBlocks(raw: string): Block[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const objects = parsed.filter((b) => b && typeof b === 'object') as Partial<Block>[]
    return healBlockIds(objects, newId).map((b, i) => ({
      id: b.id,
      type: String(b.type || ''),
      enabled: b.enabled !== false,
      config: (b.config && typeof b.config === 'object' ? b.config : {}) as BlockConfig,
      sortOrder: i
    }))
  } catch {
    return []
  }
}

export const snapshotOf = (name: string, blocks: Block[]) => JSON.stringify({ name: name.trim(), blocks })
