import { query } from '../db/pool.js';
import { asyncHandler, ok, created } from '../utils/helpers.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

function makeCrud(table, label, extraFields = []) {
  const fields = ['name', ...extraFields];

  return {
    list: asyncHandler(async (req, res) => {
      const search = (req.query.search || '').trim();
      const params = [];
      let where = '';
      if (search) { params.push(`%${search}%`); where = `WHERE name ILIKE $1`; }
      let select = `SELECT t.*`;
      if (table === 'categories') {
        select += `, (SELECT name FROM categories pc WHERE pc.id=t.parent_id) AS parent_name,
                   (SELECT COUNT(*) FROM products p WHERE p.category_id=t.id AND p.is_deleted=FALSE) AS product_count`;
      }
      if (table === 'brands') {
        select += `, (SELECT COUNT(*) FROM products p WHERE p.brand_id=t.id AND p.is_deleted=FALSE) AS product_count`;
      }
      const { rows } = await query(`${select} FROM ${table} t ${where.replace('WHERE name', 'WHERE t.name')} ORDER BY t.name`, params);
      ok(res, rows);
    }),
    create: asyncHandler(async (req, res) => {
      const b = req.body || {};
      if (!b.name || !b.name.trim()) throw badRequest(`${label} name is required`);
      const cols = fields.filter((f) => b[f] !== undefined);
      const vals = cols.map((f) => (typeof b[f] === 'string' ? b[f].trim() : b[f]));
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      try {
        const { rows } = await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`, vals);
        await audit({ userId: req.user.id, action: `${table}_create`, entity: table, entityId: rows[0].id, description: `Created ${label.toLowerCase()} "${b.name}"`, ip: req.ip });
        created(res, rows[0]);
      } catch (e) {
        if (e.code === '23505') throw conflict(`A ${label.toLowerCase()} with this name already exists`);
        throw e;
      }
    }),
    update: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const b = req.body || {};
      const existing = (await query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
      if (!existing) throw notFound(`${label} not found`);
      const cols = fields.filter((f) => b[f] !== undefined);
      if (b.is_active !== undefined) cols.push('is_active');
      if (!cols.length) return ok(res, existing);
      const sets = cols.map((f, i) => `${f}=$${i + 1}`);
      const vals = cols.map((f) => (typeof b[f] === 'string' ? b[f].trim() : b[f]));
      vals.push(id);
      const { rows } = await query(`UPDATE ${table} SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
      ok(res, rows[0]);
    }),
    remove: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const existing = (await query(`SELECT name FROM ${table} WHERE id=$1`, [id])).rows[0];
      if (!existing) throw notFound(`${label} not found`);
      try {
        await query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      } catch (e) {
        if (e.code === '23503') throw conflict(`This ${label.toLowerCase()} is used by existing products and cannot be deleted. Deactivate it instead.`);
        throw e;
      }
      await audit({ userId: req.user.id, action: `${table}_delete`, entity: table, entityId: id, description: `Deleted ${label.toLowerCase()} "${existing.name}"`, ip: req.ip });
      ok(res, { message: `${label} deleted` });
    }),
  };
}

export const categories = makeCrud('categories', 'Category', ['description', 'parent_id']);
export const brands = makeCrud('brands', 'Brand', ['description']);
export const units = makeCrud('units', 'Unit', ['short_name']);
