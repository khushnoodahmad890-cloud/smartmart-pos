/**
 * Minimal first-run bootstrap for production/desktop installs.
 * Unlike seed.js (demo data), this only creates the system essentials:
 * roles, permissions, one branch, one admin account and default settings.
 * Safe to run repeatedly — does nothing if users already exist.
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const ADMIN_USER = process.env.BOOTSTRAP_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';

const PERMISSIONS = [
  ['view_dashboard', 'View dashboard', 'dashboard'],
  ['view_products', 'View products', 'products'],
  ['create_product', 'Create products', 'products'],
  ['edit_product', 'Edit products', 'products'],
  ['delete_product', 'Delete products', 'products'],
  ['manage_catalog', 'Manage categories, brands & units', 'products'],
  ['view_inventory', 'View inventory', 'inventory'],
  ['edit_inventory', 'Adjust & transfer stock', 'inventory'],
  ['create_sale', 'Create sales (POS)', 'sales'],
  ['edit_sale', 'Edit sales', 'sales'],
  ['delete_sale', 'Cancel sales', 'sales'],
  ['process_refund', 'Process returns & refunds', 'sales'],
  ['manage_shifts', 'Open/close cash drawer shifts', 'sales'],
  ['manage_quotations', 'Create & manage quotations', 'sales'],
  ['view_kitchen', 'View kitchen order display', 'sales'],
  ['manage_customers', 'Manage customers', 'partners'],
  ['manage_suppliers', 'Manage suppliers', 'partners'],
  ['manage_purchases', 'Manage purchases', 'purchases'],
  ['manage_expenses', 'Manage expenses', 'finance'],
  ['view_reports', 'View reports & analytics', 'reports'],
  ['manage_users', 'Manage users', 'admin'],
  ['manage_settings', 'Manage settings, roles & branches', 'admin'],
  ['view_audit_logs', 'View audit logs', 'admin'],
  ['manage_billing', 'Manage subscription & billing', 'admin'],
];

const MANAGER_EXCLUDES = ['manage_users', 'manage_settings', 'view_audit_logs', 'manage_billing'];
const CASHIER_PERMS = ['view_dashboard', 'view_products', 'create_sale', 'process_refund', 'manage_shifts', 'manage_quotations'];

async function bootstrap() {
  const existing = await pool.query(`SELECT COUNT(*) FROM users`);
  if (Number(existing.rows[0].count) > 0) {
    console.log('Bootstrap: users already exist — nothing to do.');
    await pool.end();
    return;
  }

  await withTransaction(async (c) => {
    const { rows: br } = await c.query(
      `INSERT INTO branches (name, code) VALUES ('Main Store', 'MAIN') RETURNING id`
    );
    const branchId = br[0].id;

    for (const [code, label, category] of PERMISSIONS) {
      await c.query(
        `INSERT INTO permissions (code, label, category) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
        [code, label, category]
      );
    }

    const mkRole = async (name, desc) =>
      (await c.query(`INSERT INTO roles (name, description, is_system) VALUES ($1,$2,TRUE) RETURNING id`, [name, desc])).rows[0].id;
    const superId = await mkRole('super_admin', 'Full system access');
    const mgrId = await mkRole('manager', 'Store manager');
    const cashId = await mkRole('cashier', 'POS cashier');

    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions ON CONFLICT DO NOTHING`, [superId]);
    await c.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE NOT (code = ANY($2::text[])) ON CONFLICT DO NOTHING`,
      [mgrId, MANAGER_EXCLUDES]
    );
    await c.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`,
      [cashId, CASHIER_PERMS]
    );

    const hash = await bcrypt.hash(ADMIN_PASS, 10);
    await c.query(
      `INSERT INTO users (name, username, email, password_hash, role_id, branch_id)
       VALUES ('Administrator', $1, $2, $3, $4, $5)`,
      [ADMIN_USER.toLowerCase(), `${ADMIN_USER.toLowerCase()}@local.pos`, hash, superId, branchId]
    );

    const defaults = {
      business_name: 'My Store', currency: 'USD', currency_symbol: '$', tax_rate: '0',
      tax_mode: 'exclusive', invoice_prefix: 'INV',
      receipt_footer: 'Thank you for shopping with us!', date_format: 'DD/MM/YYYY',
      timezone: 'UTC', low_stock_threshold: '10', allow_negative_stock: 'false',
      barcode_type: 'EAN13', receipt_width: '80mm', loyalty_enabled: 'true',
      loyalty_earn_rate: '1', loyalty_redeem_value: '1', daily_sales_target: '0',
      audit_retention_days: '365', kitchen_mode: 'false',
      onboarding_done: 'false', // ← triggers the setup wizard on first login
      receipt_show_logo: 'true', receipt_show_tax: 'true',
      weight_barcode_prefix: '21', scan_sounds: 'true', business_logo: '',
    };
    for (const [k, v] of Object.entries(defaults)) {
      await c.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]);
    }
  });

  console.log('✔ Bootstrap complete.');
  console.log(`  Sign in with:  ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log('  (Change this password immediately after first login.)');
  await pool.end();
}

bootstrap().catch((e) => { console.error('Bootstrap failed:', e); process.exit(1); });
