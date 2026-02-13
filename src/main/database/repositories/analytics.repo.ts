import { getDb } from '../connection'

export const analyticsRepo = {
  getProfitSummary(startDate: string, endDate: string) {
    const revenue = getDb()
      .prepare(
        `SELECT COALESCE(SUM(total), 0) as total_revenue,
                COUNT(*) as order_count
         FROM orders
         WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'`
      )
      .get(startDate, endDate) as { total_revenue: number; order_count: number }

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
                SUM(total) as revenue,
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
        `SELECT mi.name, mi.name_ar, mi.name_fr,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                c.name as category_name
         FROM order_items oi
         JOIN menu_items mi ON oi.menu_item_id = mi.id
         JOIN categories c ON mi.category_id = c.id
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
        `SELECT mi.name, mi.name_ar, mi.name_fr,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                c.name as category_name
         FROM order_items oi
         JOIN menu_items mi ON oi.menu_item_id = mi.id
         JOIN categories c ON mi.category_id = c.id
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
        `SELECT c.name, c.name_ar, c.name_fr,
                SUM(oi.total_price) as total_revenue,
                SUM(oi.quantity) as total_quantity
         FROM order_items oi
         JOIN menu_items mi ON oi.menu_item_id = mi.id
         JOIN categories c ON mi.category_id = c.id
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
                SUM(oi.total_price) as total_revenue,
                (SELECT COALESCE(SUM(pay_amount), 0) FROM worker_attendance
                 WHERE worker_id = w.id AND date BETWEEN ? AND ?) as total_pay
         FROM workers w
         LEFT JOIN order_items oi ON w.id = oi.worker_id
         LEFT JOIN orders o ON oi.order_id = o.id AND o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'
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
                SUM(total) as revenue,
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
        `SELECT order_type, COUNT(*) as count, SUM(total) as revenue
         FROM orders
         WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
         GROUP BY order_type`
      )
      .all(startDate, endDate)
  }
}
