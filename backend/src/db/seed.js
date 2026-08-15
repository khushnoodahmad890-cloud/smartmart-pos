/**
 * Demo seed script. Safe to run once on an empty database.
 * Demo passwords come from env vars (SEED_ADMIN_PASSWORD, SEED_MANAGER_PASSWORD, SEED_CASHIER_PASSWORD)
 * and default to demo values suitable ONLY for local/demo environments.
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD || 'admin123';
const MANAGER_PW = process.env.SEED_MANAGER_PASSWORD || 'manager123';
const CASHIER_PW = process.env.SEED_CASHIER_PASSWORD || 'cashier123';

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
  ['manage_customers', 'Manage customers', 'partners'],
  ['manage_suppliers', 'Manage suppliers', 'partners'],
  ['manage_purchases', 'Manage purchases', 'purchases'],
  ['manage_expenses', 'Manage expenses', 'finance'],
  ['view_reports', 'View reports & analytics', 'reports'],
  ['manage_users', 'Manage users', 'admin'],
  ['manage_settings', 'Manage settings, roles & branches', 'admin'],
  ['view_audit_logs', 'View audit logs', 'admin'],
];

const MANAGER_PERMS = PERMISSIONS.map(([c]) => c).filter((c) => !['manage_users', 'manage_settings', 'view_audit_logs'].includes(c));
const CASHIER_PERMS = ['view_dashboard', 'view_products', 'create_sale', 'process_refund'];

const CATEGORIES = ['Beverages', 'Snacks', 'Dairy & Eggs', 'Bakery', 'Personal Care', 'Household', 'Electronics', 'Frozen Foods'];
const BRANDS = ['Coca-Cola', 'Nestlé', 'PepsiCo', 'Unilever', 'P&G', 'Samsung', 'HomeBrand', 'FreshFarm', 'DairyPure', 'Lays'];
const UNITS = [['Piece', 'pc'], ['Kilogram', 'kg'], ['Litre', 'L'], ['Pack', 'pk'], ['Box', 'box'], ['Dozen', 'dz']];

// name, category, brand, unit, cost, price, tax, stock, minStock  (USD demo pricing)
const PRODUCTS = [
  ['Coca Cola 500ml', 'Beverages', 'Coca-Cola', 'pc', 0.45, 0.99, 0, 120, 20],
  ['Coca Cola 1.5L', 'Beverages', 'Coca-Cola', 'pc', 1.10, 1.99, 0, 60, 15],
  ['Sprite 500ml', 'Beverages', 'Coca-Cola', 'pc', 0.45, 0.99, 0, 8, 20],
  ['Pepsi 500ml', 'Beverages', 'PepsiCo', 'pc', 0.44, 0.99, 0, 95, 20],
  ['7UP 1.5L', 'Beverages', 'PepsiCo', 'pc', 1.05, 1.89, 0, 40, 10],
  ['Pure Life Water 1.5L', 'Beverages', 'Nestlé', 'pc', 0.40, 0.79, 0, 200, 30],
  ['Nescafé Classic 100g', 'Beverages', 'Nestlé', 'pc', 4.80, 6.99, 0, 25, 8],
  ['Lays Classic 40g', 'Snacks', 'Lays', 'pc', 0.60, 1.19, 0, 150, 30],
  ['Lays Salted 70g', 'Snacks', 'Lays', 'pc', 0.90, 1.69, 0, 90, 25],
  ['Doritos Nacho 55g', 'Snacks', 'PepsiCo', 'pc', 0.80, 1.49, 0, 0, 20],
  ['KitKat 4-Finger', 'Snacks', 'Nestlé', 'pc', 0.75, 1.29, 0, 70, 15],
  ['Whole Milk 1L', 'Dairy & Eggs', 'DairyPure', 'pc', 0.85, 1.39, 0, 85, 20],
  ['Cooking Cream 200ml', 'Dairy & Eggs', 'DairyPure', 'pc', 1.10, 1.79, 0, 30, 10],
  ['Greek Yogurt 400g', 'Dairy & Eggs', 'Nestlé', 'pc', 1.60, 2.49, 0, 45, 12],
  ['Farm Eggs (Dozen)', 'Dairy & Eggs', 'FreshFarm', 'dz', 2.20, 3.29, 0, 50, 10],
  ['White Bread Large', 'Bakery', 'HomeBrand', 'pc', 0.90, 1.49, 0, 35, 10],
  ['Burger Buns 6-Pack', 'Bakery', 'HomeBrand', 'pk', 1.20, 1.99, 0, 6, 8],
  ['Croissants 4-Pack', 'Bakery', 'HomeBrand', 'pk', 1.80, 2.99, 0, 22, 8],
  ['Dove Soap Bar', 'Personal Care', 'Unilever', 'pc', 1.00, 1.79, 0, 110, 20],
  ['Sunsilk Shampoo 360ml', 'Personal Care', 'Unilever', 'pc', 2.80, 4.49, 0, 28, 10],
  ['Colgate Toothpaste 125g', 'Personal Care', 'P&G', 'pc', 1.40, 2.29, 0, 55, 15],
  ['Head & Shoulders 400ml', 'Personal Care', 'P&G', 'pc', 3.90, 5.99, 0, 4, 8],
  ['Gillette Blue II Razor', 'Personal Care', 'P&G', 'pc', 0.95, 1.69, 0, 65, 15],
  ['Laundry Detergent 1kg', 'Household', 'Unilever', 'pc', 3.50, 5.49, 0, 42, 10],
  ['Dish Soap 500ml', 'Household', 'Unilever', 'pc', 0.90, 1.59, 0, 130, 25],
  ['Ariel Pods 15-Pack', 'Household', 'P&G', 'pc', 4.60, 6.99, 0, 18, 10],
  ['Tissue Box 150 Sheets', 'Household', 'HomeBrand', 'box', 0.90, 1.49, 0, 75, 15],
  ['USB-C Cable 1m', 'Electronics', 'Samsung', 'pc', 3.50, 6.99, 8, 34, 8],
  ['25W Fast Charger', 'Electronics', 'Samsung', 'pc', 11.00, 19.99, 8, 12, 5],
  ['AA Batteries 4-Pack', 'Electronics', 'HomeBrand', 'pk', 1.60, 2.99, 8, 58, 12],
  ['Power Strip 3-Way', 'Electronics', 'HomeBrand', 'pc', 6.50, 10.99, 8, 15, 5],
  ['Frozen Pizza 400g', 'Frozen Foods', 'HomeBrand', 'pk', 2.20, 3.79, 0, 40, 10],
  ['Chicken Nuggets 1kg', 'Frozen Foods', 'FreshFarm', 'pk', 4.80, 7.49, 0, 3, 6],
  ['Ice Cream Vanilla 1L', 'Frozen Foods', 'Nestlé', 'pc', 2.60, 4.29, 0, 88, 20],
];

function ean13(seq) {
  const body = '200' + String(seq).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + ((10 - (sum % 10)) % 10);
}

async function seed() {
  const existing = await pool.query(`SELECT COUNT(*) FROM users`);
  if (Number(existing.rows[0].count) > 0) {
    console.log('Database already seeded — skipping. (Truncate tables to re-seed.)');
    await pool.end();
    return;
  }

  await withTransaction(async (c) => {
    // Branches
    const { rows: branchRows } = await c.query(
      `INSERT INTO branches (name, code, address, phone) VALUES
       ('Main Store', 'MAIN', '128 Market Street, Downtown', '+1 555 010 2000'),
       ('Westside Branch', 'WEST', '45 West Avenue, Westside', '+1 555 010 3000')
       RETURNING id`
    );
    const mainBranch = branchRows[0].id;

    // Permissions
    for (const [code, label, category] of PERMISSIONS) {
      await c.query(`INSERT INTO permissions (code, label, category) VALUES ($1,$2,$3)`, [code, label, category]);
    }

    // Roles
    const { rows: superRole } = await c.query(`INSERT INTO roles (name, description, is_system) VALUES ('super_admin','Full system access', TRUE) RETURNING id`);
    const { rows: mgrRole } = await c.query(`INSERT INTO roles (name, description, is_system) VALUES ('manager','Store manager', TRUE) RETURNING id`);
    const { rows: cashRole } = await c.query(`INSERT INTO roles (name, description, is_system) VALUES ('cashier','POS cashier', TRUE) RETURNING id`);

    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions`, [superRole[0].id]);
    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`, [mgrRole[0].id, MANAGER_PERMS]);
    await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`, [cashRole[0].id, CASHIER_PERMS]);

    // Users
    const mkUser = async (name, username, email, pw, roleId) => {
      const hash = await bcrypt.hash(pw, 10);
      const { rows } = await c.query(
        `INSERT INTO users (name, username, email, password_hash, role_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [name, username, email, hash, roleId, mainBranch]
      );
      return rows[0].id;
    };
    const adminId = await mkUser('Alex Morgan', 'admin', 'admin@demo.pos', ADMIN_PW, superRole[0].id);
    const managerId = await mkUser('Maria Garcia', 'manager', 'manager@demo.pos', MANAGER_PW, mgrRole[0].id);
    const cashierId = await mkUser('Sam Chen', 'cashier', 'cashier@demo.pos', CASHIER_PW, cashRole[0].id);

    // Units, categories, brands
    const unitIds = {};
    for (const [name, short] of UNITS) {
      const { rows } = await c.query(`INSERT INTO units (name, short_name) VALUES ($1,$2) RETURNING id`, [name, short]);
      unitIds[short] = rows[0].id;
    }
    const catIds = {};
    for (const name of CATEGORIES) {
      const { rows } = await c.query(`INSERT INTO categories (name) VALUES ($1) RETURNING id`, [name]);
      catIds[name] = rows[0].id;
    }
    const brandIds = {};
    for (const name of BRANDS) {
      const { rows } = await c.query(`INSERT INTO brands (name) VALUES ($1) RETURNING id`, [name]);
      brandIds[name] = rows[0].id;
    }

    // Suppliers
    const supplierData = [
      ['Metro Distribution Co.', 'James Wilson', '+1 555 020 1001', 'orders@metrodist.example', 'Net 30'],
      ['Global Wholesale Traders', 'Emma Brown', '+1 555 020 1002', 'sales@gwt.example', 'Net 15'],
      ['Fresh Foods Supply', 'Carlos Reyes', '+1 555 020 1003', 'info@ffsupply.example', 'Cash on delivery'],
      ['TechSource Electronics', 'Priya Patel', '+1 555 020 1004', 'b2b@techsource.example', 'Net 30'],
    ];
    const supplierIds = [];
    for (const [company, contact, phone, email, terms] of supplierData) {
      const { rows } = await c.query(
        `INSERT INTO suppliers (company_name, contact_person, phone, email, payment_terms) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [company, contact, phone, email, terms]
      );
      supplierIds.push(rows[0].id);
    }

    // Customers
    const customerData = [
      ['John Smith', '+1 555 030 1001', 'john.smith@example.com'],
      ['Fatima Hassan', '+1 555 030 1002', 'fatima.h@example.com'],
      ['David Lee', '+1 555 030 1003', null],
      ['Sofia Rossi', '+1 555 030 1004', 'sofia.rossi@example.com'],
      ['Ahmed Ali', '+1 555 030 1005', null],
      ['Anna Kowalski', '+1 555 030 1006', 'anna.k@example.com'],
    ];
    const customerIds = [];
    let custSeq = 0;
    for (const [name, phone, email] of customerData) {
      custSeq++;
      const { rows } = await c.query(
        `INSERT INTO customers (code, name, phone, email) VALUES ($1,$2,$3,$4) RETURNING id`,
        [`CUST-${String(custSeq).padStart(5, '0')}`, name, phone, email]
      );
      customerIds.push(rows[0].id);
    }
    await c.query(`INSERT INTO counters (name, value) VALUES ('customer', $1)`, [custSeq]);

    // Products + inventory
    const productIds = [];
    let skuSeq = 0, bcSeq = 0;
    for (const [name, cat, brand, unit, cost, price, tax, stock, minStock] of PRODUCTS) {
      skuSeq++; bcSeq++;
      const sku = `SKU-${String(skuSeq).padStart(5, '0')}`;
      const barcode = ean13(bcSeq);
      const { rows } = await c.query(
        `INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_id, supplier_id, purchase_price, avg_cost, selling_price, tax_rate, min_stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11) RETURNING id`,
        [name, sku, barcode, catIds[cat], brandIds[brand], unitIds[unit], supplierIds[skuSeq % supplierIds.length], cost, price, tax, minStock]
      );
      const pid = rows[0].id;
      productIds.push({ id: pid, name, sku, cost, price, tax, stock });
      await c.query(`INSERT INTO inventory (product_id, branch_id, quantity) VALUES ($1,$2,$3)`, [pid, mainBranch, stock]);
      await c.query(
        `INSERT INTO inventory_movements (product_id, branch_id, movement_type, quantity, previous_stock, new_stock, reference, reason, user_id)
         VALUES ($1,$2,'opening',$3,0,$3,$4,'Opening stock',$5)`,
        [pid, mainBranch, stock, sku, adminId]
      );
    }
    await c.query(`INSERT INTO counters (name, value) VALUES ('sku', $1), ('barcode', $2)`, [skuSeq, bcSeq]);

    // Historic purchases
    let purSeq = 0;
    const mkPurchase = async (supplierIdx, daysAgo, itemsIdx, paidRatio) => {
      purSeq++;
      const num = `PUR-2026-${String(purSeq).padStart(6, '0')}`;
      const date = new Date(Date.now() - daysAgo * 86400000);
      let subtotal = 0;
      const items = itemsIdx.map((i) => {
        const p = productIds[i];
        const qty = 20 + (i % 4) * 10;
        subtotal += p.cost * qty;
        return { p, qty };
      });
      const paid = Math.round(subtotal * paidRatio * 100) / 100;
      const { rows } = await c.query(
        `INSERT INTO purchases (purchase_number, branch_id, supplier_id, user_id, subtotal, total, amount_paid, status, received_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$5,$6,'received',$7,$7) RETURNING id`,
        [num, mainBranch, supplierIds[supplierIdx], managerId, subtotal, paid, date]
      );
      for (const { p, qty } of items) {
        await c.query(
          `INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, unit_cost, line_total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [rows[0].id, p.id, p.name, qty, p.cost, p.cost * qty]
        );
      }
      if (subtotal - paid > 0) {
        await c.query(`UPDATE suppliers SET balance = balance + $1 WHERE id=$2`, [subtotal - paid, supplierIds[supplierIdx]]);
      }
      if (paid > 0) {
        await c.query(
          `INSERT INTO payments (reference_type, reference_id, method, amount, user_id, created_at) VALUES ('purchase',$1,'bank_transfer',$2,$3,$4)`,
          [rows[0].id, paid, managerId, date]
        );
      }
    };
    await mkPurchase(0, 25, [0, 1, 3, 5], 1);
    await mkPurchase(1, 18, [7, 8, 10, 18, 24], 0.6);
    await mkPurchase(2, 12, [11, 13, 14, 15, 31], 1);
    await mkPurchase(3, 8, [27, 28, 29, 30], 0.5);
    await mkPurchase(0, 3, [4, 6, 20, 23], 1);
    await c.query(`INSERT INTO counters (name, value) VALUES ('purchase', $1)`, [purSeq]);

    // Historic sales over the past 30 days
    let invSeq = 0;
    const payMethods = ['cash', 'cash', 'cash', 'card', 'mobile', 'bank_transfer'];
    const rng = (n) => Math.floor(Math.random() * n);
    for (let day = 30; day >= 0; day--) {
      const salesToday = 2 + rng(5);
      for (let sN = 0; sN < salesToday; sN++) {
        invSeq++;
        const num = `INV-2026-${String(invSeq).padStart(6, '0')}`;
        const date = new Date(Date.now() - day * 86400000 - rng(10) * 3600000);
        const cashier = [cashierId, cashierId, managerId][rng(3)];
        const customerId = rng(3) === 0 ? customerIds[rng(customerIds.length)] : null;
        const method = payMethods[rng(payMethods.length)];

        const nItems = 1 + rng(4);
        let subtotal = 0, tax = 0, cost = 0;
        const chosen = new Map();
        for (let k = 0; k < nItems; k++) {
          const p = productIds[rng(productIds.length)];
          const qty = 1 + rng(3);
          const cur = chosen.get(p.id) || { p, qty: 0 };
          cur.qty += qty;
          chosen.set(p.id, cur);
        }
        for (const { p, qty } of chosen.values()) {
          const gross = p.price * qty;
          subtotal += gross;
          tax += gross * (p.tax / 100);
          cost += p.cost * qty;
        }
        subtotal = Math.round(subtotal * 100) / 100;
        tax = Math.round(tax * 100) / 100;
        const total = Math.round((subtotal + tax) * 100) / 100;
        const paid = method === 'cash' ? Math.ceil(total / 5) * 5 : total; // round up to next $5 bill

        const { rows: sRows } = await c.query(
          `INSERT INTO sales (invoice_number, branch_id, customer_id, user_id, subtotal, discount, tax, total, total_cost,
             payment_method, amount_paid, change_due, status, created_at)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11,'completed',$12) RETURNING id`,
          [num, mainBranch, customerId, cashier, subtotal, tax, total, cost, method, paid, Math.round((paid - total) * 100) / 100, date]
        );
        for (const { p, qty } of chosen.values()) {
          const gross = p.price * qty;
          const lineTax = Math.round(gross * (p.tax / 100) * 100) / 100;
          await c.query(
            `INSERT INTO sale_items (sale_id, product_id, product_name, sku, quantity, unit_price, unit_cost, discount, tax, line_total)
             VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9)`,
            [sRows[0].id, p.id, p.name, p.sku, qty, p.price, p.cost, lineTax, Math.round((gross + lineTax) * 100) / 100]
          );
        }
        await c.query(
          `INSERT INTO payments (reference_type, reference_id, method, amount, user_id, created_at) VALUES ('sale',$1,$2,$3,$4,$5)`,
          [sRows[0].id, method, total, cashier, date]
        );
      }
    }
    await c.query(`INSERT INTO counters (name, value) VALUES ('invoice', $1)`, [invSeq]);

    // Expenses
    const expenseData = [
      ['Shop Rent - Monthly', 'rent', 1800, 28],
      ['Electricity Bill', 'electricity', 420, 20],
      ['Internet & Phone', 'internet', 90, 20],
      ['Staff Salaries - Monthly', 'salaries', 5200, 14],
      ['Delivery Van Fuel', 'transportation', 260, 10],
      ['AC Maintenance', 'maintenance', 150, 7],
      ['Social Media Ads', 'marketing', 200, 5],
      ['Shopping Bags & Supplies', 'other', 85, 2],
    ];
    for (const [name, cat, amount, daysAgo] of expenseData) {
      await c.query(
        `INSERT INTO expenses (branch_id, name, category, amount, payment_method, expense_date, user_id)
         VALUES ($1,$2,$3,$4,'bank_transfer',$5::date,$6)`,
        [mainBranch, name, cat, amount, new Date(Date.now() - daysAgo * 86400000), adminId]
      );
    }

    // Settings
    const settings = {
      business_name: 'SmartMart Superstore',
      business_address: '128 Market Street, Downtown',
      business_phone: '+1 555 010 2000',
      business_email: 'info@smartmart.example',
      currency: 'USD', currency_symbol: '$',
      tax_rate: '0', invoice_prefix: 'INV',
      receipt_footer: 'Thank you for shopping with us! No returns without receipt within 7 days.',
      date_format: 'DD/MM/YYYY', timezone: 'UTC',
      low_stock_threshold: '10', allow_negative_stock: 'false',
      barcode_type: 'EAN13', receipt_width: '80mm',
      onboarding_done: 'true', // demo data is pre-configured; fresh (unseeded) installs see the wizard
    };
    for (const [k, v] of Object.entries(settings)) {
      await c.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [k, v]);
    }

    // A couple of starter notifications
    await c.query(`INSERT INTO notifications (type, title, message) VALUES
      ('low_stock', 'Low stock: Sprite 500ml', 'Sprite 500ml is low (8 left, minimum 20).'),
      ('out_of_stock', 'Out of stock: Kurkure Chutney 62g', 'Kurkure Chutney 62g is out of stock.'),
      ('info', 'Welcome to SmartMart POS', 'Your demo environment is ready. Explore the dashboard, POS and reports.')`);

    await c.query(
      `INSERT INTO audit_logs (user_id, action, entity, description) VALUES ($1,'seed','system','Demo data seeded')`,
      [adminId]
    );
  });

  console.log('✔ Demo data seeded successfully');
  console.log('  Demo accounts:');
  console.log(`    admin / ${ADMIN_PW}   (Super Admin)`);
  console.log(`    manager / ${MANAGER_PW} (Manager)`);
  console.log(`    cashier / ${CASHIER_PW} (Cashier)`);
  await pool.end();
}

seed().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
