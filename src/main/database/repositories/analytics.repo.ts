import { getDb } from '../connection'

/**
 * Item names for per-item reports, still grouped by menu_item_id. The name is the one the item
 * was SOLD under (migration 019 snapshot) on its most recent line in the period, so renaming or
 * reusing a menu item does not rewrite history. SQLite documents that with exactly one max()
 * aggregate, bare columns come from the row holding that max — hence last_line_id.
 */
const SOLD_NAME_COLUMNS = `MAX(oi.id) AS last_line_id,
                COALESCE(oi.item_name, mi.name) AS name,
                CASE WHEN oi.item_name IS NOT NULL THEN oi.item_name_ar ELSE mi.name_ar END AS name_ar,
                CASE WHEN oi.item_name IS NOT NULL THEN oi.item_name_fr ELSE mi.name_fr END AS name_fr`

export const analyticsRepo = {
  getProfitSummary(startDate: string, endDate: string) {
    const revenue = getDb()
      .prepare(
        // v4: revenue excludes delivery fees (usually the driver's), reported separately.
        `SELECT COALESCE(SUM(total - delivery_fee), 0) as total_revenue,
                COALESCE(SUM(delivery_fee), 0) as total_delivery_fees,
                COUNT(*) as order_count
         FROM orders
         WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'`
      )
      .get(startDate, endDate) as { total_revenue: number; total_delivery_fees: number; order_count: number }

    const stockCost = getDb()
      .prepare(
        `SELECT COALESCE(SUM(oid.quantity_deducted * oid.cost_per_unit), 0) as total_stock_cost
         FROM order_item_deductions oid
         JOIN order_items oi ON oid.order_item_id = oi.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'`
      )
      .get(startDate, endDate) as { total_stock_cost: number }

    const workerCost = getDb()
      .prepare(
        `SELECT COALESCE(SUM(pay_amount), 0) as total_worker_cost
         FROM worker_attendance
         WHERE date BETWEEN ? AND ?`
      )
      .get(startDate, endDate) as { total_worker_cost: number }

    return {
      total_revenue: revenue.total_revenue,
      total_delivery_fees: revenue.total_delivery_fees,
      order_count: revenue.order_count,
      total_stock_cost: stockCost.total_stock_cost,
      total_worker_cost: workerCost.total_worker_cost,
      net_profit:
        revenue.total_revenue - stockCost.total_stock_cost - workerCost.total_worker_cost
    }
  },

  getRevenueByDay(startDate: string, endDate: string) {
    return getDb()
      .prepare(
        `SELECT order_date as date,
                SUM(total - delivery_fee) as revenue,
                COUNT(*) as order_count
         FROM orders
         WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
         GROUP BY order_date
         ORDER BY order_date`
      )
      .all(startDate, endDate)
  },

  getCostsByDay(startDate: string, endDate: string) {
    const stockCosts = getDb()
      .prepare(
        `SELECT o.order_date as date,
                SUM(oid.quantity_deducted * oid.cost_per_unit) as stock_cost
         FROM order_item_deductions oid
         JOIN order_items oi ON oid.order_item_id = oi.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'
         GROUP BY o.order_date
         ORDER BY o.order_date`
      )
      .all(startDate, endDate)

    const workerCosts = getDb()
      .prepare(
        `SELECT date, SUM(pay_amount) as worker_cost
         FROM worker_attendance
         WHERE date BETWEEN ? AND ?
         GROUP BY date
         ORDER BY date`
      )
      .all(startDate, endDate)

    return { stockCosts, workerCosts }
  },

  getTopSellingItems(startDate: string, endDate: string, limit: number = 10) {
    return getDb()
      .prepare(
        `SELECT ${SOLD_NAME_COLUMNS},
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                COALESCE(c.name, 'Uncategorized') as category_name
         FROM order_items oi
         JOIN menu_items mi ON oi.menu_item_id = mi.id
         LEFT JOIN categories c ON mi.category_id = c.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'
         GROUP BY oi.menu_item_id
         ORDER BY total_quantity DESC
         LIMIT ?`
      )
      .all(startDate, endDate, limit)
  },

  getWorstSellingItems(startDate: string, endDate: string, limit: number = 10) {
    return getDb()
      .prepare(
        `SELECT ${SOLD_NAME_COLUMNS},
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                COALESCE(c.name, 'Uncategorized') as category_name
         FROM order_items oi
         JOIN menu_items mi ON oi.menu_item_id = mi.id
         LEFT JOIN categories c ON mi.category_id = c.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'
         GROUP BY oi.menu_item_id
         ORDER BY total_quantity ASC
         LIMIT ?`
      )
      .all(startDate, endDate, limit)
  },

  getRevenueByCategory(startDate: string, endDate: string) {
    return getDb()
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorized') as name, c.name_ar, c.name_fr,
                SUM(oi.total_price) as total_revenue,
                SUM(oi.quantity) as total_quantity
         FROM order_items oi
         JOIN menu_items mi ON oi.menu_item_id = mi.id
         LEFT JOIN categories c ON mi.category_id = c.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'
         GROUP BY mi.category_id
         ORDER BY total_revenue DESC`
      )
      .all(startDate, endDate)
  },

  getWorkerPerformance(startDate: string, endDate: string) {
    return getDb()
      .prepare(
        `SELECT w.id, w.name, w.role,
                COUNT(DISTINCT oi.order_id) as orders_handled,
                COALESCE(SUM(oi.total_price), 0) as total_revenue,
                (SELECT COALESCE(SUM(pay_amount), 0) FROM worker_attendance
                 WHERE worker_id = w.id AND date BETWEEN ? AND ?) as total_pay
         FROM workers w
         LEFT JOIN order_items oi ON w.id = oi.worker_id
           AND oi.order_id IN (
             SELECT id FROM orders
             WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
           )
         WHERE w.is_active = 1
         GROUP BY w.id
         ORDER BY total_revenue DESC`
      )
      .all(startDate, endDate, startDate, endDate)
  },

  getMonthlyTrends(year: number) {
    return getDb()
      .prepare(
        `SELECT strftime('%m', order_date) as month,
                SUM(total - delivery_fee) as revenue,
                COUNT(*) as order_count
         FROM orders
         WHERE strftime('%Y', order_date) = ? AND status != 'cancelled'
         GROUP BY strftime('%m', order_date)
         ORDER BY month`
      )
      .all(String(year))
  },

  getOrderTypeBreakdown(startDate: string, endDate: string) {
    return getDb()
      .prepare(
        `SELECT order_type, COUNT(*) as count, SUM(total - delivery_fee) as revenue,
                SUM(delivery_fee) as delivery_fees
         FROM orders
         WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
         GROUP BY order_type`
      )
      .all(startDate, endDate)
  }
}
