import type { ComboDefinition, ComboSlotInput } from '../../../../shared/catalog-types'
import { draftKey, parseAmount } from './catalogShared'
import type { MenuRow } from './menuTypes'

/** Draft shapes + pure rules for the combo builder (mirrors the main-process combo service). */

export interface ChoiceDraft {
  key: string
  menu_item_id: number | null
  category_id: number | null
  upcharge: string
  is_default: boolean
}

export interface SlotDraft {
  key: string
  id: number | null
  name: string
  name_ar: string
  name_fr: string
  min_select: number
  max_select: number
  choices: ChoiceDraft[]
}

export const MAX_PICKS = 20

export function comboToDrafts(def: ComboDefinition | null): SlotDraft[] {
  if (!def) return []
  return def.slots.map((slot) => ({
    key: `s${slot.id}`,
    id: slot.id,
    name: slot.name,
    name_ar: slot.name_ar ?? '',
    name_fr: slot.name_fr ?? '',
    min_select: slot.min_select,
    max_select: slot.max_select,
    choices: slot.choices.map((choice) => ({
      key: `c${choice.id}`,
      menu_item_id: choice.menu_item_id,
      category_id: choice.category_id,
      upcharge: choice.upcharge ? String(choice.upcharge) : '',
      is_default: choice.is_default === 1
    }))
  }))
}

export function newSlotDraft(name = '', translations: { ar?: string; fr?: string } = {}): SlotDraft {
  return {
    key: draftKey('s'),
    id: null,
    name,
    name_ar: translations.ar ?? '',
    name_fr: translations.fr ?? '',
    min_select: 1,
    max_select: 1,
    choices: []
  }
}

export function newChoice(target: { menu_item_id?: number; category_id?: number }): ChoiceDraft {
  return {
    key: draftKey('c'),
    menu_item_id: target.menu_item_id ?? null,
    category_id: target.category_id ?? null,
    upcharge: '',
    is_default: false
  }
}

export function upchargeOf(choice: ChoiceDraft): number {
  const value = parseAmount(choice.upcharge)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function slotsToInput(slots: SlotDraft[]): { slots: ComboSlotInput[] } {
  return {
    slots: slots.map((slot, slotIndex) => ({
      ...(slot.id ? { id: slot.id } : {}),
      name: slot.name.trim(),
      name_ar: slot.name_ar.trim() || null,
      name_fr: slot.name_fr.trim() || null,
      min_select: slot.min_select,
      max_select: slot.max_select,
      sort_order: slotIndex,
      choices: slot.choices.map((choice, choiceIndex) => ({
        menu_item_id: choice.menu_item_id,
        category_id: choice.category_id,
        upcharge: upchargeOf(choice),
        is_default: choice.menu_item_id !== null && choice.is_default,
        sort_order: choiceIndex
      }))
    }))
  }
}

/** First blocking problem (i18n key under combos.errors + params), or null. */
export function validateSlots(slots: SlotDraft[]): { key: string; params?: Record<string, string | number> } | null {
  if (slots.length === 0) return { key: 'noSlots' }
  for (const slot of slots) {
    const name = slot.name.trim()
    if (!name) return { key: 'slotName' }
    if (slot.choices.length === 0) return { key: 'noChoices', params: { slot: name } }
    if (slot.max_select < 1 || slot.min_select > slot.max_select) return { key: 'rules', params: { slot: name } }
    if (slot.choices.some((c) => c.upcharge.trim() && !(parseAmount(c.upcharge) >= 0))) return { key: 'upcharge', params: { slot: name } }
    if (slot.choices.filter((c) => c.is_default && c.menu_item_id !== null).length > slot.max_select) {
      return { key: 'defaults', params: { slot: name, max: slot.max_select } }
    }
  }
  return null
}

/** Items a slot offers (direct choices first, then whole categories), like the order screen. */
export function slotCandidates(slot: SlotDraft, items: MenuRow[], comboId: number | null): { item: MenuRow; choice: ChoiceDraft }[] {
  const sellable = items.filter((item) => !item.is_combo && item.id !== comboId)
  const out = new Map<number, { item: MenuRow; choice: ChoiceDraft }>()
  for (const choice of slot.choices) {
    if (choice.menu_item_id === null) continue
    const item = sellable.find((i) => i.id === choice.menu_item_id)
    if (item) out.set(item.id, { item, choice })
  }
  for (const choice of slot.choices) {
    if (choice.category_id === null) continue
    for (const item of sellable) if (item.category_id === choice.category_id && !out.has(item.id)) out.set(item.id, { item, choice })
  }
  return [...out.values()]
}

export interface ExamplePick {
  slot: { name: string; name_ar: string | null; name_fr: string | null }
  item: MenuRow
  upcharge: number
  isDefault: boolean
}

/** Default picks, or the first choices when a slot has no default (preview only). */
export function examplePicks(slots: SlotDraft[], items: MenuRow[], comboId: number | null): ExamplePick[] {
  const picks: ExamplePick[] = []
  for (const slot of slots) {
    const candidates = slotCandidates(slot, items, comboId)
    const defaults = candidates.filter((c) => c.choice.is_default && c.choice.menu_item_id === c.item.id)
    const chosen = defaults.length ? defaults : candidates.slice(0, Math.max(1, slot.min_select))
    for (const c of chosen.slice(0, slot.max_select)) {
      picks.push({ slot: { name: slot.name, name_ar: slot.name_ar || null, name_fr: slot.name_fr || null }, item: c.item, upcharge: upchargeOf(c.choice), isDefault: defaults.length > 0 })
    }
  }
  return picks
}

/**
 * Same split as allocateComboRevenue (main): upcharges stay with their pick, the combo price is
 * shared in proportion to each pick's normal price (equally when all are 0). Cent-rounded.
 */
export function allocate(total: number, parts: { weight: number; own: number }[]): number[] {
  if (parts.length === 0) return []
  const ownSum = parts.reduce((sum, p) => sum + Math.max(0, p.own), 0)
  let raw: number[]
  if (total >= ownSum) {
    const pool = total - ownSum
    const weightSum = parts.reduce((sum, p) => sum + Math.max(0, p.weight), 0)
    raw = parts.map((p) => Math.max(0, p.own) + (weightSum > 0 ? (pool * Math.max(0, p.weight)) / weightSum : pool / parts.length))
  } else {
    raw = parts.map((p) => (ownSum > 0 ? (total * Math.max(0, p.own)) / ownSum : total / parts.length))
  }
  const round = (n: number) => Math.round(n * 100) / 100
  const rounded = raw.map(round)
  const diff = round(total - rounded.reduce((s, v) => s + v, 0))
  if (diff !== 0) {
    const largest = rounded.indexOf(Math.max(...rounded))
    rounded[largest] = round(rounded[largest] + diff)
  }
  return rounded
}
