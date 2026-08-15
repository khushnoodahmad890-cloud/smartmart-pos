import { badRequest } from '../utils/errors.js';
import { notify } from './auditService.js';

/**
 * Atomically change stock for a product in a branch and record the movement.
 * Must be called inside a transaction (client).
 * quantityDelta may be negative. Throws if stock would go negative and allowNegative is false.
 */
export async function moveStock(client, {
  productId, branchId, quantityDelta, movementType, reference, reason, userId, allowNegative = false,
}) {
  // Lock the inventory row (create if missing)
  await client.query(
    `INSERT INTO inventory (product_id, branch_id, quantity) VALUES ($1,$2,0)
     ON CONFLICT (product_id, branch_id) DO NOTHING`,
    [productId, branchId]
  );
  const { rows } = await client.query(
    `SELECT quantity FROM inventory WHERE product_id=$1 AND branch_id=$2 FOR UPDATE`,
    [productId, branchId]
  );
  const previous = rows[0].quantity;
  const next = previous + quantityDelta;

  if (next < 0 && !allowNegative) {
    const { rows: p } = await client.query(`SELECT name FROM products WHERE id=$1`, [productId]);
    throw badRequest(`Insufficient stock for "${p[0]?.name || 'product'}". Available: ${previous}, requested: ${Math.abs(quantityDelta)}.`, 'INSUFFICIENT_STOCK');
  }

  await client.query(
    `UPDATE inventory SET quantity=$3 WHERE product_id=$1 AND branch_id=$2`,
    [productId, branchId, next]
  );
  await client.query(
    `INSERT INTO inventory_movements (product_id, branch_id, movement_type, quantity, previous_stock, new_stock, reference, reason, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [productId, branchId, movementType, quantityDelta, previous, next, reference || null, reason || null, userId || null]
  );

  // Low stock / out of stock notifications (only when crossing threshold downward)
  if (quantityDelta < 0) {
    const { rows: pr } = await client.query(`SELECT name, min_stock FROM products WHERE id=$1`, [productId]);
    const prod = pr[0];
    if (prod) {
      if (next <= 0 && previous > 0) {
        await notify({ type: 'out_of_stock', title: `Out of stock: ${prod.name}`, message: `${prod.name} is now out of stock.` }, client);
      } else if (next <= prod.min_stock && previous > prod.min_stock) {
        await notify({ type: 'low_stock', title: `Low stock: ${prod.name}`, message: `${prod.name} is low (${next} left, minimum ${prod.min_stock}).` }, client);
      }
    }
  }

  return { previous, next };
}

export async function getSetting(client, key, fallback = null) {
  const { rows } = await client.query(`SELECT value FROM settings WHERE key=$1`, [key]);
  return rows.length ? rows[0].value : fallback;
}
