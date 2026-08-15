import { query } from '../db/pool.js';
import { asyncHandler, ok, created, round2 } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

const TYPES = ['percent_product', 'percent_category', 'bogo'];

export const listPromotions = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT pr.*, p.name AS product_name, c.name AS category_name
     FROM promotions pr
     LEFT JOIN products p ON p.id = pr.product_id
     LEFT JOIN categories c ON c.id = pr.category_id
     ORDER BY pr.is_active DESC, pr.created_at DESC`
  );
  ok(res, rows);
});

export const createPromotion = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) throw badRequest('Promotion name is required');
  if (!TYPES.includes(b.type)) throw badRequest('Invalid promotion type');
  if (b.type === 'percent_product' && !b.product_id) throw badRequest('Select a product');
  if (b.type === 'percent_category' && !b.category_id) throw badRequest('Select a category');
  if (b.type.startsWith('percent')) {
    const pct = Number(b.percent);
    if (!pct || pct <= 0 || pct > 100) throw badRequest('Percent must be between 1 and 100');
  }
  if (b.type === 'bogo') {
    if (!b.product_id) throw badRequest('BOGO promotions need a product');
    if (!Number(b.buy_qty) || !Number(b.free_qty)) throw badRequest('Enter buy and free quantities');
  }
  const { rows } = await query(
    `INSERT INTO promotions (name, type, product_id, category_id, percent, buy_qty, free_qty, starts_on, ends_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.name.trim(), b.type, b.product_id || null, b.category_id || null,
     b.percent ? Number(b.percent) : null, b.buy_qty ? Number(b.buy_qty) : null,
     b.free_qty ? Number(b.free_qty) : null, b.starts_on || null, b.ends_on || null]
  );
  await audit({ userId: req.user.id, action: 'promotion_create', entity: 'promotion', entityId: rows[0].id, description: `Created promotion "${b.name}"`, ip: req.ip });
  created(res, rows[0]);
});

export const updatePromotion = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = (await query(`SELECT * FROM promotions WHERE id=$1`, [id])).rows[0];
  if (!existing) throw notFound('Promotion not found');
  const { rows } = await query(
    `UPDATE promotions SET name=COALESCE($1,name), is_active=COALESCE($2,is_active),
       starts_on=$3, ends_on=$4 WHERE id=$5 RETURNING *`,
    [b.name?.trim(), b.is_active, b.starts_on ?? existing.starts_on, b.ends_on ?? existing.ends_on, id]
  );
  ok(res, rows[0]);
});

export const deletePromotion = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM promotions WHERE id=$1`, [Number(req.params.id)]);
  if (!rowCount) throw notFound('Promotion not found');
  await audit({ userId: req.user.id, action: 'promotion_delete', entity: 'promotion', entityId: req.params.id, description: `Deleted promotion #${req.params.id}`, ip: req.ip });
  ok(res, { message: 'Promotion deleted' });
});

/**
 * Evaluate active promotions against a cart.
 * Returns per-line discounts: [{ product_id, discount, promo_name }].
 * The POS applies these as line discounts, which flow through the normal validated sale path.
 */
export const evaluateCart = asyncHandler(async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || !items.length) return ok(res, []);

  const { rows: promos } = await query(
    `SELECT * FROM promotions
     WHERE is_active = TRUE
       AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
       AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`
  );
  if (!promos.length) return ok(res, []);

  const ids = items.map((i) => Number(i.product_id)).filter(Boolean);
  const { rows: products } = await query(
    `SELECT id, category_id, selling_price, discount_price FROM products WHERE id = ANY($1::int[])`, [ids]
  );
  const prodMap = new Map(products.map((p) => [p.id, p]));

  const results = [];
  for (const item of items) {
    const p = prodMap.get(Number(item.product_id));
    if (!p) continue;
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price ?? p.discount_price ?? p.selling_price);
    if (qty <= 0 || unitPrice <= 0) continue;

    let best = null;
    for (const promo of promos) {
      let discount = 0;
      if (promo.type === 'percent_product' && promo.product_id === p.id) {
        discount = round2(unitPrice * qty * Number(promo.percent) / 100);
      } else if (promo.type === 'percent_category' && promo.category_id != null && promo.category_id === p.category_id) {
        discount = round2(unitPrice * qty * Number(promo.percent) / 100);
      } else if (promo.type === 'bogo' && promo.product_id === p.id) {
        const groupSize = promo.buy_qty + promo.free_qty;
        const freeUnits = Math.floor(qty / groupSize) * promo.free_qty;
        discount = round2(freeUnits * unitPrice);
      }
      if (discount > 0 && (!best || discount > best.discount)) {
        best = { product_id: p.id, discount, promo_name: promo.name };
      }
    }
    if (best) results.push(best);
  }
  ok(res, results);
});
