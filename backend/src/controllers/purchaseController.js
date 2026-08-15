import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit, notify } from '../services/auditService.js';
import { moveStock } from '../services/inventoryService.js';
import { nextNumber } from '../services/numberService.js';

/** Weighted-average cost update: newAvg = (oldQty*oldAvg + inQty*inCost) / (oldQty + inQty) */
async function applyWeightedCost(client, productId, incomingQty, incomingCost) {
  const { rows } = await client.query(
    `SELECT p.avg_cost, COALESCE(SUM(i.quantity),0) AS qty
     FROM products p LEFT JOIN inventory i ON i.product_id=p.id
     WHERE p.id=$1 GROUP BY p.id`, [productId]
  );
  const { avg_cost, qty } = rows[0];
  const oldQty = Math.max(0, Number(qty) - incomingQty); // stock BEFORE this receipt (moveStock already ran)
  const oldAvg = Number(avg_cost) || incomingCost;
  const newAvg = oldQty + incomingQty > 0
    ? ((oldQty * oldAvg) + (incomingQty * incomingCost)) / (oldQty + incomingQty)
    : incomingCost;
  await client.query(
    `UPDATE products SET avg_cost=$1, purchase_price=$2, updated_at=NOW() WHERE id=$3`,
    [round2(newAvg * 100) / 100, incomingCost, productId]
  );
}

async function receiveItems(client, purchase, itemsToReceive, userId) {
  for (const { item, qty, batch_no, expiry_date } of itemsToReceive) {
    await moveStock(client, {
      productId: item.product_id, branchId: purchase.branch_id, quantityDelta: qty,
      movementType: 'purchase', reference: purchase.purchase_number, userId,
    });
    await applyWeightedCost(client, item.product_id, qty, Number(item.unit_cost));
    await client.query(`UPDATE purchase_items SET received_quantity = received_quantity + $1 WHERE id=$2`, [qty, item.id]);

    if (batch_no || expiry_date) {
      await client.query(
        `INSERT INTO product_batches (product_id, branch_id, batch_no, expiry_date, quantity) VALUES ($1,$2,$3,$4,$5)`,
        [item.product_id, purchase.branch_id, batch_no || null, expiry_date || null, qty]
      );
      await client.query(`UPDATE products SET track_expiry=TRUE WHERE id=$1 AND track_expiry=FALSE AND $2::date IS NOT NULL`,
        [item.product_id, expiry_date || null]);
    }
  }
  // Status: received when everything is in, partially_received otherwise
  const { rows } = await client.query(
    `SELECT SUM(quantity - received_quantity) AS remaining FROM purchase_items WHERE purchase_id=$1`, [purchase.id]
  );
  const remaining = Number(rows[0].remaining);
  const newStatus = remaining <= 0 ? 'received' : 'partially_received';
  await client.query(
    `UPDATE purchases SET status=$1::varchar, received_at=CASE WHEN $1::varchar='received' THEN NOW() ELSE received_at END WHERE id=$2`,
    [newStatus, purchase.id]
  );
  return newStatus;
}

export const createPurchase = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.supplier_id) throw badRequest('Supplier is required');
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Add at least one product to the purchase');
  const branchId = Number(b.branch_id || req.user.branch_id || 1);

  const purchase = await withTransaction(async (client) => {
    const supplier = (await client.query(`SELECT * FROM suppliers WHERE id=$1 FOR UPDATE`, [b.supplier_id])).rows[0];
    if (!supplier) throw notFound('Supplier not found');

    let subtotal = 0;
    const lines = [];
    for (const item of b.items) {
      const qty = Number(item.quantity);
      const cost = round2(Number(item.unit_cost));
      if (!item.product_id || !Number.isInteger(qty) || qty <= 0) throw badRequest('Each line needs a product and positive quantity');
      if (Number.isNaN(cost) || cost < 0) throw badRequest('Unit cost must be zero or positive');
      const { rows } = await client.query(`SELECT id, name FROM products WHERE id=$1 AND is_deleted=FALSE`, [item.product_id]);
      if (!rows.length) throw notFound(`Product #${item.product_id} not found`);
      const lineTotal = round2(cost * qty);
      subtotal = round2(subtotal + lineTotal);
      lines.push({ product: rows[0], qty, cost, lineTotal, batch_no: item.batch_no, expiry_date: item.expiry_date });
    }
    const total = subtotal;
    const amountPaid = round2(Number(b.amount_paid || 0));
    if (amountPaid < 0 || amountPaid > total) throw badRequest('Paid amount must be between 0 and the purchase total');

    const purchaseNumber = await nextNumber(client, 'purchase', 'PUR');
    const receiveNow = b.receive_now !== false;

    const { rows: pRows } = await client.query(
      `INSERT INTO purchases (purchase_number, branch_id, supplier_id, user_id, subtotal, total, amount_paid, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ordered',$8) RETURNING *`,
      [purchaseNumber, branchId, b.supplier_id, req.user.id, subtotal, total, amountPaid, b.notes || null]
    );
    const purchase = pRows[0];

    const inserted = [];
    for (const l of lines) {
      const { rows } = await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [purchase.id, l.product.id, l.product.name, l.qty, l.cost, l.lineTotal]
      );
      inserted.push({ item: rows[0], qty: l.qty, batch_no: l.batch_no, expiry_date: l.expiry_date });
    }
    if (receiveNow) await receiveItems(client, purchase, inserted, req.user.id);

    const outstanding = round2(total - amountPaid);
    if (outstanding > 0) {
      await client.query(`UPDATE suppliers SET balance = balance + $1, updated_at=NOW() WHERE id=$2`, [outstanding, b.supplier_id]);
    }
    if (amountPaid > 0) {
      await client.query(
        `INSERT INTO payments (reference_type, reference_id, method, amount, user_id) VALUES ('purchase',$1,$2,$3,$4)`,
        [purchase.id, b.payment_method || 'cash', amountPaid, req.user.id]
      );
    }

    await audit({ userId: req.user.id, action: 'purchase_create', entity: 'purchase', entityId: purchase.id, description: `Purchase ${purchaseNumber} from ${supplier.company_name} — total ${total}`, ip: req.ip }, client);
    await notify({ type: 'new_purchase', title: `New purchase ${purchaseNumber}`, message: `${req.user.name} recorded a purchase of ${total} from ${supplier.company_name}` }, client);
    return purchase;
  });
  created(res, purchase);
});

/**
 * Receive a purchase — fully (no body.items) or partially (body.items = [{purchase_item_id, quantity, batch_no?, expiry_date?}]).
 */
export const receivePurchase = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const partial = Array.isArray(req.body?.items) && req.body.items.length > 0;

  const status = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM purchases WHERE id=$1 FOR UPDATE`, [id]);
    const purchase = rows[0];
    if (!purchase) throw notFound('Purchase not found');
    if (!['ordered', 'partially_received'].includes(purchase.status)) {
      throw badRequest(`This purchase is already ${purchase.status}`);
    }

    const { rows: items } = await client.query(`SELECT * FROM purchase_items WHERE purchase_id=$1 FOR UPDATE`, [id]);
    const byId = new Map(items.map((i) => [i.id, i]));
    let toReceive;
    if (partial) {
      toReceive = req.body.items.map((r) => {
        const item = byId.get(Number(r.purchase_item_id));
        if (!item) throw badRequest('Invalid purchase item');
        const qty = Number(r.quantity);
        const remaining = item.quantity - item.received_quantity;
        if (!Number.isInteger(qty) || qty <= 0) throw badRequest('Receive quantity must be a positive whole number');
        if (qty > remaining) throw badRequest(`Only ${remaining} unit(s) of "${item.product_name}" remain to be received`);
        return { item, qty, batch_no: r.batch_no, expiry_date: r.expiry_date };
      }).filter((r) => r.qty > 0);
      if (!toReceive.length) throw badRequest('Nothing to receive');
    } else {
      toReceive = items
        .filter((i) => i.quantity - i.received_quantity > 0)
        .map((i) => ({ item: i, qty: i.quantity - i.received_quantity }));
      if (!toReceive.length) throw badRequest('All items already received');
    }

    const newStatus = await receiveItems(client, purchase, toReceive, req.user.id);
    await audit({
      userId: req.user.id, action: 'purchase_receive', entity: 'purchase', entityId: id,
      description: `${partial ? 'Partially received' : 'Received'} ${purchase.purchase_number} (${toReceive.reduce((s, r) => s + r.qty, 0)} units)`, ip: req.ip,
    }, client);
    return newStatus;
  });
  ok(res, { message: status === 'received' ? 'Purchase fully received' : 'Items received — purchase is partially received', status });
});

export const payPurchase = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const amount = round2(Number(req.body?.amount));
  if (!amount || amount <= 0) throw badRequest('Payment amount must be positive');

  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM purchases WHERE id=$1 FOR UPDATE`, [id]);
    const purchase = rows[0];
    if (!purchase) throw notFound('Purchase not found');
    const remaining = round2(Number(purchase.total) - Number(purchase.amount_paid));
    if (amount > remaining) throw badRequest(`Payment exceeds remaining balance (${remaining})`);

    await client.query(`UPDATE purchases SET amount_paid = amount_paid + $1 WHERE id=$2`, [amount, id]);
    await client.query(`UPDATE suppliers SET balance = balance - $1, updated_at=NOW() WHERE id=$2`, [amount, purchase.supplier_id]);
    await client.query(
      `INSERT INTO payments (reference_type, reference_id, method, amount, user_id) VALUES ('purchase',$1,$2,$3,$4)`,
      [id, req.body?.method || 'cash', amount, req.user.id]
    );
    await audit({ userId: req.user.id, action: 'purchase_payment', entity: 'purchase', entityId: id, description: `Paid ${amount} on ${purchase.purchase_number}`, ip: req.ip }, client);
  });
  ok(res, { message: 'Payment recorded' });
});

/** Return received goods to the supplier: decreases stock, reduces supplier balance (or creates a claim). */
export const createPurchaseReturn = asyncHandler(async (req, res) => {
  const { purchase_id, items, reason } = req.body || {};
  if (!purchase_id) throw badRequest('Purchase is required');
  if (!Array.isArray(items) || !items.length) throw badRequest('Select at least one item to return');
  if (!reason || !reason.trim()) throw badRequest('A reason is required');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM purchases WHERE id=$1 FOR UPDATE`, [purchase_id]);
    const purchase = rows[0];
    if (!purchase) throw notFound('Purchase not found');

    const { rows: pItems } = await client.query(`SELECT * FROM purchase_items WHERE purchase_id=$1 FOR UPDATE`, [purchase_id]);
    const byId = new Map(pItems.map((i) => [i.id, i]));

    // total already returned per item
    const { rows: prevReturns } = await client.query(
      `SELECT pri.purchase_item_id, COALESCE(SUM(pri.quantity),0) AS returned
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id=pri.purchase_return_id
       WHERE pr.purchase_id=$1 GROUP BY pri.purchase_item_id`, [purchase_id]
    );
    const returnedMap = new Map(prevReturns.map((r) => [r.purchase_item_id, Number(r.returned)]));

    let total = 0;
    const lines = [];
    for (const r of items) {
      const item = byId.get(Number(r.purchase_item_id));
      if (!item) throw badRequest('Invalid purchase item');
      const qty = Number(r.quantity);
      const alreadyReturned = returnedMap.get(item.id) || 0;
      const returnable = item.received_quantity - alreadyReturned;
      if (!Number.isInteger(qty) || qty <= 0) throw badRequest('Return quantity must be positive');
      if (qty > returnable) throw badRequest(`Only ${returnable} received unit(s) of "${item.product_name}" can be returned`);
      const lineTotal = round2(qty * Number(item.unit_cost));
      total = round2(total + lineTotal);
      lines.push({ item, qty, lineTotal });
    }

    const returnNumber = await nextNumber(client, 'purchase_return', 'PRET');
    const { rows: prRows } = await client.query(
      `INSERT INTO purchase_returns (return_number, purchase_id, supplier_id, branch_id, user_id, total, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [returnNumber, purchase_id, purchase.supplier_id, purchase.branch_id, req.user.id, total, reason.trim()]
    );

    for (const l of lines) {
      await client.query(
        `INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, product_id, quantity, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [prRows[0].id, l.item.id, l.item.product_id, l.qty, l.item.unit_cost, l.lineTotal]
      );
      await moveStock(client, {
        productId: l.item.product_id, branchId: purchase.branch_id, quantityDelta: -l.qty,
        movementType: 'purchase_return', reference: returnNumber, reason: reason.trim(), userId: req.user.id,
      });
    }

    // Reduce what we owe the supplier (floor at 0 — beyond that it's a supplier credit note situation)
    await client.query(`UPDATE suppliers SET balance = GREATEST(0, balance - $1), updated_at=NOW() WHERE id=$2`, [total, purchase.supplier_id]);
    await audit({ userId: req.user.id, action: 'purchase_return', entity: 'purchase_return', entityId: prRows[0].id, description: `Purchase return ${returnNumber} against ${purchase.purchase_number} — ${total}`, ip: req.ip }, client);
    return prRows[0];
  });
  created(res, result);
});

export const listPurchaseReturns = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const total = (await query(`SELECT COUNT(*) FROM purchase_returns`)).rows[0].count;
  const { rows } = await query(
    `SELECT pr.*, p.purchase_number, s.company_name AS supplier_name, u.name AS user_name,
            (SELECT json_agg(json_build_object('product_name', pd.name, 'quantity', pri.quantity, 'line_total', pri.line_total))
             FROM purchase_return_items pri JOIN products pd ON pd.id=pri.product_id WHERE pri.purchase_return_id=pr.id) AS items
     FROM purchase_returns pr
     JOIN purchases p ON p.id=pr.purchase_id
     JOIN suppliers s ON s.id=pr.supplier_id
     JOIN users u ON u.id=pr.user_id
     ORDER BY pr.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const listPurchases = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (p.purchase_number ILIKE $${params.length} OR s.company_name ILIKE $${params.length})`; }
  if (req.query.status) { params.push(req.query.status); where += ` AND p.status=$${params.length}`; }
  if (req.query.supplier_id) { params.push(Number(req.query.supplier_id)); where += ` AND p.supplier_id=$${params.length}`; }

  const base = `FROM purchases p JOIN suppliers s ON s.id=p.supplier_id`;
  const total = (await query(`SELECT COUNT(*) ${base} ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT p.*, s.company_name AS supplier_name, u.name AS created_by,
            (p.total - p.amount_paid) AS balance_due,
            (SELECT json_agg(row_to_json(pi) ORDER BY pi.id) FROM purchase_items pi WHERE pi.purchase_id=p.id) AS items
     ${base} JOIN users u ON u.id=p.user_id
     ${where} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

/** Expiring batches report (for pharmacies/groceries). */
export const expiringBatches = asyncHandler(async (req, res) => {
  const days = Math.min(365, Number(req.query.days || 30));
  const { rows } = await query(
    `SELECT b.*, p.name AS product_name, p.sku, br.name AS branch_name
     FROM product_batches b
     JOIN products p ON p.id=b.product_id
     JOIN branches br ON br.id=b.branch_id
     WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= CURRENT_DATE + $1::int
     ORDER BY b.expiry_date`, [days]
  );
  ok(res, rows);
});
