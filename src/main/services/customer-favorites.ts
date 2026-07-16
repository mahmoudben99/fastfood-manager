import type Database from 'better-sqlite3'

export interface FavoriteItemRow { menu_item_id: number; total: number }

export function getFavoriteItems(db: Database.Database, customerId: number): FavoriteItemRow[] {
  return db.prepare(`SELECT oi.menu_item_id, SUM(oi.quantity) AS total
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_id = ? AND o.status != 'cancelled'
    GROUP BY oi.menu_item_id ORDER BY total DESC LIMIT 5`).all(customerId) as FavoriteItemRow[]
}
