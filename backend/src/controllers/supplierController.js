import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

export const listSuppliers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (s.company_name ILIKE $${params.length} OR s.contact_person ILIKE $${params.length} OR s.phone ILIKE $${params.length})`; }

  const total = (await query(`SELECT COUNT(*) FROM suppliers s ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id=s.id) AS purchase_count,
            COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id=s.id AND p.status <> 'cancelled'), 0) AS total_purchased
     FROM suppliers s ${where} ORDER BY s.company_name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const createSupplier = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.company_name || !b.company_name.trim()) throw badRequest('Company name is required');
  const { rows } = await query(
    `INSERT INTO suppliers (company_name, contact_person, phone, email, address, tax_number, payment_terms, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.company_name.trim(), b.contact_person || null, b.phone || null, b.email || null, b.address || null,
     b.tax_number || null, b.payment_terms || null, b.notes || null]
  );
  await audit({ userId: req.user.id, action: 'supplier_create', entity: 'supplier', entityId: rows[0].id, description: `Created supplier "${b.company_name}"`, ip: req.ip });
  created(res, rows[0]);
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = (await query(`SELECT * FROM suppliers WHERE id=$1`, [id])).rows[0];
  if (!existing) throw notFound('Supplier not found');
  const { rows } = await query(
    `UPDATE suppliers SET company_name=COALESCE($1,company_name), contact_person=$2, phone=$3, email=$4, address=$5,
       tax_number=$6, payment_terms=$7, notes=$8, is_active=COALESCE($9,is_active), updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [b.company_name?.trim(), b.contact_person ?? existing.contact_person, b.phone ?? existing.phone,
     b.email ?? existing.email, b.address ?? existing.address, b.tax_number ?? existing.tax_number,
     b.payment_terms ?? existing.payment_terms, b.notes ?? existing.notes, b.is_active, id]
  );
  ok(res, rows[0]);
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const used = (await query(`SELECT 1 FROM purchases WHERE supplier_id=$1 LIMIT 1`, [id])).rows.length ||
               (await query(`SELECT 1 FROM products WHERE supplier_id=$1 LIMIT 1`, [id])).rows.length;
  if (used) throw conflict('This supplier has purchase or product history and cannot be deleted. Deactivate instead.');
  const { rowCount } = await query(`DELETE FROM suppliers WHERE id=$1`, [id]);
  if (!rowCount) throw notFound('Supplier not found');
  ok(res, { message: 'Supplier deleted' });
});

export const supplierHistory = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const supplier = (await query(`SELECT * FROM suppliers WHERE id=$1`, [id])).rows[0];
  if (!supplier) throw notFound('Supplier not found');
  const purchases = (await query(
    `SELECT p.id, p.purchase_number, p.total, p.amount_paid, p.status, p.created_at
     FROM purchases p WHERE p.supplier_id=$1 ORDER BY p.created_at DESC LIMIT 50`, [id]
  )).rows;
  const payments = (await query(
    `SELECT pay.* FROM payments pay
     WHERE pay.reference_type='supplier_payment' AND pay.reference_id=$1 ORDER BY pay.created_at DESC LIMIT 30`, [id]
  )).rows;
  ok(res, { supplier, purchases, payments });
});

export const paySupplier = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const amount = round2(Number(req.body?.amount));
  const method = req.body?.method || 'cash';
  if (!amount || amount <= 0) throw badRequest('Payment amount must be positive');

  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM suppliers WHERE id=$1 FOR UPDATE`, [id]);
    const supplier = rows[0];
    if (!supplier) throw notFound('Supplier not found');
    if (amount > Number(supplier.balance)) throw badRequest(`Payment exceeds outstanding balance (${supplier.balance})`);
    await client.query(`UPDATE suppliers SET balance = balance - $1, updated_at=NOW() WHERE id=$2`, [amount, id]);
    await client.query(
      `INSERT INTO payments (reference_type, reference_id, method, amount, user_id, notes)
       VALUES ('supplier_payment',$1,$2,$3,$4,$5)`,
      [id, method, amount, req.user.id, req.body?.notes || `Payment to ${supplier.company_name}`]
    );
    await audit({ userId: req.user.id, action: 'supplier_payment', entity: 'supplier', entityId: id, description: `Paid ${amount} to ${supplier.company_name}`, ip: req.ip }, client);
  });
  ok(res, { message: 'Payment recorded' });
});
