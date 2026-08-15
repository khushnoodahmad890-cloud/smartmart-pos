import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit, notify } from '../services/auditService.js';
import { moveStock } from '../services/inventoryService.js';
import { nextNumber } from '../services/numberService.js';

export const createReturn = asyncHandler(async (req, res) => {
  const { sale_id, items, reason, refund_method } = req.body || {};
  if (!sale_id) throw badRequest('Invoice is required');
  if (!Array.isArray(items) || !items.length) throw badRequest('Select at least one product to return');
  if (!reason || !reason.trim()) throw badRequest('A return reason is required');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM sales WHERE id=$1 FOR UPDATE`, [sale_id]);
    const sale = rows[0];
    if (!sale) throw notFound('Invoice not found');
    if (sale.status === 'cancelled') throw badRequest('This invoice was cancelled — nothing to return');
    if (sale.status === 'returned') throw badRequest('This invoice has already been fully returned');

    const { rows: saleItems } = await client.query(`SELECT * FROM sale_items WHERE sale_id=$1 FOR UPDATE`, [sale_id]);
    const byId = new Map(saleItems.map((si) => [si.id, si]));

    let refundTotal = 0;
    const lines = [];
    for (const item of items) {
      const si = byId.get(Number(item.sale_item_id));
      if (!si) throw badRequest('Invalid item selected for return');
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) throw badRequest('Return quantity must be a positive whole number');
      const returnable = si.quantity - si.returned_quantity;
      if (qty > returnable) throw badRequest(`Only ${returnable} unit(s) of "${si.product_name}" can still be returned`);

      // Refund proportional to what was actually paid for the line (incl. line discount + tax)
      const perUnit = round2(Number(si.line_total) / si.quantity);
      const lineRefund = round2(perUnit * qty);
      refundTotal = round2(refundTotal + lineRefund);
      lines.push({ si, qty, perUnit, lineRefund });
    }

    const returnNumber = await nextNumber(client, 'return', 'RET');
    const { rows: retRows } = await client.query(
      `INSERT INTO returns (return_number, sale_id, branch_id, user_id, refund_amount, refund_method, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [returnNumber, sale_id, sale.branch_id, req.user.id, refundTotal, refund_method || 'cash', reason.trim()]
    );
    const ret = retRows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, unit_price, line_refund)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ret.id, l.si.id, l.si.product_id, l.qty, l.perUnit, l.lineRefund]
      );
      await client.query(`UPDATE sale_items SET returned_quantity = returned_quantity + $1 WHERE id=$2`, [l.qty, l.si.id]);
      await moveStock(client, {
        productId: l.si.product_id, branchId: sale.branch_id, quantityDelta: l.qty,
        movementType: 'return_in', reference: returnNumber, reason: reason.trim(), userId: req.user.id,
      });
    }

    const { rows: remaining } = await client.query(
      `SELECT SUM(quantity - returned_quantity) AS left FROM sale_items WHERE sale_id=$1`, [sale_id]
    );
    const newStatus = Number(remaining[0].left) === 0 ? 'returned' : 'partially_returned';
    await client.query(`UPDATE sales SET status=$1 WHERE id=$2`, [newStatus, sale_id]);

    await client.query(
      `INSERT INTO payments (reference_type, reference_id, method, amount, user_id, notes)
       VALUES ('refund',$1,$2,$3,$4,$5)`,
      [ret.id, refund_method || 'cash', -refundTotal, req.user.id, `Refund for ${sale.invoice_number}`]
    );

    await audit({ userId: req.user.id, action: 'refund', entity: 'return', entityId: ret.id, description: `Return ${returnNumber} for ${sale.invoice_number} — refund ${refundTotal}`, ip: req.ip }, client);
    if (refundTotal >= 100) {
      await notify({ type: 'large_refund', title: `Large refund: ${refundTotal}`, message: `${req.user.name} processed return ${returnNumber} against ${sale.invoice_number}.` }, client);
    }
    return { ...ret, invoice_number: sale.invoice_number };
  });
  created(res, result);
});

export const listReturns = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (r.return_number ILIKE $${params.length} OR s.invoice_number ILIKE $${params.length})`; }
  if (req.query.from) { params.push(req.query.from); where += ` AND r.created_at >= $${params.length}::date`; }
  if (req.query.to) { params.push(req.query.to); where += ` AND r.created_at < ($${params.length}::date + INTERVAL '1 day')`; }

  const base = `FROM returns r JOIN sales s ON s.id=r.sale_id`;
  const total = (await query(`SELECT COUNT(*) ${base} ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT r.*, s.invoice_number, u.name AS user_name,
            (SELECT json_agg(json_build_object('product_id', ri.product_id, 'quantity', ri.quantity, 'line_refund', ri.line_refund,
              'product_name', p.name)) FROM return_items ri JOIN products p ON p.id=ri.product_id WHERE ri.return_id=r.id) AS items
     ${base} JOIN users u ON u.id=r.user_id
     ${where} ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

/** Find an invoice by number for the return screen */
export const findInvoiceForReturn = asyncHandler(async (req, res) => {
  const number = (req.query.invoice || '').trim();
  if (!number) throw badRequest('Invoice number is required');
  const { rows } = await query(
    `SELECT s.*, c.name AS customer_name, u.name AS cashier_name,
            (SELECT json_agg(row_to_json(si) ORDER BY si.id) FROM sale_items si WHERE si.sale_id=s.id) AS items
     FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.user_id
     WHERE LOWER(s.invoice_number)=LOWER($1)`, [number]
  );
  if (!rows.length) throw notFound(`No invoice found with number "${number}"`);
  ok(res, rows[0]);
});
