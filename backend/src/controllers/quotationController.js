import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';
import { nextNumber } from '../services/numberService.js';

// ---------- Held (parked) sales ----------
export const listHeld = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT h.*, u.name AS user_name FROM held_sales h JOIN users u ON u.id=h.user_id
     WHERE h.branch_id=$1 ORDER BY h.created_at DESC LIMIT 30`, [req.user.branch_id || 1]
  );
  ok(res, rows);
});

export const holdSale = asyncHandler(async (req, res) => {
  const { label, cart, customer_id, customer_name } = req.body || {};
  if (!Array.isArray(cart) || !cart.length) throw badRequest('Cannot hold an empty cart');
  const { rows } = await query(
    `INSERT INTO held_sales (branch_id, user_id, label, customer_id, customer_name, cart)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.branch_id || 1, req.user.id, (label || `Hold ${new Date().toLocaleTimeString()}`).slice(0, 120),
     customer_id || null, customer_name || null, JSON.stringify(cart)]
  );
  created(res, rows[0]);
});

export const deleteHeld = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM held_sales WHERE id=$1`, [Number(req.params.id)]);
  if (!rowCount) throw notFound('Held sale not found');
  ok(res, { message: 'Removed' });
});

// ---------- Quotations ----------
export const listQuotations = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (q.quote_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`; }
  if (req.query.status) { params.push(req.query.status); where += ` AND q.status=$${params.length}`; }

  const base = `FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id`;
  const total = (await query(`SELECT COUNT(*) ${base} ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT q.*, c.name AS customer_name, u.name AS created_by
     ${base} JOIN users u ON u.id=q.user_id
     ${where} ORDER BY q.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const createQuotation = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Add at least one product');

  const result = await withTransaction(async (client) => {
    let subtotal = 0, tax = 0;
    const items = [];
    for (const it of b.items) {
      const { rows } = await client.query(
        `SELECT id, name, sku, selling_price, discount_price, tax_rate FROM products WHERE id=$1 AND is_deleted=FALSE`, [it.product_id]
      );
      const p = rows[0];
      if (!p) throw notFound(`Product #${it.product_id} not found`);
      const qty = Number(it.quantity) || 1;
      const price = it.unit_price !== undefined ? round2(Number(it.unit_price)) : round2(Number(p.discount_price ?? p.selling_price));
      const gross = round2(price * qty);
      subtotal = round2(subtotal + gross);
      tax = round2(tax + gross * Number(p.tax_rate) / 100);
      items.push({ product_id: p.id, product_name: p.name, sku: p.sku, quantity: qty, unit_price: price, tax_rate: Number(p.tax_rate), line_total: gross });
    }
    const discount = round2(Number(b.discount || 0));
    const total = round2(subtotal - discount + tax);
    const quoteNumber = await nextNumber(client, 'quotation', 'QUO');

    const { rows } = await client.query(
      `INSERT INTO quotations (quote_number, branch_id, customer_id, user_id, items, subtotal, discount, tax, total, valid_until, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [quoteNumber, req.user.branch_id || 1, b.customer_id || null, req.user.id, JSON.stringify(items),
       subtotal, discount, tax, total, b.valid_until || null, b.notes || null]
    );
    await audit({ userId: req.user.id, action: 'quotation_create', entity: 'quotation', entityId: rows[0].id, description: `Quotation ${quoteNumber} — ${total}`, ip: req.ip }, client);
    return rows[0];
  });
  created(res, result);
});

export const updateQuotationStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['cancelled', 'expired'].includes(status)) throw badRequest('Status must be cancelled or expired');
  const { rows } = await query(
    `UPDATE quotations SET status=$1 WHERE id=$2 AND status='open' RETURNING *`, [status, id]
  );
  if (!rows.length) throw badRequest('Only open quotations can be updated');
  ok(res, rows[0]);
});

/** Returns the quotation cart payload so the POS can load it; marks nothing (conversion happens when the sale completes). */
export const getQuotation = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT q.*, c.name AS customer_name FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=$1`,
    [Number(req.params.id)]
  );
  if (!rows.length) throw notFound('Quotation not found');
  ok(res, rows[0]);
});

export const markQuotationConverted = async (client, quotationId, saleId) => {
  await client.query(`UPDATE quotations SET status='converted', converted_sale_id=$1 WHERE id=$2 AND status='open'`, [saleId, quotationId]);
};
