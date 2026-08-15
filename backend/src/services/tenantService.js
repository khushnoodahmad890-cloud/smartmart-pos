/**
 * Multi-tenant control plane.
 *
 * A small "control" database holds the tenant registry. Each store gets its OWN
 * PostgreSQL database (strongest isolation — no tenant_id leaks possible), created
 * and migrated automatically at signup.
 *
 * Request routing: the frontend sends `X-Tenant: <store-code>`; middleware looks up
 * the tenant, then runs the request inside AsyncLocalStorage so every query in every
 * controller transparently hits that tenant's database.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { poolFor, runWithTenantDb } from '../db/pool.js';
import { ApiError, badRequest } from '../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controlPool = () => poolFor(env.controlDatabaseUrl);

const tenantCache = new Map(); // code -> { dbUrl, name, id } (60s TTL)

export async function ensureControlSchema() {
  await controlPool().query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      db_name VARCHAR(80) NOT NULL UNIQUE,
      owner_email VARCHAR(160) NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function baseUrlParts() {
  const url = new URL(env.databaseUrl);
  return { url };
}

function dbUrlFor(dbName) {
  const { url } = baseUrlParts();
  const u = new URL(url.toString());
  u.pathname = `/${dbName}`;
  return u.toString();
}

export async function getTenant(code) {
  const key = String(code || '').toLowerCase().trim();
  if (!key) return null;
  const hit = tenantCache.get(key);
  if (hit && hit.at > Date.now() - 60000) return hit.t;
  const { rows } = await controlPool().query(`SELECT * FROM tenants WHERE code=$1 AND status='active'`, [key]);
  const t = rows[0] ? { ...rows[0], dbUrl: dbUrlFor(rows[0].db_name) } : null;
  tenantCache.set(key, { t, at: Date.now() });
  return t;
}

/** Create a store: control row + fresh database + schema + roles/admin + trial subscription. */
export async function provisionTenant({ code, name, ownerName, ownerEmail, password }) {
  const slug = String(code || '').toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) {
    throw badRequest('Store code must be 3–30 characters: letters, numbers and dashes (e.g. "alnoor-mart")');
  }
  if (!name?.trim()) throw badRequest('Store name is required');
  if (!ownerEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw badRequest('A valid email is required');
  if (!password || String(password).length < 6) throw badRequest('Password must be at least 6 characters');

  const dbName = `pos_t_${slug.replace(/-/g, '_')}`;

  const existing = await controlPool().query(`SELECT 1 FROM tenants WHERE code=$1`, [slug]);
  if (existing.rows.length) throw new ApiError(409, 'This store code is already taken — choose another');

  // 1. create the database (cannot run inside a transaction)
  await controlPool().query(`CREATE DATABASE ${dbName}`);

  const tPool = poolFor(dbUrlFor(dbName));
  try {
    // 2. schema + migrations
    const dbDir = path.join(__dirname, '../db');
    await tPool.query(fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8'));
    const migDir = path.join(dbDir, 'migrations');
    for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
      await tPool.query(fs.readFileSync(path.join(migDir, f), 'utf8'));
    }

    // 3. bootstrap inside the tenant DB (roles, permissions, admin, settings)
    await bootstrapTenant(tPool, { name, ownerName, ownerEmail, password });

    // 4. register
    const { rows } = await controlPool().query(
      `INSERT INTO tenants (code, name, db_name, owner_email) VALUES ($1,$2,$3,$4) RETURNING *`,
      [slug, name.trim(), dbName, ownerEmail.toLowerCase().trim()]
    );
    tenantCache.delete(slug);
    return rows[0];
  } catch (e) {
    // roll back the created database on any failure
    try { await tPool.end(); } catch {}
    try { await controlPool().query(`DROP DATABASE IF EXISTS ${dbName}`); } catch {}
    throw e;
  }
}

const PERMISSIONS = [
  ['view_dashboard', 'View dashboard', 'dashboard'], ['view_products', 'View products', 'products'],
  ['create_product', 'Create products', 'products'], ['edit_product', 'Edit products', 'products'],
  ['delete_product', 'Delete products', 'products'], ['manage_catalog', 'Manage categories, brands & units', 'products'],
  ['view_inventory', 'View inventory', 'inventory'], ['edit_inventory', 'Adjust & transfer stock', 'inventory'],
  ['create_sale', 'Create sales (POS)', 'sales'], ['edit_sale', 'Edit sales', 'sales'],
  ['delete_sale', 'Cancel sales', 'sales'], ['process_refund', 'Process returns & refunds', 'sales'],
  ['manage_shifts', 'Open/close cash drawer shifts', 'sales'], ['manage_quotations', 'Create & manage quotations', 'sales'],
  ['view_kitchen', 'View kitchen order display', 'sales'], ['manage_customers', 'Manage customers', 'partners'],
  ['manage_suppliers', 'Manage suppliers', 'partners'], ['manage_purchases', 'Manage purchases', 'purchases'],
  ['manage_expenses', 'Manage expenses', 'finance'], ['view_reports', 'View reports & analytics', 'reports'],
  ['manage_users', 'Manage users', 'admin'], ['manage_settings', 'Manage settings, roles & branches', 'admin'],
  ['view_audit_logs', 'View audit logs', 'admin'], ['manage_billing', 'Manage subscription & billing', 'admin'],
];
const MANAGER_EXCLUDES = ['manage_users', 'manage_settings', 'view_audit_logs', 'manage_billing'];
const CASHIER_PERMS = ['view_dashboard', 'view_products', 'create_sale', 'process_refund', 'manage_shifts', 'manage_quotations'];

async function bootstrapTenant(tPool, { name, ownerName, ownerEmail, password }) {
  const c = await tPool.connect();
  try {
    await c.query('BEGIN');
    const { rows: br } = await c.query(`INSERT INTO branches (name, code) VALUES ($1, 'MAIN') RETURNING id`, [name.trim()]);
    for (const [code, label, category] of PERMISSIONS) {
      await c.query(`INSERT INTO permissions (code, label, category) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`, [code, label, category]);
    }
    const mk = async (n, d) => (await c.query(`INSERT INTO roles (name, description, is_system) VALUES ($1,$2,TRUE) RETURNING id`, [n, d])).rows[0].id;
    const superId = await mk('super_admin', 'Full system access');
    const mgrId = await mk('manager', 'Store manager');
    const cashId = await mk('cashier', 'POS cashier');
    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions ON CONFLICT DO NOTHING`, [superId]);
    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE NOT (code = ANY($2::text[])) ON CONFLICT DO NOTHING`, [mgrId, MANAGER_EXCLUDES]);
    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`, [cashId, CASHIER_PERMS]);

    const hash = await bcrypt.hash(password, 10);
    const username = ownerEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'admin';
    await c.query(
      `INSERT INTO users (name, username, email, password_hash, role_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [ownerName?.trim() || 'Owner', username, ownerEmail.toLowerCase().trim(), hash, superId, br[0].id]
    );

    const defaults = {
      business_name: name.trim(), currency: 'USD', currency_symbol: '$', tax_rate: '0', tax_mode: 'exclusive',
      invoice_prefix: 'INV', receipt_footer: 'Thank you for shopping with us!', date_format: 'DD/MM/YYYY',
      timezone: 'UTC', low_stock_threshold: '10', allow_negative_stock: 'false', barcode_type: 'EAN13',
      receipt_width: '80mm', loyalty_enabled: 'true', loyalty_earn_rate: '1', loyalty_redeem_value: '1',
      daily_sales_target: '0', audit_retention_days: '365', kitchen_mode: 'false', onboarding_done: 'false',
      receipt_show_logo: 'true', receipt_show_tax: 'true', weight_barcode_prefix: '21', scan_sounds: 'true', business_logo: '',
    };
    for (const [k, v] of Object.entries(defaults)) {
      await c.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Express middleware: resolves X-Tenant and routes the whole request to that store's DB. */
export function tenantMiddleware() {
  return async (req, res, next) => {
    if (!env.multiTenant) return next();
    // public, non-tenant endpoints
    if (req.path === '/health' || req.path.startsWith('/tenants')) return next();

    const code = req.headers['x-tenant'];
    if (!code) {
      return res.status(400).json({ success: false, error: 'Missing store code. Enter your store code on the sign-in screen.', code: 'TENANT_REQUIRED' });
    }
    try {
      const tenant = await getTenant(code);
      if (!tenant) {
        return res.status(404).json({ success: false, error: `No store found with code "${code}". Check the code or create a new store.`, code: 'TENANT_NOT_FOUND' });
      }
      req.tenant = tenant;
      runWithTenantDb(tenant.dbUrl, () => next());
    } catch (e) { next(e); }
  };
}
