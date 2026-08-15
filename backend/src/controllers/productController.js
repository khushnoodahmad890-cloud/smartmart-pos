import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';
import { moveStock } from '../services/inventoryService.js';
import { checkLimit } from '../services/subscriptionService.js';

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, b.name AS brand_name, u.short_name AS unit_name,
         s.company_name AS supplier_name,
         COALESCE(i.quantity, 0) AS stock
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN units u ON u.id = p.unit_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = $1
`;

function branchOf(req) {
  return Number(req.query.branch_id || req.user.branch_id || 1);
}

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 24 });
  const branchId = branchOf(req);
  const params = [branchId];
  let where = `WHERE p.is_deleted = FALSE`;

  const search = (req.query.search || '').trim();
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`;
  }
  if (req.query.category_id) { params.push(Number(req.query.category_id)); where += ` AND p.category_id=$${params.length}`; }
  if (req.query.brand_id) { params.push(Number(req.query.brand_id)); where += ` AND p.brand_id=$${params.length}`; }
  if (req.query.status === 'active') where += ` AND p.is_active=TRUE`;
  if (req.query.status === 'inactive') where += ` AND p.is_active=FALSE`;
  if (req.query.stock === 'low') where += ` AND COALESCE(i.quantity,0) > 0 AND COALESCE(i.quantity,0) <= p.min_stock`;
  if (req.query.stock === 'out') where += ` AND COALESCE(i.quantity,0) <= 0`;

  const sortMap = { name: 'p.name', price: 'p.selling_price', stock: 'stock', created: 'p.created_at' };
  const sort = sortMap[req.query.sort] || 'p.name';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const countQ = `SELECT COUNT(*) FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.branch_id=$1 ${where}`;
  const total = (await query(countQ, params)).rows[0].count;

  params.push(limit, offset);
  const { rows } = await query(`${PRODUCT_SELECT} ${where} ORDER BY ${sort} ${dir} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  ok(res, rows, { page, limit, total: Number(total) });
});

export const getProduct = asyncHandler(async (req, res) => {
  const branchId = branchOf(req);
  const { rows } = await query(`${PRODUCT_SELECT} WHERE p.id=$2 AND p.is_deleted=FALSE`, [branchId, Number(req.params.id)]);
  if (!rows.length) throw notFound('Product not found');
  ok(res, rows[0]);
});

/**
 * Barcode/SKU lookup used by the POS scanner.
 * Supports scale/weight-embedded EAN-13 barcodes: PP IIIII WWWWW C
 * (PP = configured prefix e.g. 21, IIIII = item code, WWWWW = weight in grams).
 * For those, price is computed as price-per-kg × weight and returned as `weight_info`.
 */
export const lookupBarcode = asyncHandler(async (req, res) => {
  const code = (req.query.code || '').trim();
  const branchId = branchOf(req);
  if (!code) throw badRequest('Barcode is required');

  // Weight-embedded barcode path
  if (/^\d{13}$/.test(code)) {
    const { rows: st } = await query(`SELECT value FROM settings WHERE key='weight_barcode_prefix'`);
    const prefix = st[0]?.value || '21';
    if (code.startsWith(prefix) && prefix.length === 2) {
      const itemCode = code.slice(2, 7);
      const grams = parseInt(code.slice(7, 12), 10);
      const { rows: wp } = await query(
        `${PRODUCT_SELECT} WHERE p.is_deleted=FALSE AND (p.sku = $2 OR p.barcode LIKE $3 OR p.id = $4)`,
        [branchId, `WB-${itemCode}`, `${prefix}${itemCode}%`, Number(itemCode) || 0]
      );
      if (wp.length && grams > 0) {
        const product = wp[0];
        if (!product.is_active) {
          return res.status(400).json({ success: false, error: `"${product.name}" is inactive and cannot be sold`, code: 'PRODUCT_INACTIVE' });
        }
        const kg = grams / 1000;
        const perKg = Number(product.discount_price ?? product.selling_price);
        return ok(res, {
          ...product,
          weight_info: { grams, kg, price_per_kg: perKg, computed_price: Math.round(perKg * kg * 100) / 100 },
        });
      }
    }
  }

  let { rows } = await query(
    `${PRODUCT_SELECT} WHERE p.is_deleted=FALSE AND (p.barcode=$2 OR p.sku=$2
       OR p.id IN (SELECT product_id FROM product_barcodes WHERE barcode=$2))`,
    [branchId, code]
  );
  if (!rows.length) {
    return res.status(404).json({ success: false, error: `No product found for barcode "${code}"`, code: 'BARCODE_NOT_FOUND' });
  }
  const product = rows[0];
  if (!product.is_active) {
    return res.status(400).json({ success: false, error: `"${product.name}" is inactive and cannot be sold`, code: 'PRODUCT_INACTIVE' });
  }
  ok(res, product);
});

async function generateSku(client) {
  const { rows } = await client.query(
    `INSERT INTO counters (name, value) VALUES ('sku', 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value`
  );
  return `SKU-${String(rows[0].value).padStart(5, '0')}`;
}

export const createProduct = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.name.trim()) throw badRequest('Product name is required');
  if (b.selling_price === undefined || Number(b.selling_price) < 0) throw badRequest('A valid selling price is required');

  const productCount = (await query(`SELECT COUNT(*) FROM products WHERE is_deleted=FALSE`)).rows[0].count;
  await checkLimit('max_products', productCount);

  const result = await withTransaction(async (client) => {
    const sku = (b.sku || '').trim() || (await generateSku(client));
    const { rows } = await client.query(
      `INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_id, supplier_id, description, image_url,
         purchase_price, avg_cost, selling_price, discount_price, wholesale_price, tax_rate, min_stock, max_stock, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [b.name.trim(), sku, (b.barcode || '').trim() || null, b.category_id || null, b.brand_id || null,
       b.unit_id || null, b.supplier_id || null, b.description || null, b.image_url || null,
       Number(b.purchase_price || 0), Number(b.selling_price), b.discount_price ? Number(b.discount_price) : null,
       b.wholesale_price ? Number(b.wholesale_price) : null,
       Number(b.tax_rate || 0), Number(b.min_stock ?? 5), Number(b.max_stock ?? 1000), b.is_active !== false]
    );
    const product = rows[0];
    const openingStock = Number(b.opening_stock || 0);
    const branchId = Number(b.branch_id || req.user.branch_id || 1);
    if (openingStock > 0) {
      await moveStock(client, {
        productId: product.id, branchId, quantityDelta: openingStock,
        movementType: 'opening', reference: product.sku, reason: 'Opening stock', userId: req.user.id,
      });
    }
    await audit({ userId: req.user.id, action: 'product_create', entity: 'product', entityId: product.id, description: `Created product "${product.name}" (${product.sku})`, ip: req.ip }, client);
    return product;
  });
  created(res, result);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = (await query(`SELECT * FROM products WHERE id=$1 AND is_deleted=FALSE`, [id])).rows[0];
  if (!existing) throw notFound('Product not found');

  const { rows } = await query(
    `UPDATE products SET
       name=COALESCE($1,name), sku=COALESCE($2,sku), barcode=$3, category_id=$4, brand_id=$5, unit_id=$6, supplier_id=$7,
       description=$8, image_url=$9, purchase_price=COALESCE($10,purchase_price), selling_price=COALESCE($11,selling_price),
       discount_price=$12, tax_rate=COALESCE($13,tax_rate), min_stock=COALESCE($14,min_stock), max_stock=COALESCE($15,max_stock),
       is_active=COALESCE($16,is_active), wholesale_price=$18, updated_at=NOW()
     WHERE id=$17 RETURNING *`,
    [b.name?.trim(), b.sku?.trim(), b.barcode !== undefined ? (b.barcode?.trim() || null) : existing.barcode,
     b.category_id !== undefined ? b.category_id : existing.category_id,
     b.brand_id !== undefined ? b.brand_id : existing.brand_id,
     b.unit_id !== undefined ? b.unit_id : existing.unit_id,
     b.supplier_id !== undefined ? b.supplier_id : existing.supplier_id,
     b.description !== undefined ? b.description : existing.description,
     b.image_url !== undefined ? b.image_url : existing.image_url,
     b.purchase_price !== undefined ? Number(b.purchase_price) : null,
     b.selling_price !== undefined ? Number(b.selling_price) : null,
     b.discount_price !== undefined ? (b.discount_price ? Number(b.discount_price) : null) : existing.discount_price,
     b.tax_rate !== undefined ? Number(b.tax_rate) : null,
     b.min_stock !== undefined ? Number(b.min_stock) : null,
     b.max_stock !== undefined ? Number(b.max_stock) : null,
     b.is_active, id,
     b.wholesale_price !== undefined ? (b.wholesale_price ? Number(b.wholesale_price) : null) : existing.wholesale_price]
  );
  await audit({ userId: req.user.id, action: 'product_update', entity: 'product', entityId: id, description: `Updated product "${rows[0].name}"`, ip: req.ip });
  ok(res, rows[0]);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = (await query(`SELECT name FROM products WHERE id=$1 AND is_deleted=FALSE`, [id])).rows[0];
  if (!existing) throw notFound('Product not found');
  // Soft delete — sales history must remain intact
  await query(`UPDATE products SET is_deleted=TRUE, is_active=FALSE, updated_at=NOW() WHERE id=$1`, [id]);
  await audit({ userId: req.user.id, action: 'product_delete', entity: 'product', entityId: id, description: `Deleted product "${existing.name}" (soft delete)`, ip: req.ip });
  ok(res, { message: 'Product deleted' });
});

export const generateBarcode = asyncHandler(async (req, res) => {
  // EAN-13-style local barcode: prefix 200 (in-store range) + 9 digits + check digit
  const { rows } = await query(
    `INSERT INTO counters (name, value) VALUES ('barcode', 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value`
  );
  const body = '200' + String(rows[0].value).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  ok(res, { barcode: body + check });
});

export const bulkExport = asyncHandler(async (req, res) => {
  const branchId = branchOf(req);
  const { rows } = await query(`${PRODUCT_SELECT} WHERE p.is_deleted=FALSE ORDER BY p.name`, [branchId]);
  ok(res, rows);
});

export const bulkImport = asyncHandler(async (req, res) => {
  const items = req.body?.products;
  if (!Array.isArray(items) || !items.length) throw badRequest('products must be a non-empty list');
  if (items.length > 500) throw badRequest('Maximum 500 products per import');

  const productCount = (await query(`SELECT COUNT(*) FROM products WHERE is_deleted=FALSE`)).rows[0].count;
  await checkLimit('max_products', productCount, items.length);

  const result = await withTransaction(async (client) => {
    let importedCount = 0;
    const errors = [];
    for (const [i, p] of items.entries()) {
      if (!p.name || p.selling_price === undefined) { errors.push(`Row ${i + 1}: name and selling_price are required`); continue; }
      try {
        const sku = (p.sku || '').trim() || (await generateSku(client));
        const { rows } = await client.query(
          `INSERT INTO products (name, sku, barcode, purchase_price, selling_price, tax_rate, min_stock)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, sku`,
          [String(p.name).trim(), sku, (p.barcode || '').trim() || null, Number(p.purchase_price || 0), Number(p.selling_price), Number(p.tax_rate || 0), Number(p.min_stock ?? 5)]
        );
        const openingStock = Number(p.opening_stock || 0);
        if (openingStock > 0) {
          await moveStock(client, {
            productId: rows[0].id, branchId: Number(req.user.branch_id || 1), quantityDelta: openingStock,
            movementType: 'opening', reference: rows[0].sku, reason: 'Bulk import opening stock', userId: req.user.id,
          });
        }
        importedCount++;
      } catch (e) {
        errors.push(`Row ${i + 1} (${p.name}): ${e.code === '23505' ? 'duplicate SKU or barcode' : e.message}`);
      }
    }
    if (importedCount === 0) throw badRequest(`Import failed: ${errors.slice(0, 3).join('; ')}`);
    await audit({ userId: req.user.id, action: 'product_bulk_import', entity: 'product', description: `Bulk imported ${importedCount} products`, ip: req.ip }, client);
    return { imported: importedCount, errors };
  });
  ok(res, result);
});
