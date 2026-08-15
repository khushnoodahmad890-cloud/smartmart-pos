import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';
import { audit, notify } from '../services/auditService.js';
import { moveStock, getSetting } from '../services/inventoryService.js';
import { nextNumber } from '../services/numberService.js';
import { broadcast } from '../services/eventService.js';
import { markQuotationConverted } from './quotationController.js';
import { hasFeature } from '../services/subscriptionService.js';
import { fireWebhooks } from './platformController.js';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'mobile', 'credit', 'points'];

/**
 * Create a completed sale in ONE transaction.
 * Supports:
 *  - split payments: body.payments = [{method, amount}, ...] (or legacy payment_method/amount_paid)
 *  - credit sales: unpaid remainder goes to customer outstanding_balance (requires a customer)
 *  - loyalty: earn points on total; redeem via a 'points' payment line
 *  - price tiers: wholesale customers get wholesale_price when set
 *  - tax modes: exclusive (added) or inclusive (extracted from price)
 *  - weighted-average COGS via products.avg_cost
 *  - kitchen orders: order_type='kitchen' marks the sale for the kitchen display
 */
export const createSale = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const items = b.items;
  if (!Array.isArray(items) || !items.length) throw badRequest('Cart is empty');
  const branchId = Number(b.branch_id || req.user.branch_id || 1);
  const orderDiscount = round2(Number(b.discount || 0));
  if (orderDiscount < 0) throw badRequest('Discount cannot be negative');

  // Normalize payments: accept legacy single-method or new split array
  let payments = Array.isArray(b.payments) && b.payments.length
    ? b.payments.map((p) => ({ method: p.method, amount: round2(Number(p.amount)) }))
    : [{ method: b.payment_method || 'cash', amount: round2(Number(b.amount_paid ?? NaN)) }];
  for (const p of payments) {
    if (!PAYMENT_METHODS.includes(p.method)) throw badRequest(`Invalid payment method: ${p.method}`);
    if (Number.isNaN(p.amount) || p.amount < 0) throw badRequest('Payment amounts must be zero or positive');
  }

  // Subscription gates: loyalty and price tiers are Pro features
  const [loyaltyAllowed, tiersAllowed, kitchenAllowed] = await Promise.all([
    hasFeature('loyalty'), hasFeature('price_tiers'), hasFeature('kitchen'),
  ]);

  const sale = await withTransaction(async (client) => {
    const allowNegative = (await getSetting(client, 'allow_negative_stock', 'false')) === 'true';
    const taxMode = await getSetting(client, 'tax_mode', 'exclusive');
    const loyaltyEnabled = loyaltyAllowed && (await getSetting(client, 'loyalty_enabled', 'true')) === 'true';
    const earnRate = Number(await getSetting(client, 'loyalty_earn_rate', '1'));       // pts per 100 spent
    const redeemValue = Number(await getSetting(client, 'loyalty_redeem_value', '1')); // currency per pt

    // Customer (locked if loyalty/credit involved)
    let customer = null;
    if (b.customer_id) {
      const { rows } = await client.query(`SELECT * FROM customers WHERE id=$1 FOR UPDATE`, [b.customer_id]);
      customer = rows[0];
      if (!customer) throw notFound('Customer not found');
    }

    let subtotal = 0, totalTax = 0, itemDiscounts = 0, totalCost = 0;
    const lines = [];
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!item.product_id || !Number.isInteger(qty) || qty <= 0) throw badRequest('Each cart line needs a product and a positive quantity');
      const { rows } = await client.query(
        `SELECT id, name, sku, selling_price, discount_price, wholesale_price, purchase_price, avg_cost, tax_rate, is_active, is_deleted
         FROM products WHERE id=$1`, [item.product_id]
      );
      const p = rows[0];
      if (!p || p.is_deleted) throw notFound(`Product #${item.product_id} not found`);
      if (!p.is_active) throw badRequest(`"${p.name}" is inactive and cannot be sold`);

      // Price tier: wholesale customers get wholesale price when available (Pro plan)
      let defaultPrice = Number(p.discount_price ?? p.selling_price);
      if (tiersAllowed && customer?.price_tier === 'wholesale' && p.wholesale_price != null) defaultPrice = Number(p.wholesale_price);
      const unitPrice = item.unit_price !== undefined ? round2(Number(item.unit_price)) : round2(defaultPrice);
      if (unitPrice < 0) throw badRequest('Unit price cannot be negative');

      const lineDiscount = round2(Number(item.discount || 0));
      if (lineDiscount < 0) throw badRequest('Line discount cannot be negative');
      const gross = round2(unitPrice * qty);
      if (lineDiscount > gross) throw badRequest(`Discount on "${p.name}" exceeds the line amount`);
      const net = round2(gross - lineDiscount);

      // Tax: exclusive adds on top; inclusive extracts from the net price
      const rate = Number(p.tax_rate) / 100;
      let lineTax, lineTotal;
      if (taxMode === 'inclusive' && rate > 0) {
        lineTax = round2(net - net / (1 + rate));
        lineTotal = net; // tax already inside
      } else {
        lineTax = round2(net * rate);
        lineTotal = round2(net + lineTax);
      }

      const unitCost = round2(Number(p.avg_cost) || Number(p.purchase_price));
      subtotal = round2(subtotal + gross);
      itemDiscounts = round2(itemDiscounts + lineDiscount);
      totalTax = round2(totalTax + lineTax);
      totalCost = round2(totalCost + unitCost * qty);
      lines.push({ p, qty, unitPrice, lineDiscount, lineTax, lineTotal, unitCost });
    }

    const discount = round2(itemDiscounts + orderDiscount);
    const total = taxMode === 'inclusive'
      ? round2(subtotal - discount)
      : round2(subtotal - discount + totalTax);
    if (total < 0) throw badRequest('Total cannot be negative — check discounts');

    // ---- Payments: points redemption, credit, tender validation ----
    let pointsRedeemed = 0;
    for (const p of payments) {
      if (p.method === 'points') {
        if (!loyaltyAllowed) throw badRequest('The loyalty program requires the Pro plan. Upgrade in Billing to enable it.');
        if (!loyaltyEnabled) throw badRequest('Loyalty is disabled');
        if (!customer) throw badRequest('Select a customer to redeem points');
        pointsRedeemed = Math.ceil(p.amount / redeemValue);
        if (pointsRedeemed > customer.loyalty_points) {
          throw badRequest(`Customer only has ${customer.loyalty_points} points (worth ${round2(customer.loyalty_points * redeemValue)})`);
        }
      }
      if (p.method === 'credit' && !customer) throw badRequest('Credit sales require a registered customer');
    }

    const nonCredit = payments.filter((p) => p.method !== 'credit');
    const creditLines = payments.filter((p) => p.method === 'credit');
    const tendered = round2(nonCredit.reduce((s, p) => s + p.amount, 0));
    const creditAmount = round2(creditLines.reduce((s, p) => s + p.amount, 0));

    // If a single cash payment exceeds the remainder, the excess is change
    let change = 0;
    const dueAfterTender = round2(total - tendered - creditAmount);
    if (dueAfterTender > 0.009) {
      throw badRequest(`Payments (${round2(tendered + creditAmount)}) do not cover the total (${total}). Short by ${dueAfterTender}. Add a payment or use credit.`);
    }
    if (dueAfterTender < 0) {
      const cashPaid = nonCredit.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
      change = round2(-dueAfterTender);
      if (change > cashPaid + 0.009) throw badRequest('Overpayment can only be returned as change on cash payments');
    }
    const dueAmount = creditAmount; // what the customer owes

    // Loyalty earning: on the amount actually paid (not on credit or points)
    let pointsEarned = 0;
    if (loyaltyEnabled && customer && earnRate > 0) {
      const paidValue = round2(total - creditAmount - (pointsRedeemed * redeemValue));
      pointsEarned = Math.floor((paidValue / 100) * earnRate);
    }

    const invoiceNumber = await nextNumber(client, 'invoice', 'INV');

    // Attach to the cashier's open shift if any
    const { rows: shiftRows } = await client.query(
      `SELECT id FROM shifts WHERE user_id=$1 AND status='open' LIMIT 1`, [req.user.id]
    );
    const shiftId = shiftRows[0]?.id || null;

    const orderType = kitchenAllowed && b.order_type === 'kitchen' ? 'kitchen' : 'counter';
    const primaryMethod = payments.length > 1 ? 'split' : payments[0].method;

    const { rows: saleRows } = await client.query(
      `INSERT INTO sales (invoice_number, branch_id, customer_id, user_id, subtotal, discount, tax, total, total_cost,
         payment_method, amount_paid, change_due, due_amount, points_earned, points_redeemed, shift_id, order_type,
         kitchen_status, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'completed',$19) RETURNING *`,
      [invoiceNumber, branchId, b.customer_id || null, req.user.id, subtotal, discount, totalTax, total, totalCost,
       primaryMethod, round2(tendered), change, dueAmount, pointsEarned, pointsRedeemed, shiftId, orderType,
       orderType === 'kitchen' ? 'pending' : null, b.notes || null]
    );
    const sale = saleRows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, sku, quantity, unit_price, unit_cost, discount, tax, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [sale.id, l.p.id, l.p.name, l.p.sku, l.qty, l.unitPrice, l.unitCost, l.lineDiscount, l.lineTax, l.lineTotal]
      );
      await moveStock(client, {
        productId: l.p.id, branchId, quantityDelta: -l.qty, movementType: 'sale',
        reference: invoiceNumber, userId: req.user.id, allowNegative,
      });
      // FEFO batch depletion for expiry-tracked products
      let remaining = l.qty;
      const { rows: batches } = await client.query(
        `SELECT id, quantity FROM product_batches WHERE product_id=$1 AND branch_id=$2 AND quantity > 0
         ORDER BY expiry_date NULLS LAST, id FOR UPDATE`, [l.p.id, branchId]
      );
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        await client.query(`UPDATE product_batches SET quantity = quantity - $1 WHERE id=$2`, [take, batch.id]);
        remaining -= take;
      }
    }

    // Record each payment line (change deducted from the cash line)
    let changeLeft = change;
    for (const p of payments) {
      let amount = p.amount;
      if (p.method === 'cash' && changeLeft > 0) {
        const deduct = Math.min(changeLeft, amount);
        amount = round2(amount - deduct);
        changeLeft = round2(changeLeft - deduct);
      }
      if (p.method === 'credit' || amount <= 0) continue;
      await client.query(
        `INSERT INTO payments (reference_type, reference_id, method, amount, user_id) VALUES ('sale',$1,$2,$3,$4)`,
        [sale.id, p.method, amount, req.user.id]
      );
    }

    // Customer effects: credit balance & loyalty
    if (customer) {
      await client.query(
        `UPDATE customers SET outstanding_balance = outstanding_balance + $1,
           loyalty_points = loyalty_points - $2 + $3, updated_at=NOW() WHERE id=$4`,
        [creditAmount, pointsRedeemed, pointsEarned, customer.id]
      );
      if (creditAmount > 0) {
        await notify({ type: 'credit_sale', title: `Credit sale ${invoiceNumber}`, message: `${customer.name} owes ${creditAmount} on ${invoiceNumber}.` }, client);
      }
    }

    if (b.quotation_id) await markQuotationConverted(client, Number(b.quotation_id), sale.id);

    await audit({ userId: req.user.id, action: 'sale_create', entity: 'sale', entityId: sale.id, description: `Sale ${invoiceNumber} — total ${total}${creditAmount > 0 ? ` (credit ${creditAmount})` : ''}`, ip: req.ip }, client);
    return sale;
  });

  const full = await getSaleById(sale.id);
  broadcast('sale', { invoice_number: full.invoice_number, total: full.total, cashier: full.cashier_name, order_type: full.order_type });
  if (full.order_type === 'kitchen') broadcast('kitchen', { action: 'new', sale: full });
  fireWebhooks('sale.created', { invoice_number: full.invoice_number, total: full.total, items: full.items?.length, customer: full.customer_name, cashier: full.cashier_name, created_at: full.created_at });
  created(res, full);
});

async function getSaleById(id) {
  const { rows } = await query(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
            u.name AS cashier_name, b.name AS branch_name,
            (SELECT json_agg(row_to_json(si) ORDER BY si.id) FROM sale_items si WHERE si.sale_id=s.id) AS items,
            (SELECT json_agg(json_build_object('method', p.method, 'amount', p.amount) ORDER BY p.id)
               FROM payments p WHERE p.reference_type='sale' AND p.reference_id=s.id AND p.amount > 0) AS payment_lines
     FROM sales s
     LEFT JOIN customers c ON c.id=s.customer_id
     JOIN users u ON u.id=s.user_id
     JOIN branches b ON b.id=s.branch_id
     WHERE s.id=$1`, [id]
  );
  return rows[0];
}

export const listSales = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';

  const isPrivileged = req.user.role_name === 'super_admin' || (req.user.permissions || []).includes('view_reports');
  if (!isPrivileged) { params.push(req.user.id); where += ` AND s.user_id=$${params.length}`; }

  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (s.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`; }
  if (req.query.status) { params.push(req.query.status); where += ` AND s.status=$${params.length}`; }
  if (req.query.payment_method) { params.push(req.query.payment_method); where += ` AND s.payment_method=$${params.length}`; }
  if (req.query.branch_id) { params.push(Number(req.query.branch_id)); where += ` AND s.branch_id=$${params.length}`; }
  if (req.query.customer_id) { params.push(Number(req.query.customer_id)); where += ` AND s.customer_id=$${params.length}`; }
  if (req.query.unpaid === 'true') where += ` AND s.due_amount > 0`;
  if (req.query.from) { params.push(req.query.from); where += ` AND s.created_at >= $${params.length}::date`; }
  if (req.query.to) { params.push(req.query.to); where += ` AND s.created_at < ($${params.length}::date + INTERVAL '1 day')`; }

  const base = `FROM sales s LEFT JOIN customers c ON c.id=s.customer_id`;
  const total = (await query(`SELECT COUNT(*) ${base} ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT s.id, s.invoice_number, s.total, s.subtotal, s.discount, s.tax, s.payment_method, s.status, s.created_at,
            s.amount_paid, s.change_due, s.due_amount, c.name AS customer_name, u.name AS cashier_name
     ${base} JOIN users u ON u.id=s.user_id
     ${where} ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await getSaleById(Number(req.params.id));
  if (!sale) throw notFound('Invoice not found');
  const isPrivileged = req.user.role_name === 'super_admin' || (req.user.permissions || []).includes('view_reports');
  if (!isPrivileged && sale.user_id !== req.user.id) throw forbidden('You can only view your own transactions');
  ok(res, sale);
});

export const cancelSale = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM sales WHERE id=$1 FOR UPDATE`, [id]);
    const sale = rows[0];
    if (!sale) throw notFound('Invoice not found');
    if (sale.status !== 'completed') throw badRequest(`Only completed sales can be cancelled (current status: ${sale.status})`);

    const { rows: items } = await client.query(`SELECT * FROM sale_items WHERE sale_id=$1`, [id]);
    for (const it of items) {
      const remaining = it.quantity - it.returned_quantity;
      if (remaining > 0) {
        await moveStock(client, {
          productId: it.product_id, branchId: sale.branch_id, quantityDelta: remaining,
          movementType: 'return_in', reference: sale.invoice_number, reason: 'Sale cancelled', userId: req.user.id,
        });
      }
    }
    await client.query(`UPDATE sales SET status='cancelled' WHERE id=$1`, [id]);

    // Reverse customer credit & loyalty effects
    if (sale.customer_id) {
      await client.query(
        `UPDATE customers SET outstanding_balance = GREATEST(0, outstanding_balance - $1),
           loyalty_points = GREATEST(0, loyalty_points - $2 + $3), updated_at=NOW() WHERE id=$4`,
        [sale.due_amount, sale.points_earned, sale.points_redeemed, sale.customer_id]
      );
    }
    const refundable = round2(Number(sale.total) - Number(sale.due_amount));
    if (refundable > 0) {
      await client.query(
        `INSERT INTO payments (reference_type, reference_id, method, amount, user_id, notes)
         VALUES ('refund',$1,$2,$3,$4,'Sale cancellation')`,
        [id, sale.payment_method === 'split' ? 'cash' : sale.payment_method, -refundable, req.user.id]
      );
    }
    await audit({ userId: req.user.id, action: 'sale_cancel', entity: 'sale', entityId: id, description: `Cancelled invoice ${sale.invoice_number} (${sale.total})`, ip: req.ip }, client);
    await notify({ type: 'sale_cancelled', title: `Invoice ${sale.invoice_number} cancelled`, message: `Cancelled by ${req.user.name}. Amount: ${sale.total}` }, client);
  });
  ok(res, { message: 'Sale cancelled and inventory restored' });
});

/** Record a payment against a credit sale's due amount. */
export const paySaleDue = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const amount = round2(Number(req.body?.amount));
  const method = req.body?.method || 'cash';
  if (!amount || amount <= 0) throw badRequest('Payment amount must be positive');

  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM sales WHERE id=$1 FOR UPDATE`, [id]);
    const sale = rows[0];
    if (!sale) throw notFound('Invoice not found');
    if (Number(sale.due_amount) <= 0) throw badRequest('This invoice has no outstanding balance');
    if (amount > Number(sale.due_amount)) throw badRequest(`Payment exceeds the due amount (${sale.due_amount})`);

    await client.query(`UPDATE sales SET due_amount = due_amount - $1, amount_paid = amount_paid + $1 WHERE id=$2`, [amount, id]);
    if (sale.customer_id) {
      await client.query(`UPDATE customers SET outstanding_balance = GREATEST(0, outstanding_balance - $1), updated_at=NOW() WHERE id=$2`, [amount, sale.customer_id]);
    }
    await client.query(
      `INSERT INTO payments (reference_type, reference_id, method, amount, user_id, notes)
       VALUES ('sale',$1,$2,$3,$4,'Credit payment')`,
      [id, method, amount, req.user.id]
    );
    await audit({ userId: req.user.id, action: 'credit_payment', entity: 'sale', entityId: id, description: `Received ${amount} against ${sale.invoice_number}`, ip: req.ip }, client);
  });
  ok(res, { message: 'Payment recorded' });
});

// ---------- Kitchen display ----------
export const kitchenOrders = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.invoice_number, s.kitchen_status, s.created_at, s.notes, u.name AS cashier_name,
            (SELECT json_agg(json_build_object('name', si.product_name, 'quantity', si.quantity)) FROM sale_items si WHERE si.sale_id=s.id) AS items
     FROM sales s JOIN users u ON u.id=s.user_id
     WHERE s.order_type='kitchen' AND s.kitchen_status IN ('pending','preparing') AND s.status='completed'
     ORDER BY s.created_at`, []
  );
  ok(res, rows);
});

export const updateKitchenStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['preparing', 'ready', 'served'].includes(status)) throw badRequest('Invalid kitchen status');
  const { rows } = await query(
    `UPDATE sales SET kitchen_status=$1 WHERE id=$2 AND order_type='kitchen' RETURNING id, invoice_number, kitchen_status`,
    [status, Number(req.params.id)]
  );
  if (!rows.length) throw notFound('Kitchen order not found');
  broadcast('kitchen', { action: 'update', id: rows[0].id, status });
  ok(res, rows[0]);
});
