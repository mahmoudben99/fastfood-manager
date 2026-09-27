/** Conversions into cart lines: a menu tile, a saved order (edit), a customer's last order (repeat). */
import type { ResolvedCombo, ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import type { RepeatLine } from '../../../components/checkout'
import { newLineKey, type CartComboChild, type CartItem, type CartModifier, type NewLine } from '../../../store/orderStore'
import { topLevelItems, type MenuItemData, type OrderData, type OrderItemModifierData } from '../types'
import { defaultCartModifiers } from './modifiers'

export function newLineFromMenu(
  item: MenuItemData,
  extra: { modifiers?: CartModifier[]; children?: CartComboChild[]; quantity?: number; notes?: string } = {}
): NewLine {
  return {
    menu_item_id: item.id,
    name: item.name,
    name_ar: item.name_ar,
    name_fr: item.name_fr,
    emoji: item.emoji,
    image_path: item.image_path,
    category_id: item.category_id,
    menu_price: item.price,
    channel_prices: item.channel_prices ?? null,
    is_combo: item.is_combo === 1,
    ...extra
  }
}

const cartModifier = (m: OrderItemModifierData): CartModifier | null =>
  m.option_id == null
    ? null
    : {
        option_id: m.option_id,
        group_id: m.group_id,
        name: m.name,
        name_ar: m.name_ar,
        name_fr: m.name_fr,
        kind: m.kind,
        price_delta: Number(m.price_delta) || 0,
        quantity: Number(m.quantity) || 1
      }

/** Top-level lines of a saved order, with their option snapshot and combo children attached. */
export function linesFromOrder(order: OrderData, menuById: Map<number, MenuItemData>): CartItem[] {
  const all = order.items || []
  return topLevelItems(all).map((row) => {
    const menu = menuById.get(row.menu_item_id)
    const childRows = all.filter((c) => c.parent_order_item_id === row.id)
    const isCombo = row.line_kind === 'combo' || childRows.length > 0
    const children: CartComboChild[] | undefined = isCombo
      ? childRows.map((c) => ({
          slot_id: Number(c.combo_slot_id) || 0,
          menu_item_id: c.menu_item_id,
          // getOrderItems aliases the localized snapshot names as menu_item_name_ar/_fr.
          name: c.menu_item_name || '',
          name_ar: c.menu_item_name_ar ?? null,
          name_fr: c.menu_item_name_fr ?? null,
          upcharge: Number(c.combo_upcharge) || 0,
          modifiers: (c.modifiers || []).map(cartModifier).filter((m): m is CartModifier => m !== null),
          note: c.notes || undefined
        }))
      : undefined
    const unit = Number(row.unit_price) || 0
    return {
      key: newLineKey(),
      order_item_id: row.id,
      menu_item_id: row.menu_item_id,
      name: row.menu_item_name || menu?.name || '',
      name_ar: row.menu_item_name_ar ?? menu?.name_ar ?? null,
      name_fr: row.menu_item_name_fr ?? menu?.name_fr ?? null,
      emoji: menu?.emoji ?? null,
      image_path: row.image_path ?? menu?.image_path ?? null,
      category_id: row.category_id ?? menu?.category_id ?? 0,
      worker_id: row.worker_id ?? null,
      quantity: row.quantity,
      notes: row.notes || '',
      price: unit,
      snapshot_price: unit,
      menu_price: menu?.price,
      channel_prices: menu?.channel_prices ?? null,
      is_combo: isCombo,
      modifiers: (row.modifiers || []).map(cartModifier).filter((m): m is CartModifier => m !== null),
      children,
      child_rows: childRows.map((c) => ({ order_item_id: c.id, menu_item_id: c.menu_item_id, quantity: c.quantity }))
    }
  })
}

/** Resolve option ids of a repeat line against the item's current groups (unknown ids are dropped). */
function resolvePicks(groups: ResolvedModifierGroup[], picks?: { option_id: number; quantity?: number }[]): CartModifier[] {
  if (!picks) return defaultCartModifiers(groups)
  const out: CartModifier[] = []
  for (const pick of picks) {
    for (const group of groups) {
      const option = group.options.find((o) => o.id === pick.option_id)
      if (!option) continue
      out.push({
        option_id: option.id,
        group_id: group.id,
        name: option.name,
        name_ar: option.name_ar,
        name_fr: option.name_fr,
        kind: option.kind,
        price_delta: option.price_delta,
        quantity: Math.max(1, Math.min(pick.quantity ?? 1, group.max_quantity || 1))
      })
    }
  }
  return out
}

/** Every slot's default picks (what the server would use for omitted children), with default options. */
export async function defaultComboChildren(
  combo: ResolvedCombo,
  groupsFor: (menuItemId: number) => Promise<ResolvedModifierGroup[]>
): Promise<CartComboChild[]> {
  const out: CartComboChild[] = []
  for (const slot of combo.slots) {
    for (const choice of slot.choices.filter((c) => c.is_default && !c.sold_out).slice(0, slot.max_select)) {
      out.push({
        slot_id: slot.id,
        menu_item_id: choice.menu_item_id,
        name: choice.name,
        name_ar: choice.name_ar,
        name_fr: choice.name_fr,
        upcharge: choice.upcharge,
        modifiers: choice.has_modifiers ? defaultCartModifiers(await groupsFor(choice.menu_item_id)) : []
      })
    }
  }
  return out
}

/** "Repeat last order": lines still on the menu and not sold out. */
export async function linesFromRepeat(
  repeat: RepeatLine[],
  ctx: {
    menuById: Map<number, MenuItemData>
    groupsFor: (menuItemId: number) => Promise<ResolvedModifierGroup[]>
    comboFor: (menuItemId: number) => Promise<ResolvedCombo | null>
  }
): Promise<{ lines: NewLine[]; skipped: number }> {
  const lines: NewLine[] = []
  let skipped = 0
  for (const entry of repeat) {
    const item = ctx.menuById.get(entry.menu_item_id)
    if (!item || item.sold_out || item.available_now === false || item.available_now === 0) {
      skipped += 1
      continue
    }
    const modifiers = resolvePicks(await ctx.groupsFor(item.id), entry.modifiers)
    let children: CartComboChild[] | undefined
    if (item.is_combo === 1) {
      const combo = await ctx.comboFor(item.id)
      if (!combo) {
        skipped += 1
        continue
      }
      if (!entry.children || entry.children.length === 0) {
        children = await defaultComboChildren(combo, ctx.groupsFor)
        lines.push(newLineFromMenu(item, { modifiers, children, quantity: entry.quantity, notes: entry.notes || '' }))
        continue
      }
      children = []
      for (const pick of entry.children) {
        const slot = combo.slots.find((s) => s.id === pick.slot_id)
        const choice = slot?.choices.find((c) => c.menu_item_id === pick.menu_item_id && !c.sold_out)
        if (!slot || !choice) continue
        children.push({
          slot_id: slot.id,
          menu_item_id: choice.menu_item_id,
          name: choice.name,
          name_ar: choice.name_ar,
          name_fr: choice.name_fr,
          upcharge: choice.upcharge,
          modifiers: choice.has_modifiers ? resolvePicks(await ctx.groupsFor(choice.menu_item_id), pick.modifiers) : [],
          note: pick.note || undefined
        })
      }
    }
    lines.push(newLineFromMenu(item, { modifiers, children, quantity: entry.quantity, notes: entry.notes || '' }))
  }
  return { lines, skipped }
}
