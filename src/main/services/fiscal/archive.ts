import type Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { FISCAL_RETENTION_YEARS, type ArchiveYearSummary, type JournalVerification } from '../../../shared/fiscal'
import { sha256 } from './hash'

/**
 * Yearly fiscal archive (6-year retention, never purged by the software): one folder per year
 * with JSON (the reference, exact values) + CSV (for spreadsheets) + manifest.json holding the
 * SHA-256 of every file and the journal range, so a later reader can prove nothing changed.
 * Personal data (customer phone / name, notes) is not needed for the fiscal record and is left out.
 */

const ORDER_COLUMNS = [
  'fiscal_number', 'id', 'daily_number', 'order_date', 'created_at', 'completed_at', 'order_type', 'channel', 'source',
  'status', 'subtotal', 'discount_amount', 'discount_details', 'delivery_fee', 'total', 'payment_status', 'cashier_name', 'shift_id'
]
const LINE_COLUMNS = [
  'fiscal_number', 'order_id', 'id', 'parent_order_item_id', 'line_kind', 'menu_item_id', 'item_name', 'quantity',
  'unit_price', 'total_price', 'combo_upcharge', 'allocated_revenue', 'options'
]
const PAYMENT_COLUMNS = [
  'fiscal_number', 'order_id', 'id', 'kind', 'method', 'amount', 'rounding', 'tendered', 'change_given', 'reference',
  'shift_id', 'auto', 'operator', 'reason', 'created_at'
]
const JOURNAL_COLUMNS = ['seq', 'created_at', 'event_type', 'order_id', 'fiscal_number', 'prev_hash', 'hash', 'payload']

type Row = Record<string, unknown>

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  let text = String(value)
  if (/^[=+@\t\r]/.test(text)) text = `'${text}` // spreadsheet formula guard (JSON keeps the exact value)
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: Row[], columns: string[]): string {
  const lines = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}

function yearRange(year: number): [string, string] {
  return [`${year}-01-01`, `${year}-12-31`]
}

/** Everything the archive of one year contains, as file name → text. */
export function buildYearArchive(
  db: Database.Database,
  year: number,
  meta: { software: string; version: string; exportedAt: Date; verification: JournalVerification | null }
): { files: Record<string, string>; summary: Omit<ArchiveYearSummary, 'folder'> } {
  const [from, to] = yearRange(year)
  const inYear = 'o.order_date BETWEEN ? AND ?'
  const orders = db.prepare(`SELECT ${ORDER_COLUMNS.map((c) => `o.${c}`).join(', ')} FROM orders o WHERE ${inYear} ORDER BY o.fiscal_number, o.id`)
    .all(from, to) as Row[]
  const lines = db.prepare(
    `SELECT o.fiscal_number, oi.order_id, oi.id, oi.parent_order_item_id, oi.line_kind, oi.menu_item_id,
            COALESCE(oi.item_name, mi.name) AS item_name, oi.quantity, oi.unit_price, oi.total_price, oi.combo_upcharge,
            oi.allocated_revenue,
            (SELECT group_concat(m.name || ' x' || m.quantity || CASE WHEN m.price_delta <> 0 THEN ' (' || m.price_delta || ')' ELSE '' END, ' | ')
             FROM order_item_modifiers m WHERE m.order_item_id = oi.id) AS options
     FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE ${inYear} ORDER BY o.fiscal_number, oi.id`
  ).all(from, to) as Row[]
  const payments = db.prepare(
    `SELECT o.fiscal_number, p.order_id, p.id, p.kind, p.method, p.amount, p.rounding, p.tendered, p.change_given, p.reference,
            p.shift_id, p.auto, p.operator, p.reason, p.created_at
     FROM order_payments p JOIN orders o ON o.id = p.order_id WHERE ${inYear} ORDER BY o.fiscal_number, p.id`
  ).all(from, to) as Row[]
  const removed = db.prepare(
    `SELECT a.order_id, a.order_item_id, a.row_json, a.removed_at FROM order_items_archive a
     JOIN orders o ON o.id = a.order_id WHERE ${inYear} ORDER BY a.id`
  ).all(from, to) as Row[]
  // Journal entries written during the year (restaurant time), as one contiguous seq range.
  const range = db.prepare(
    `SELECT MIN(seq) AS first, MAX(seq) AS last FROM fiscal_journal WHERE substr(datetime(created_at, '+1 hour'), 1, 4) = ?`
  ).get(String(year)) as { first: number | null; last: number | null }
  const journal = range.first === null
    ? []
    : db.prepare('SELECT * FROM fiscal_journal WHERE seq BETWEEN ? AND ? ORDER BY seq').all(range.first, range.last) as Row[]

  const byOrder = <T extends Row>(rows: T[]): Map<unknown, T[]> => {
    const map = new Map<unknown, T[]>()
    for (const row of rows) map.set(row.order_id, [...(map.get(row.order_id) ?? []), row])
    return map
  }
  const linesByOrder = byOrder(lines)
  const paymentsByOrder = byOrder(payments)
  const removedByOrder = byOrder(removed)
  const ordersJson = orders.map((order) => ({
    ...order,
    lines: linesByOrder.get(order.id) ?? [],
    payments: paymentsByOrder.get(order.id) ?? [],
    removed_lines: (removedByOrder.get(order.id) ?? []).map((row) => ({ ...row, row_json: JSON.parse(String(row.row_json)) }))
  }))

  const files: Record<string, string> = {
    'orders.json': JSON.stringify({ year, orders: ordersJson }, null, 1),
    'orders.csv': toCsv(orders, ORDER_COLUMNS),
    'order_lines.csv': toCsv(lines, LINE_COLUMNS),
    'payments.csv': toCsv(payments, PAYMENT_COLUMNS),
    'journal.json': JSON.stringify({ year, entries: journal }, null, 1),
    'journal.csv': toCsv(journal, JOURNAL_COLUMNS),
    'LISEZMOI.txt': readme(year)
  }
  const numbers = orders.map((order) => Number(order.fiscal_number)).filter((n) => Number.isFinite(n) && n > 0)
  const manifest = {
    software: meta.software,
    software_version: meta.version,
    schema: 25,
    year,
    exported_at: meta.exportedAt.toISOString(),
    retention_years: FISCAL_RETENTION_YEARS,
    keep_until: `${year + FISCAL_RETENTION_YEARS}-12-31`,
    counts: { orders: orders.length, lines: lines.length, payments: payments.length, removed_lines: removed.length, journal_entries: journal.length },
    // orders are sorted by fiscal number
    fiscal_numbers: numbers.length ? { first: numbers[0], last: numbers[numbers.length - 1] } : null,
    journal: journal.length
      ? { first_seq: journal[0].seq, last_seq: journal[journal.length - 1].seq, first_prev_hash: journal[0].prev_hash, last_hash: journal[journal.length - 1].hash }
      : null,
    verification: meta.verification
      ? { ok: meta.verification.ok, verified_at: meta.verification.verifiedAt, breaks: meta.verification.breaks.length }
      : null,
    files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, sha256(text)]))
  }
  files['manifest.json'] = JSON.stringify(manifest, null, 2)
  return {
    files,
    summary: { year, orders: orders.length, lines: lines.length, payments: payments.length, journalEvents: journal.length }
  }
}

export function writeYearArchive(baseFolder: string, year: number, files: Record<string, string>, stamp: string): string {
  const folder = join(baseFolder, `FFM-archive-${year}-${stamp}`)
  mkdirSync(folder, { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text, 'utf8')
  return folder
}

function readme(year: number): string {
  return [
    `Archive fiscale ${year} — Fast Food Manager`,
    '',
    `A conserver au moins ${FISCAL_RETENTION_YEARS} ans (jusqu'au 31/12/${year + FISCAL_RETENTION_YEARS}). Le logiciel ne supprime jamais ces donnees.`,
    'orders.json / journal.json : donnees de reference (valeurs exactes). Les fichiers CSV servent aux tableurs.',
    'manifest.json : empreinte SHA-256 de chaque fichier et plage du journal chaine (seq, hash).',
    'Le journal est chaine : le prev_hash de chaque ecriture est le hash de la precedente.',
    'Les donnees personnelles (telephone, nom du client, notes) ne font pas partie de l\'archive fiscale.',
    '',
    `Fiscal archive ${year}: keep at least ${FISCAL_RETENTION_YEARS} years. JSON = reference data, CSV = for spreadsheets,`,
    'manifest.json = SHA-256 of every file + the journal range. Customer personal data is not included.',
    ''
  ].join('\r\n')
}
