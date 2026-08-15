import { query } from '../db/pool.js';
import { asyncHandler, ok, parsePagination } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';
import { checkLimit } from '../services/subscriptionService.js';

// ---------- Settings ----------
const SETTING_KEYS = [
  'business_name', 'business_logo', 'business_address', 'business_phone', 'business_email',
  'currency', 'currency_symbol', 'tax_rate', 'invoice_prefix', 'receipt_footer',
  'date_format', 'timezone', 'low_stock_threshold', 'allow_negative_stock',
  'barcode_type', 'receipt_width', 'tax_mode', 'loyalty_enabled', 'loyalty_earn_rate',
  'loyalty_redeem_value', 'daily_sales_target', 'audit_retention_days', 'kitchen_mode',
  'onboarding_done', 'receipt_show_logo', 'receipt_show_tax', 'weight_barcode_prefix', 'scan_sounds',
];

export const getSettings = asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT key, value FROM settings`);
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  ok(res, settings);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const entries = Object.entries(body).filter(([k]) => SETTING_KEYS.includes(k));
  if (!entries.length) throw badRequest('No valid settings provided');
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, value === null || value === undefined ? null : String(value)]
    );
  }
  await audit({ userId: req.user.id, action: 'settings_update', entity: 'settings', description: `Updated: ${entries.map(([k]) => k).join(', ')}`, ip: req.ip });
  const { rows } = await query(`SELECT key, value FROM settings`);
  ok(res, Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

// ---------- Audit logs ----------
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 30 });
  const params = [];
  let where = 'WHERE 1=1';
  if (req.query.action) { params.push(req.query.action); where += ` AND a.action=$${params.length}`; }
  if (req.query.user_id) { params.push(Number(req.query.user_id)); where += ` AND a.user_id=$${params.length}`; }
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (a.description ILIKE $${params.length} OR a.action ILIKE $${params.length})`; }

  const total = (await query(`SELECT COUNT(*) FROM audit_logs a ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
     ${where} ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

// ---------- Notifications ----------
export const listNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const { rows } = await query(
    `SELECT * FROM notifications ${unreadOnly ? 'WHERE is_read=FALSE' : ''} ORDER BY created_at DESC LIMIT 30`
  );
  const unread = (await query(`SELECT COUNT(*) FROM notifications WHERE is_read=FALSE`)).rows[0].count;
  ok(res, rows, { unread: Number(unread) });
});

export const markNotificationsRead = asyncHandler(async (req, res) => {
  const ids = req.body?.ids;
  if (Array.isArray(ids) && ids.length) {
    await query(`UPDATE notifications SET is_read=TRUE WHERE id = ANY($1::int[])`, [ids]);
  } else {
    await query(`UPDATE notifications SET is_read=TRUE WHERE is_read=FALSE`);
  }
  ok(res, { message: 'Notifications marked as read' });
});

// ---------- Branches ----------
export const listBranches = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT b.*,
            (SELECT COUNT(*) FROM users u WHERE u.branch_id=b.id) AS employee_count,
            COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.branch_id=b.id AND s.status <> 'cancelled' AND s.created_at >= date_trunc('month', NOW())), 0) AS month_sales
     FROM branches b ORDER BY b.id`
  );
  ok(res, rows);
});

export const createBranch = asyncHandler(async (req, res) => {
  const { name, code, address, phone } = req.body || {};
  if (!name || !code) throw badRequest('Branch name and code are required');
  const branchCount = (await query(`SELECT COUNT(*) FROM branches WHERE is_active=TRUE`)).rows[0].count;
  await checkLimit('max_branches', branchCount);
  const { rows } = await query(
    `INSERT INTO branches (name, code, address, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name.trim(), code.trim().toUpperCase(), address || null, phone || null]
  );
  await audit({ userId: req.user.id, action: 'branch_create', entity: 'branch', entityId: rows[0].id, description: `Created branch "${name}"`, ip: req.ip });
  ok(res, rows[0]);
});

export const updateBranch = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = (await query(`SELECT * FROM branches WHERE id=$1`, [id])).rows[0];
  if (!existing) throw notFound('Branch not found');
  const { rows } = await query(
    `UPDATE branches SET name=COALESCE($1,name), address=$2, phone=$3, is_active=COALESCE($4,is_active), updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [b.name?.trim(), b.address ?? existing.address, b.phone ?? existing.phone, b.is_active, id]
  );
  ok(res, rows[0]);
});

// ---------- Global search ----------
export const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return ok(res, { products: [], customers: [], suppliers: [], invoices: [] });
  const like = `%${q}%`;
  const [products, customers, suppliers, invoices] = await Promise.all([
    query(`SELECT id, name, sku, barcode, selling_price FROM products WHERE is_deleted=FALSE AND (name ILIKE $1 OR sku ILIKE $1 OR barcode ILIKE $1) LIMIT 6`, [like]),
    query(`SELECT id, name, phone, code FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 OR code ILIKE $1 LIMIT 5`, [like]),
    query(`SELECT id, company_name, phone FROM suppliers WHERE company_name ILIKE $1 OR phone ILIKE $1 LIMIT 5`, [like]),
    query(`SELECT id, invoice_number, total, status, created_at FROM sales WHERE invoice_number ILIKE $1 LIMIT 5`, [like]),
  ]);
  ok(res, {
    products: products.rows, customers: customers.rows,
    suppliers: suppliers.rows, invoices: invoices.rows,
  });
});
