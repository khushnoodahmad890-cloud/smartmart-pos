import { query } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination } from '../utils/helpers.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.code ILIKE $${params.length})`; }

  const total = (await query(`SELECT COUNT(*) FROM customers c ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT c.*,
            COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id=c.id AND s.status <> 'cancelled'), 0) AS total_purchases,
            (SELECT COUNT(*) FROM sales s WHERE s.customer_id=c.id AND s.status <> 'cancelled') AS purchase_count,
            (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id=c.id) AS last_purchase
     FROM customers c ${where} ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.name.trim()) throw badRequest('Customer name is required');
  const { rows: countRows } = await query(
    `INSERT INTO counters (name, value) VALUES ('customer', 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value`
  );
  const code = `CUST-${String(countRows[0].value).padStart(5, '0')}`;
  const tier = ['retail', 'wholesale'].includes(b.price_tier) ? b.price_tier : 'retail';
  const { rows } = await query(
    `INSERT INTO customers (code, name, phone, email, address, notes, price_tier) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [code, b.name.trim(), b.phone || null, b.email || null, b.address || null, b.notes || null, tier]
  );
  await audit({ userId: req.user.id, action: 'customer_create', entity: 'customer', entityId: rows[0].id, description: `Created customer "${b.name}"`, ip: req.ip });
  created(res, rows[0]);
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = (await query(`SELECT * FROM customers WHERE id=$1`, [id])).rows[0];
  if (!existing) throw notFound('Customer not found');
  const tier = ['retail', 'wholesale'].includes(b.price_tier) ? b.price_tier : existing.price_tier;
  const { rows } = await query(
    `UPDATE customers SET name=COALESCE($1,name), phone=$2, email=$3, address=$4, notes=$5,
       is_active=COALESCE($6,is_active), price_tier=$8, updated_at=NOW() WHERE id=$7 RETURNING *`,
    [b.name?.trim(), b.phone ?? existing.phone, b.email ?? existing.email, b.address ?? existing.address,
     b.notes ?? existing.notes, b.is_active, id, tier]
  );
  ok(res, rows[0]);
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const hasSales = (await query(`SELECT 1 FROM sales WHERE customer_id=$1 LIMIT 1`, [id])).rows.length;
  if (hasSales) throw conflict('This customer has purchase history and cannot be deleted. Deactivate instead.');
  const { rowCount } = await query(`DELETE FROM customers WHERE id=$1`, [id]);
  if (!rowCount) throw notFound('Customer not found');
  await audit({ userId: req.user.id, action: 'customer_delete', entity: 'customer', entityId: id, description: `Deleted customer #${id}`, ip: req.ip });
  ok(res, { message: 'Customer deleted' });
});

export const customerHistory = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const customer = (await query(`SELECT * FROM customers WHERE id=$1`, [id])).rows[0];
  if (!customer) throw notFound('Customer not found');
  const sales = (await query(
    `SELECT s.id, s.invoice_number, s.total, s.payment_method, s.status, s.created_at, u.name AS cashier_name
     FROM sales s JOIN users u ON u.id=s.user_id WHERE s.customer_id=$1 ORDER BY s.created_at DESC LIMIT 50`, [id]
  )).rows;
  const returns = (await query(
    `SELECT r.return_number, r.refund_amount, r.reason, r.created_at, s.invoice_number
     FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=$1 ORDER BY r.created_at DESC LIMIT 20`, [id]
  )).rows;
  ok(res, { customer, sales, returns });
});
