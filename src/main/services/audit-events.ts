import type Database from 'better-sqlite3'

export interface AuditEventInput {
  eventType: 'price_override' | 'void'; orderId: number; orderItemId?: number
  originalValue: string; newValue: string; operator: string; reason?: string
}

export function recordAuditEvent(db: Database.Database, input: AuditEventInput): void {
  db.prepare(`INSERT INTO audit_events
    (event_type, order_id, order_item_id, original_value, new_value, operator, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    input.eventType, input.orderId, input.orderItemId ?? null, input.originalValue,
    input.newValue, input.operator, input.reason ?? null
  )
}
