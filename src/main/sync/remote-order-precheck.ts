import type Database from 'better-sqlite3'
import { catalogLang, isSoldOut } from '../services/catalog-common'
import { resolveModifierGroups, type ResolvedModifierGroup } from '../services/modifiers'
import { resolveComboSlots } from '../services/combos'

/**
 * Remote (cloud) order requests carry only item ids + quantities, so the order service applies each
 * item's DEFAULT options and combo picks. An item with a REQUIRED option group that has no default
 * (or a combo part without a default pick, or a sold-out item) can therefore never be accepted as
 * sent — the accept used to fail with a generic "choose at least 1 …" after claiming the request.
 * This precheck finds those lines up front and words an actionable reason for the cashier; the
 * listener attaches it to each pending row (`local_issues`, `blocked_reason`) and refuses to claim
 * a blocked request (the cashier calls the customer and rings it up, or rejects it).
 */
export type RemoteIssueCode = 'item_unavailable' | 'item_sold_out' | 'choice_required'

export interface RemoteLineIssue {
  line: number
  menu_item_id: number
  item: string
  code: RemoteIssueCode
  group?: string
  message: string
}

export interface RemotePrecheck {
  local_issues: RemoteLineIssue[]
  blocked_reason: string | null
}

type Lang = 'en' | 'fr' | 'ar'

const TEXT: Record<Lang, Record<RemoteIssueCode | 'call' | 'more', string>> = {
  en: {
    choice_required: '"{item}" needs a choice in "{group}" (required, no default option), which the online order cannot send. {call} and ring the order up at the POS, or give "{group}" a default option in Menu › Options.',
    item_sold_out: '"{item}" is sold out. {call} to offer something else, or reject the request.',
    item_unavailable: '"{item}" is no longer on the menu. {call}, or reject the request.',
    call: 'Call the customer{phone}',
    more: '(+{n} more)'
  },
  fr: {
    choice_required: '« {item} » exige un choix dans « {group} » (obligatoire, sans option par défaut) que la commande en ligne ne peut pas transmettre. {call} et saisissez la commande à la caisse, ou définissez une option par défaut pour « {group} » dans Menu › Options.',
    item_sold_out: '« {item} » est épuisé. {call} pour proposer autre chose, ou refusez la demande.',
    item_unavailable: '« {item} » n\'est plus au menu. {call}, ou refusez la demande.',
    call: 'Appelez le client{phone}',
    more: '(+{n} autres)'
  },
  ar: {
    choice_required: '«{item}» يتطلب اختيارًا من «{group}» (إلزامي، بلا خيار افتراضي) ولا يمكن للطلب عبر الإنترنت إرساله. {call} وسجّل الطلب في نقطة البيع، أو حدّد خيارًا افتراضيًا لـ «{group}» في القائمة › الخيارات.',
    item_sold_out: '«{item}» نفد. {call} لاقتراح بديل، أو ارفض الطلب.',
    item_unavailable: '«{item}» لم يعد في القائمة. {call}، أو ارفض الطلب.',
    call: 'اتصل بالزبون{phone}',
    more: '(+{n} أخرى)'
  }
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined ? String(params[key]) : match))
}

/** Required groups whose default options cannot satisfy the minimum (the service would refuse). */
function unmetRequiredGroup(groups: ResolvedModifierGroup[]): ResolvedModifierGroup | null {
  for (const group of groups) {
    if (group.min_select <= 0) continue
    const defaults = group.options.filter((option) => option.is_default).length
    const usable = group.max_select == null ? defaults : Math.min(defaults, group.max_select)
    if (usable < group.min_select) return group
  }
  return null
}

export function precheckRemoteItems(
  db: Database.Database,
  rawItems: unknown,
  options: { phone?: string | null; lang?: Lang } = {}
): RemotePrecheck {
  const lang: Lang = options.lang ?? catalogLang(db)
  const words = TEXT[lang]
  const phone = typeof options.phone === 'string' && options.phone.trim() ? ` (${options.phone.trim()})` : ''
  const call = fill(words.call, { phone })
  const issues: RemoteLineIssue[] = []
  const items = Array.isArray(rawItems) ? rawItems : []
  const push = (line: number, menuItemId: number, item: string, code: RemoteIssueCode, group?: string): void => {
    issues.push({ line, menu_item_id: menuItemId, item, code, group, message: fill(words[code], { item, group: group ?? '', call }) })
  }

  items.forEach((raw: any, line) => {
    const menuItemId = Number(raw?.menuItemId ?? raw?.menu_item_id)
    if (!Number.isInteger(menuItemId) || menuItemId <= 0) return
    const menu = db.prepare('SELECT id, name, is_combo FROM menu_items WHERE id = ? AND is_active = 1').get(menuItemId) as
      | { id: number; name: string; is_combo: number }
      | undefined
    const shownName = String(menu?.name ?? raw?.name ?? `#${menuItemId}`)
    if (!menu) return push(line, menuItemId, shownName, 'item_unavailable')
    if (isSoldOut(db, menuItemId)) return push(line, menuItemId, shownName, 'item_sold_out')
    const unmet = unmetRequiredGroup(resolveModifierGroups(db, menuItemId))
    if (unmet) return push(line, menuItemId, shownName, 'choice_required', unmet.name)
    if (menu.is_combo !== 1) return
    for (const slot of resolveComboSlots(db, menuItemId)) {
      const defaults = slot.choices.filter((choice) => choice.is_default).slice(0, slot.max_select)
      if (defaults.length < slot.min_select) return push(line, menuItemId, shownName, 'choice_required', slot.name)
      for (const choice of defaults) {
        if (choice.sold_out) return push(line, menuItemId, `${shownName} › ${choice.name}`, 'item_sold_out')
        const childUnmet = unmetRequiredGroup(resolveModifierGroups(db, choice.menu_item_id))
        if (childUnmet) return push(line, menuItemId, `${shownName} › ${choice.name}`, 'choice_required', childUnmet.name)
      }
    }
  })

  if (issues.length === 0) return { local_issues: [], blocked_reason: null }
  const more = issues.length > 1 ? ` ${fill(words.more, { n: issues.length - 1 })}` : ''
  return { local_issues: issues, blocked_reason: issues[0].message + more }
}
