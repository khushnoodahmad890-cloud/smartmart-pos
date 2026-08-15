import { query } from '../db/pool.js';
import { asyncHandler, ok, round2 } from '../utils/helpers.js';

/** KPI deltas + 7-day sparklines for premium dashboard cards. */
export const kpiTrends = asyncHandler(async (_req, res) => {
  const today = (await query(
    `SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sales,
            COALESCE(SUM(total - tax - total_cost),0) AS profit
     FROM sales WHERE status <> 'cancelled' AND created_at >= date_trunc('day', NOW())`
  )).rows[0];
  const yesterday = (await query(
    `SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sales,
            COALESCE(SUM(total - tax - total_cost),0) AS profit
     FROM sales WHERE status <> 'cancelled'
       AND created_at >= date_trunc('day', NOW()) - INTERVAL '1 day'
       AND created_at < date_trunc('day', NOW())`
  )).rows[0];
  const spark = (await query(
    `SELECT date_trunc('day', created_at) AS d,
            COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sales,
            COALESCE(SUM(total - tax - total_cost),0) AS profit
     FROM sales WHERE status <> 'cancelled' AND created_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
     GROUP BY 1 ORDER BY 1`
  )).rows;

  const delta = (t, y) => (Number(y) > 0 ? round2(((Number(t) - Number(y)) / Number(y)) * 100) : null);
  ok(res, {
    today, yesterday,
    deltas: {
      revenue: delta(today.revenue, yesterday.revenue),
      sales: delta(today.sales, yesterday.sales),
      profit: delta(today.profit, yesterday.profit),
    },
    sparkline: spark.map((r) => ({ d: r.d, revenue: Number(r.revenue), profit: Number(r.profit), sales: Number(r.sales) })),
  });
});

/** Reorder suggestions from 30-day sales velocity vs current stock. */
export const reorderSuggestions = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `WITH velocity AS (
       SELECT si.product_id, SUM(si.quantity)::numeric / 30 AS per_day
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.status <> 'cancelled' AND s.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY si.product_id
     )
     SELECT p.id, p.name, p.sku, p.min_stock, p.max_stock, p.purchase_price,
            COALESCE(SUM(i.quantity),0) AS stock,
            ROUND(v.per_day, 2) AS units_per_day,
            CASE WHEN v.per_day > 0 THEN FLOOR(COALESCE(SUM(i.quantity),0) / v.per_day) ELSE NULL END AS days_left,
            sup.company_name AS supplier_name, sup.id AS supplier_id
     FROM products p
     JOIN velocity v ON v.product_id = p.id
     LEFT JOIN inventory i ON i.product_id = p.id
     LEFT JOIN suppliers sup ON sup.id = p.supplier_id
     WHERE p.is_deleted = FALSE AND p.is_active = TRUE AND v.per_day > 0
     GROUP BY p.id, v.per_day, sup.company_name, sup.id
     HAVING COALESCE(SUM(i.quantity),0) / v.per_day < 14
     ORDER BY days_left ASC NULLS LAST
     LIMIT 20`
  );
  const suggestions = rows.map((r) => {
    const target = Math.max(r.max_stock ?? 0, Math.ceil(Number(r.units_per_day) * 21)); // 3 weeks of cover
    const suggested = Math.max(0, target - Number(r.stock));
    return { ...r, suggested_order: suggested, estimated_cost: round2(suggested * Number(r.purchase_price)) };
  }).filter((r) => r.suggested_order > 0);
  ok(res, suggestions);
});

/** Dead stock: sellable products with stock but no sales in 60 days. */
export const deadStock = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.sku, p.purchase_price,
            COALESCE(SUM(i.quantity),0) AS stock,
            COALESCE(SUM(i.quantity),0) * p.purchase_price AS tied_capital,
            MAX(s.created_at) AS last_sold
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id AND s.status <> 'cancelled'
     WHERE p.is_deleted = FALSE AND p.is_active = TRUE
     GROUP BY p.id
     HAVING COALESCE(SUM(i.quantity),0) > 0
        AND (MAX(s.created_at) IS NULL OR MAX(s.created_at) < NOW() - INTERVAL '60 days')
     ORDER BY tied_capital DESC LIMIT 20`
  );
  const total = rows.reduce((a, r) => a + Number(r.tied_capital), 0);
  ok(res, { rows, tied_capital_total: round2(total) });
});

/** Hourly × weekday sales heatmap over the last 30 days. */
export const salesHeatmap = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT EXTRACT(DOW FROM created_at)::int AS dow,
            EXTRACT(HOUR FROM created_at)::int AS hour,
            COUNT(*) AS sales, COALESCE(SUM(total),0) AS revenue
     FROM sales WHERE status <> 'cancelled' AND created_at >= NOW() - INTERVAL '30 days'
     GROUP BY 1, 2 ORDER BY 1, 2`
  );
  ok(res, rows.map((r) => ({ dow: r.dow, hour: r.hour, sales: Number(r.sales), revenue: Number(r.revenue) })));
});

/** Anomaly flags: unusual refunds, discounts and cash variance. */
export const anomalies = asyncHandler(async (_req, res) => {
  const flags = [];

  const refunds = (await query(
    `SELECT COALESCE(SUM(refund_amount),0) AS today,
            (SELECT COALESCE(AVG(day_total),0) FROM (
               SELECT SUM(refund_amount) AS day_total FROM returns
               WHERE created_at >= NOW() - INTERVAL '30 days' AND created_at < date_trunc('day', NOW())
               GROUP BY date_trunc('day', created_at)) t) AS avg_day
     FROM returns WHERE created_at >= date_trunc('day', NOW())`
  )).rows[0];
  if (Number(refunds.avg_day) > 0 && Number(refunds.today) > Number(refunds.avg_day) * 2.5) {
    flags.push({ level: 'warning', title: 'Unusual refund activity', detail: `Refunds today (${round2(refunds.today)}) are ${round2(Number(refunds.today) / Number(refunds.avg_day))}× the 30-day daily average.` });
  }

  const discounts = (await query(
    `SELECT u.name, COALESCE(SUM(s.discount),0) AS given, COUNT(*) AS sales
     FROM sales s JOIN users u ON u.id = s.user_id
     WHERE s.status <> 'cancelled' AND s.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY u.id, u.name HAVING COUNT(*) >= 5`
  )).rows;
  if (discounts.length > 1) {
    const rates = discounts.map((d) => ({ name: d.name, rate: Number(d.given) / Number(d.sales) }));
    const avg = rates.reduce((a, r) => a + r.rate, 0) / rates.length;
    for (const r of rates) {
      if (avg > 0 && r.rate > avg * 2 && r.rate > 5) {
        flags.push({ level: 'info', title: 'High discounting pattern', detail: `${r.name} averages ${round2(r.rate)} discount per sale — over 2× the team average this week.` });
      }
    }
  }

  const shortShifts = (await query(
    `SELECT u.name, s.over_short, s.closed_at FROM shifts s JOIN users u ON u.id = s.user_id
     WHERE s.status = 'closed' AND s.closed_at >= NOW() - INTERVAL '7 days' AND ABS(s.over_short) >= 500
     ORDER BY s.closed_at DESC LIMIT 5`
  )).rows;
  for (const s of shortShifts) {
    flags.push({ level: Number(s.over_short) < 0 ? 'warning' : 'info', title: `Cash drawer ${Number(s.over_short) < 0 ? 'short' : 'over'}`, detail: `${s.name}'s shift closed ${Number(s.over_short) < 0 ? 'short' : 'over'} by ${Math.abs(Number(s.over_short))}.` });
  }

  ok(res, flags);
});

/** End-of-day digest: everything an owner wants in one glance. */
export const dailyDigest = asyncHandler(async (req, res) => {
  const date = req.query.date || null;
  const dayStart = date ? `'${String(date).replace(/'/g, '')}'::date` : `date_trunc('day', NOW())`;

  const sales = (await query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue,
            COALESCE(SUM(total - tax - total_cost),0) AS gross_profit,
            COALESCE(SUM(discount),0) AS discounts
     FROM sales WHERE status <> 'cancelled' AND created_at >= ${dayStart} AND created_at < ${dayStart} + INTERVAL '1 day'`
  )).rows[0];
  const best = (await query(
    `SELECT si.product_name, SUM(si.quantity) AS units FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.status <> 'cancelled' AND s.created_at >= ${dayStart} AND s.created_at < ${dayStart} + INTERVAL '1 day'
     GROUP BY si.product_name ORDER BY units DESC LIMIT 3`
  )).rows;
  const refunds = (await query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(refund_amount),0) AS total FROM returns
     WHERE created_at >= ${dayStart} AND created_at < ${dayStart} + INTERVAL '1 day'`
  )).rows[0];
  const expenses = (await query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date = ${dayStart}::date`
  )).rows[0];
  const shifts = (await query(
    `SELECT u.name, s.over_short FROM shifts s JOIN users u ON u.id = s.user_id
     WHERE s.status='closed' AND s.closed_at >= ${dayStart} AND s.closed_at < ${dayStart} + INTERVAL '1 day'`
  )).rows;
  const lowStock = (await query(
    `SELECT COUNT(*) FROM products p LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.is_deleted = FALSE AND p.is_active = TRUE
     GROUP BY p.id, p.min_stock HAVING COALESCE(SUM(i.quantity),0) <= p.min_stock`
  )).rows.length;
  const byCashier = (await query(
    `SELECT u.name, COUNT(*) AS sales, COALESCE(SUM(s.total),0) AS revenue
     FROM sales s JOIN users u ON u.id = s.user_id
     WHERE s.status <> 'cancelled' AND s.created_at >= ${dayStart} AND s.created_at < ${dayStart} + INTERVAL '1 day'
     GROUP BY u.name ORDER BY revenue DESC`
  )).rows;

  ok(res, {
    sales, best, refunds, expenses: Number(expenses.total), shifts, low_stock_count: lowStock, by_cashier: byCashier,
    net: round2(Number(sales.gross_profit) - Number(expenses.total) - Number(refunds.total)),
  });
});
