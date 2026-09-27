/**
 * Kitchen Display System — shapes shared by the main process (snapshot builder, LAN server),
 * the preload bridge and the renderer's #/kds and #/board routes.
 *
 * Station ids: a KDS ticket exists per (order, station). A station is a worker (workers.id > 0);
 * station 0 is "Expo" and holds the lines no worker is assigned to — exactly like the
 * kitchen-ticket routing, where unassigned lines ride on the full ticket.
 */

export type KdsTicketStatus = 'new' | 'in_progress' | 'ready' | 'bumped' | 'cancelled'
/** Line-level marks shown on an UPDATED ticket. */
export type KdsLineChange = 'added' | 'removed' | 'changed'
/** Ticket-level live change banner. */
export type KdsTicketChange = 'updated' | 'cancelled' | 'restored'
/** 'all' = the expo view (every station, one card per order); a number = one station. */
export type KdsStationFilter = 'all' | number

export const KDS_EXPO_STATION = 0

/** Mirrors v4-catalog's order_item_modifiers rows. quantity is per ONE unit of the line. */
export interface KdsModifier {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  quantity: number
  /** 'none' | 'extra' | 'light' | 'no' (tolerant: unknown kinds render like 'none'). */
  kind?: string | null
}

export interface KdsItemView {
  id: number
  orderItemId: number
  parentOrderItemId: number | null
  /** Combo children: the combo's display name ("COMBO: Menu Maxi"). */
  comboName: string | null
  name: string
  nameAr: string | null
  nameFr: string | null
  quantity: number
  previousQuantity: number | null
  notes: string | null
  modifiers: KdsModifier[]
  change: KdsLineChange | null
  doneAt: string | null
}

export interface KdsTicketView {
  id: number
  stationId: number
  /** Worker name; '' for the expo/unassigned station (the UI shows its translated label). */
  stationName: string
  status: KdsTicketStatus
  createdAt: string
  startedAt: string | null
  readyAt: string | null
  bumpedAt: string | null
  cancelledAt: string | null
  recalledAt: string | null
  change: KdsTicketChange | null
  changedAt: string | null
  items: KdsItemView[]
}

export interface KdsCard {
  /** 't<ticketId>' on a station view, 'o<orderId>' on the expo view. */
  key: string
  orderId: number
  dailyNumber: number
  orderType: string
  tableNumber: string | null
  customerName: string | null
  orderNote: string | null
  source: string
  /** Timer origin (earliest ticket creation). Recall never resets it. */
  timerStart: string
  status: KdsTicketStatus
  change: KdsTicketChange | null
  changedAt: string | null
  cancelledAt: string | null
  tickets: KdsTicketView[]
}

export interface KdsAllDayRow {
  key: string
  name: string
  nameAr: string | null
  nameFr: string | null
  quantity: number
}

export interface KdsStation {
  id: number
  name: string
}

export interface KdsDisplaySettings {
  warnMinutes: number
  lateMinutes: number
  sound: boolean
  flash: boolean
}

export interface KdsSettings extends KdsDisplaySettings {
  boardClearMinutes: number
  /** Stations whose automatic paper kitchen tickets are replaced by the screen (0 = expo/full ticket). */
  paperlessStations: number[]
  pin: string
}

export interface KdsSnapshot {
  serverTime: string
  station: KdsStationFilter
  stations: KdsStation[]
  settings: KdsDisplaySettings
  cards: KdsCard[]
  allDay: KdsAllDayRow[]
  readyOrderIds: number[]
  canRecall: boolean
}

export interface KdsBoardEntry {
  orderId: number
  number: number
  /** Set on ready entries: when the kitchen finished (drives the highlight + auto-clear). */
  readyAt: string | null
}

export interface KdsBoardState {
  serverTime: string
  restaurantName: string
  clearMinutes: number
  preparing: KdsBoardEntry[]
  ready: KdsBoardEntry[]
}

export type KdsActionResult = { ok: true } | { ok: false; error: string }

export interface KdsChangeEvent {
  orderIds: number[]
  /** True when settings changed: every view should refetch. */
  settings?: boolean
}

export interface KdsReadyEvent {
  orderId: number
  dailyNumber: number
  ready: boolean
}

export interface KdsDisplayInfo {
  id: number
  label: string
  primary: boolean
  width: number
  height: number
}

export interface KdsLanInfo {
  running: boolean
  kdsUrl: string
  boardUrl: string
  /** QR code data URLs of the two links (null while the LAN server is off). */
  kdsQr: string | null
  boardQr: string | null
}

/** How long a cancelled ticket keeps flashing before it disappears. */
export const KDS_CANCEL_FLASH_MS = 12_000
/** Undo window offered after a bump. */
export const KDS_UNDO_MS = 5_000
/** How long an UPDATED / RESTORED banner stays highlighted. */
export const KDS_CHANGE_HIGHLIGHT_MS = 90_000

export type KdsTimerLevel = 'ok' | 'warn' | 'late'

export function kdsTimerLevel(elapsedMs: number, warnMinutes: number, lateMinutes: number): KdsTimerLevel {
  const minutes = elapsedMs / 60_000
  if (minutes >= lateMinutes) return 'late'
  if (minutes >= warnMinutes) return 'warn'
  return 'ok'
}

export function formatKdsElapsed(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** Localised dish name with fallback to the base name. */
export function kdsLocalName(item: { name: string; nameAr?: string | null; nameFr?: string | null }, lang: string): string {
  if (lang === 'ar' && item.nameAr) return item.nameAr
  if (lang === 'fr' && item.nameFr) return item.nameFr
  return item.name
}

export function kdsModifierName(modifier: KdsModifier, lang: string): string {
  if (lang === 'ar' && modifier.name_ar) return modifier.name_ar
  if (lang === 'fr' && modifier.name_fr) return modifier.name_fr
  return modifier.name
}

/** A modifier that removes something ("NO ONIONS") is shown as a warning. */
export function kdsModifierIsRemoval(modifier: KdsModifier): boolean {
  return (modifier.kind || '').toLowerCase() === 'no'
}

/**
 * Kitchen label for a modifier, following the catalog's paper-ticket convention:
 * no -> "NO ONIONS", extra -> "EXTRA CHEESE", light -> "LIGHT SAUCE", none -> "+ Cheese",
 * " x2" when the per-unit quantity is above one. A name that already starts with its prefix
 * ("No onions") is not prefixed twice.
 */
export function kdsModifierLabel(
  modifier: KdsModifier,
  lang: string,
  prefixes: { modNo: string; modExtra: string; modLight: string }
): string {
  const name = kdsModifierName(modifier, lang)
  const kind = (modifier.kind || 'none').toLowerCase()
  const prefix = kind === 'no' ? prefixes.modNo : kind === 'extra' ? prefixes.modExtra : kind === 'light' ? prefixes.modLight : ''
  const english = kind === 'no' ? 'no' : kind === 'extra' ? 'extra' : kind === 'light' ? 'light' : ''
  const lower = name.toLocaleLowerCase()
  const alreadyPrefixed = !!prefix &&
    (lower.startsWith(prefix.toLocaleLowerCase() + ' ') || (!!english && lower.startsWith(english + ' ')))
  let label = !prefix ? `+ ${name}` : alreadyPrefixed ? name : `${prefix} ${name}`
  if (prefix) label = label.toLocaleUpperCase()
  const quantity = Number(modifier.quantity) || 1
  return quantity > 1 ? `${label} x${quantity}` : label
}

export function parseKdsStation(value: unknown): KdsStationFilter {
  if (value === 'all' || value === undefined || value === null || value === '') return 'all'
  const id = Number(value)
  return Number.isInteger(id) && id >= 0 ? id : 'all'
}
