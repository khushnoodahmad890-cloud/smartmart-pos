import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, parsePagination } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit, notify } from '../services/auditService.js';
import { moveStock } from '../services/inventoryService.js';

export const listInventory = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 25 });
  const branchId = Number(req.query.branch_id || req.user.branch_id || 1);
  const params = [branchId];
  let where = `WHERE p.is_deleted=FALSE`;
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`; }
  if (req.query.stock === 'low') where += ` AND COALESCE(i.quantity,0) > 0 AND COALESCE(i.quantity,0) <= p.min_stock`;
  if (req.query.stock === 'out') where += ` AND COALESCE(i.quantity,0) <= 0`;
  if (req.query.stock === 'ok') where += ` AND COALESCE(i.quantity,0) > p.min_stock`;

  const base = `FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.branch_id=$1`;
  const total = (await query(`SELECT COUNT(*) ${base} ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT p.id, p.name, p.sku, p.barcode, p.min_stock, p.max_stock, p.purchase_price, p.selling_price, p.is_active,
            COALESCE(i.quantity,0) AS stock,
            (COALESCE(i.quantity,0) * p.purchase_price) AS stock_value,
            CASE WHEN COALESCE(i.quantity,0) <= 0 THEN 'out'
                 WHEN COALESCE(i.quantity,0) <= p.min_stock THEN 'low'
                 ELSE 'ok' END AS stock_status
     ${base} ${where} ORDER BY p.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const inventorySummary = asyncHandler(async (req, res) => {
  const branchId = Number(req.query.branch_id || req.user.branch_id || 1);
  const { rows } = await query(
    `SELECT COUNT(*) AS total_products,
            COUNT(*) FILTER (WHERE COALESCE(i.quantity,0) <= 0) AS out_of_stock,
            COUNT(*) FILTER (WHERE COALESCE(i.quantity,0) > 0 AND COALESCE(i.quantity,0) <= p.min_stock) AS low_stock,
            COALESCE(SUM(COALESCE(i.quantity,0) * p.purchase_price), 0) AS total_value,
            COALESCE(SUM(COALESCE(i.quantity,0)), 0) AS total_units
     FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.branch_id=$1
     WHERE p.is_deleted=FALSE AND p.is_active=TRUE`,
    [branchId]
  );
  ok(res, rows[0]);
});

export const adjustStock = asyncHandler(async (req, res) => {
  const { product_id, type, quantity, reason } = req.body || {};
  const branchId = Number(req.body.branch_id || req.user.branch_id || 1);
  if (!product_id) throw badRequest('Product is required');
  const qty = Number(quantity);
  if (!qty || qty <= 0 || !Number.isInteger(qty)) throw badRequest('Quantity must be a positive whole number');
  if (!['add', 'remove', 'damage', 'adjustment_set'].includes(type)) throw badRequest('Invalid adjustment type');
  if (!reason || !reason.trim()) throw badRequest('A reason is required for every stock adjustment');

  const product = (await query(`SELECT id, name FROM products WHERE id=$1 AND is_deleted=FALSE`, [product_id])).rows[0];
  if (!product) throw notFound('Product not found');

  const result = await withTransaction(async (client) => {
    let delta = qty;
    let movementType = 'adjustment';
    if (type === 'remove') { delta = -qty; }
    else if (type === 'damage') { delta = -qty; movementType = 'damage'; }
    else if (type === 'adjustment_set') {
      const { rows } = await client.query(`SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id=$1 AND branch_id=$2`, [product_id, branchId]);
      const current = rows.length ? Number(rows[0].q) : 0;
      delta = qty - current;
      if (delta === 0) throw badRequest('Stock is already at that quantity');
    }
    const mv = await moveStock(client, {
      productId: product_id, branchId, quantityDelta: delta, movementType,
      reason: reason.trim(), userId: req.user.id,
    });
    await audit({
      userId: req.user.id, action: 'inventory_adjustment', entity: 'product', entityId: product_id,
      description: `${movementType === 'damage' ? 'Damaged stock' : 'Stock adjustment'} for "${product.name}": ${mv.previous} → ${mv.next} (${reason.trim()})`, ip: req.ip,
    }, client);
    await notify({ type: 'inventory_adjustment', title: `Stock adjusted: ${product.name}`, message: `${req.user.name} changed stock ${mv.previous} → ${mv.next}. Reason: ${reason.trim()}` }, client);
    return mv;
  });
  ok(res, { message: 'Stock updated', ...result });
});

export const transferStock = asyncHandler(async (req, res) => {
  const { product_id, from_branch_id, to_branch_id, quantity, reason } = req.body || {};
  const qty = Number(quantity);
  if (!product_id || !from_branch_id || !to_branch_id) throw badRequest('Product, source branch and destination branch are required');
  if (Number(from_branch_id) === Number(to_branch_id)) throw badRequest('Source and destination branches must be different');
  if (!qty || qty <= 0) throw badRequest('Quantity must be positive');

  const product = (await query(`SELECT name FROM products WHERE id=$1 AND is_deleted=FALSE`, [product_id])).rows[0];
  if (!product) throw notFound('Product not found');

  await withTransaction(async (client) => {
    await moveStock(client, { productId: product_id, branchId: from_branch_id, quantityDelta: -qty, movementType: 'transfer_out', reason, userId: req.user.id });
    await moveStock(client, { productId: product_id, branchId: to_branch_id, quantityDelta: qty, movementType: 'transfer_in', reason, userId: req.user.id });
    await audit({ userId: req.user.id, action: 'stock_transfer', entity: 'product', entityId: product_id, description: `Transferred ${qty} × "${product.name}" from branch ${from_branch_id} to branch ${to_branch_id}`, ip: req.ip }, client);
  });
  ok(res, { message: 'Stock transferred' });
});

export const listMovements = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 30 });
  const params = [];
  let where = 'WHERE 1=1';
  if (req.query.product_id) { params.push(Number(req.query.product_id)); where += ` AND m.product_id=$${params.length}`; }
  if (req.query.type) { params.push(req.query.type); where += ` AND m.movement_type=$${params.length}`; }
  if (req.query.branch_id) { params.push(Number(req.query.branch_id)); where += ` AND m.branch_id=$${params.length}`; }

  const total = (await query(`SELECT COUNT(*) FROM inventory_movements m ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT m.*, p.name AS product_name, p.sku, u.name AS user_name, b.name AS branch_name
     FROM inventory_movements m
     JOIN products p ON p.id=m.product_id
     LEFT JOIN users u ON u.id=m.user_id
     LEFT JOIN branches b ON b.id=m.branch_id
     ${where} ORDER BY m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});
