import { query } from '../db/pool.js';
import { asyncHandler, ok, dateRange } from '../utils/helpers.js';

function branchFilter(req, params, column = 's.branch_id') {
  if (req.query.branch_id && req.query.branch_id !== 'all') {
    params.push(Number(req.query.branch_id));
    return ` AND ${column}=$${params.length}`;
  }
  return '';
}

export const dashboard = asyncHandler(async (req, res) => {
  const { from, to } = dateRange(req);
  const params = [from, to];
  const bf = branchFilter(req, params);

  const salesAgg = (await query(
    `SELECT COUNT(*) AS sales_count,
            COALESCE(SUM(total),0) AS revenue,
            COALESCE(SUM(total - tax),0) AS net_revenue,
            COALESCE(SUM(total_cost),0) AS cogs,
            COALESCE(SUM(total - tax - total_cost),0) AS gross_profit,
            COALESCE(SUM(discount),0) AS discounts,
            COALESCE(SUM(tax),0) AS tax_collected
     FROM sales s WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}`, params
  )).rows[0];

  const refundParams = [from, to];
  const refundBf = branchFilter(req, refundParams, 'r.branch_id');
  const refunds = (await query(
    `SELECT COALESCE(SUM(r.refund_amount),0) AS refund_total, COUNT(*) AS refund_count
     FROM returns r WHERE r.created_at BETWEEN $1 AND $2 ${refundBf}`,
    refundParams
  )).rows[0];

  const expenseParams = [from, to];
  const expBf = branchFilter(req, expenseParams, 'e.branch_id');
  const expenses = (await query(
    `SELECT COALESCE(SUM(amount),0) AS expense_total FROM expenses e
     WHERE e.expense_date BETWEEN $1::date AND $2::date ${expBf}`, expenseParams
  )).rows[0];

  const purchaseParams = [from, to];
  const purBf = branchFilter(req, purchaseParams, 'p.branch_id');
  const purchases = (await query(
    `SELECT COUNT(*) AS purchase_count, COALESCE(SUM(total),0) AS purchase_total,
            COALESCE(SUM(total - amount_paid),0) AS pending_payments
     FROM purchases p WHERE p.created_at BETWEEN $1 AND $2 AND p.status <> 'cancelled' ${purBf}`, purchaseParams
  )).rows[0];

  const invBranch = req.query.branch_id && req.query.branch_id !== 'all' ? Number(req.query.branch_id) : null;
  const inventory = (await query(
    `SELECT COUNT(DISTINCT p.id) AS total_products,
            COUNT(DISTINCT p.id) FILTER (WHERE COALESCE(iq.q,0) <= 0) AS out_of_stock,
            COUNT(DISTINCT p.id) FILTER (WHERE COALESCE(iq.q,0) > 0 AND COALESCE(iq.q,0) <= p.min_stock) AS low_stock
     FROM products p
     LEFT JOIN LATERAL (
       SELECT SUM(quantity) AS q FROM inventory i WHERE i.product_id=p.id ${invBranch ? 'AND i.branch_id=$1' : ''}
     ) iq ON TRUE
     WHERE p.is_deleted=FALSE AND p.is_active=TRUE`, invBranch ? [invBranch] : []
  )).rows[0];

  const counts = (await query(
    `SELECT (SELECT COUNT(*) FROM customers WHERE is_active=TRUE) AS customers,
            (SELECT COUNT(*) FROM suppliers WHERE is_active=TRUE) AS suppliers`
  )).rows[0];

  const recentSales = (await query(
    `SELECT s.id, s.invoice_number, s.total, s.payment_method, s.status, s.created_at,
            c.name AS customer_name, u.name AS cashier_name
     FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.user_id
     ORDER BY s.created_at DESC LIMIT 8`
  )).rows;

  const bestSellers = (await query(
    `SELECT si.product_id, si.product_name, SUM(si.quantity) AS units_sold, SUM(si.line_total) AS revenue
     FROM sale_items si JOIN sales s ON s.id=si.sale_id
     WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY si.product_id, si.product_name ORDER BY units_sold DESC LIMIT 6`, params
  )).rows;

  const byPayment = (await query(
    `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total),0) AS amount
     FROM sales s WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY payment_method`, params
  )).rows;

  const byCategory = (await query(
    `SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(si.line_total) AS amount
     FROM sale_items si
     JOIN sales s ON s.id=si.sale_id
     JOIN products p ON p.id=si.product_id
     LEFT JOIN categories c ON c.id=p.category_id
     WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY c.name ORDER BY amount DESC LIMIT 8`, params
  )).rows;

  // Time series: bucket by day (or by month if range > 62 days)
  const days = (to - from) / 86400000;
  const bucket = days > 62 ? 'month' : days > 2 ? 'day' : 'hour';
  const series = (await query(
    `SELECT date_trunc('${bucket}', s.created_at) AS bucket,
            COALESCE(SUM(total),0) AS revenue,
            COALESCE(SUM(total - tax - total_cost),0) AS profit,
            COUNT(*) AS sales
     FROM sales s WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY 1 ORDER BY 1`, params
  )).rows;

  ok(res, {
    range: { from, to },
    sales: salesAgg, refunds, expenses, purchases, inventory, counts,
    recentSales, bestSellers, byPayment, byCategory, series, bucket,
    net_profit: Number(salesAgg.gross_profit) - Number(expenses.expense_total) - Number(refunds.refund_total),
  });
});

export const salesReport = asyncHandler(async (req, res) => {
  const { from, to } = dateRange(req);
  const params = [from, to];
  const bf = branchFilter(req, params);
  const days = (to - from) / 86400000;
  const bucket = days > 400 ? 'month' : days > 62 ? 'week' : 'day';

  const rows = (await query(
    `SELECT date_trunc('${bucket}', s.created_at) AS period,
            COUNT(*) AS transactions,
            COALESCE(SUM(subtotal),0) AS subtotal,
            COALESCE(SUM(discount),0) AS discounts,
            COALESCE(SUM(tax),0) AS tax,
            COALESCE(SUM(total),0) AS total,
            COALESCE(SUM(total_cost),0) AS cogs,
            COALESCE(SUM(total - tax - total_cost),0) AS gross_profit
     FROM sales s WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY 1 ORDER BY 1`, params
  )).rows;
  ok(res, { bucket, rows });
});

export const productReport = asyncHandler(async (req, res) => {
  const { from, to } = dateRange(req);
  const params = [from, to];
  const bf = branchFilter(req, params);

  const best = (await query(
    `SELECT si.product_id, si.product_name, si.sku, SUM(si.quantity) AS units, SUM(si.line_total) AS revenue,
            SUM(si.line_total - si.tax - si.unit_cost * si.quantity) AS profit
     FROM sale_items si JOIN sales s ON s.id=si.sale_id
     WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY si.product_id, si.product_name, si.sku ORDER BY units DESC LIMIT 15`, params
  )).rows;

  const worst = (await query(
    `SELECT p.id AS product_id, p.name AS product_name, p.sku, COALESCE(SUM(si.quantity),0) AS units
     FROM products p
     LEFT JOIN sale_items si ON si.product_id=p.id
     LEFT JOIN sales s ON s.id=si.sale_id AND s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled'
     WHERE p.is_deleted=FALSE AND p.is_active=TRUE
     GROUP BY p.id ORDER BY units ASC, p.name LIMIT 15`, [from, to]
  )).rows;

  const profitable = (await query(
    `SELECT si.product_id, si.product_name, si.sku,
            SUM(si.line_total - si.tax - si.unit_cost * si.quantity) AS profit, SUM(si.quantity) AS units
     FROM sale_items si JOIN sales s ON s.id=si.sale_id
     WHERE s.created_at BETWEEN $1 AND $2 AND s.status <> 'cancelled' ${bf}
     GROUP BY si.product_id, si.product_name, si.sku ORDER BY profit DESC LIMIT 15`, params
  )).rows;

  ok(res, { best, worst, profitable });
});

export const inventoryReport = asyncHandler(async (req, res) => {
  const invBranch = req.query.branch_id && req.query.branch_id !== 'all' ? Number(req.query.branch_id) : null;
  const params = invBranch ? [invBranch] : [];
  const rows = (await query(
    `SELECT p.id, p.name, p.sku, p.min_stock, p.purchase_price, p.selling_price,
            COALESCE(SUM(i.quantity),0) AS stock,
            COALESCE(SUM(i.quantity),0) * p.purchase_price AS stock_value,
            COALESCE(SUM(i.quantity),0) * p.selling_price AS retail_value
     FROM products p LEFT JOIN inventory i ON i.product_id=p.id ${invBranch ? 'AND i.branch_id=$1' : ''}
     WHERE p.is_deleted=FALSE
     GROUP BY p.id ORDER BY stock_value DESC`, params
  )).rows;

  const damaged = (await query(
    `SELECT m.created_at, p.name, ABS(m.quantity) AS quantity, m.reason, u.name AS user_name
     FROM inventory_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id
     WHERE m.movement_type='damage' ORDER BY m.created_at DESC LIMIT 30`
  )).rows;

  const totals = rows.reduce((acc, r) => ({
    stock_value: acc.stock_value + Number(r.stock_value),
    retail_value: acc.retail_value + Number(r.retail_value),
    units: acc.units + Number(r.stock),
  }), { stock_value: 0, retail_value: 0, units: 0 });

  ok(res, { rows, damaged, totals });
});

export const customerReport = asyncHandler(async (req, res) => {
  const { from, to } = dateRange(req);
  const top = (await query(
    `SELECT c.id, c.name, c.phone, COUNT(s.id) AS orders, COALESCE(SUM(s.total),0) AS spent
     FROM customers c JOIN sales s ON s.customer_id=c.id AND s.status <> 'cancelled'
       AND s.created_at BETWEEN $1 AND $2
     GROUP BY c.id ORDER BY spent DESC LIMIT 15`, [from, to]
  )).rows;
  const balances = (await query(
    `SELECT id, name, phone, outstanding_balance FROM customers
     WHERE outstanding_balance > 0 ORDER BY outstanding_balance DESC LIMIT 20`
  )).rows;
  ok(res, { top, balances });
});

export const supplierReport = asyncHandler(async (req, res) => {
  const { from, to } = dateRange(req);
  const purchases = (await query(
    `SELECT sup.id, sup.company_name, COUNT(p.id) AS orders, COALESCE(SUM(p.total),0) AS purchased,
            COALESCE(SUM(p.total - p.amount_paid),0) AS owed
     FROM suppliers sup LEFT JOIN purchases p ON p.supplier_id=sup.id AND p.status <> 'cancelled'
       AND p.created_at BETWEEN $1 AND $2
     GROUP BY sup.id ORDER BY purchased DESC LIMIT 20`, [from, to]
  )).rows;
  const balances = (await query(
    `SELECT id, company_name, balance FROM suppliers WHERE balance > 0 ORDER BY balance DESC`
  )).rows;
  ok(res, { purchases, balances });
});

export const financialReport = asyncHandler(async (req, res) => {
  const { from, to } = dateRange(req);
  const params = [from, to];
  const bf = branchFilter(req, params);

  const sales = (await query(
    `SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(tax),0) AS tax,
            COALESCE(SUM(total_cost),0) AS cogs, COALESCE(SUM(discount),0) AS discounts,
            COUNT(*) AS transactions
     FROM sales s WHERE created_at BETWEEN $1 AND $2 AND status <> 'cancelled' ${bf}`, params
  )).rows[0];

  const refunds = (await query(
    `SELECT COALESCE(SUM(refund_amount),0) AS total FROM returns WHERE created_at BETWEEN $1 AND $2`, [from, to]
  )).rows[0];

  const expenses = (await query(
    `SELECT category, COALESCE(SUM(amount),0) AS amount FROM expenses
     WHERE expense_date BETWEEN $1::date AND $2::date GROUP BY category ORDER BY amount DESC`, [from, to]
  )).rows;
  const expenseTotal = expenses.reduce((a, e) => a + Number(e.amount), 0);

  const revenue = Number(sales.revenue) - Number(refunds.total);
  const netRevenue = revenue - Number(sales.tax);
  const cogs = Number(sales.cogs);
  const grossProfit = netRevenue - cogs;
  const netProfit = grossProfit - expenseTotal;

  ok(res, {
    range: { from, to },
    revenue, tax_collected: Number(sales.tax), refunds: Number(refunds.total),
    discounts: Number(sales.discounts), transactions: Number(sales.transactions),
    cogs, gross_profit: grossProfit,
    expenses, expense_total: expenseTotal,
    net_profit: netProfit,
    profit_margin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
  });
});
