-- ============================================================
-- POS / Billing / Inventory Management System - PostgreSQL Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  address TEXT,
  phone VARCHAR(40),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(40),
  password_hash VARCHAR(200) NOT NULL,
  role_id INT NOT NULL REFERENCES roles(id),
  branch_id INT REFERENCES branches(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  short_name VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(160) NOT NULL,
  contact_person VARCHAR(120),
  phone VARCHAR(40),
  email VARCHAR(160),
  address TEXT,
  tax_number VARCHAR(60),
  payment_terms VARCHAR(120),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(company_name);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(60) NOT NULL UNIQUE,
  barcode VARCHAR(60) UNIQUE,
  category_id INT REFERENCES categories(id),
  brand_id INT REFERENCES brands(id),
  unit_id INT REFERENCES units(id),
  supplier_id INT REFERENCES suppliers(id),
  description TEXT,
  image_url TEXT,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_price NUMERIC(12,2),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 5,
  max_stock INT NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode VARCHAR(60) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INT NOT NULL REFERENCES branches(id),
  quantity INT NOT NULL DEFAULT 0,
  UNIQUE (product_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch ON inventory(branch_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  branch_id INT NOT NULL REFERENCES branches(id),
  movement_type VARCHAR(30) NOT NULL, -- opening, purchase, sale, return_in, purchase_return, adjustment, transfer_in, transfer_out, damage
  quantity INT NOT NULL,
  previous_stock INT NOT NULL,
  new_stock INT NOT NULL,
  reference VARCHAR(80),
  reason TEXT,
  user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(160),
  address TEXT,
  notes TEXT,
  outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  branch_id INT NOT NULL REFERENCES branches(id),
  customer_id INT REFERENCES customers(id),
  user_id INT NOT NULL REFERENCES users(id),
  subtotal NUMERIC(14,2) NOT NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed, cancelled, partially_returned, returned
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(60),
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL,
  returned_quantity INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  reference_type VARCHAR(20) NOT NULL, -- sale, purchase, refund, supplier_payment
  reference_id INT NOT NULL,
  method VARCHAR(30) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  user_id INT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  purchase_number VARCHAR(40) NOT NULL UNIQUE,
  branch_id INT NOT NULL REFERENCES branches(id),
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  user_id INT NOT NULL REFERENCES users(id),
  subtotal NUMERIC(14,2) NOT NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ordered', -- ordered, received, cancelled
  notes TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  quantity INT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  return_number VARCHAR(40) NOT NULL UNIQUE,
  sale_id INT NOT NULL REFERENCES sales(id),
  branch_id INT NOT NULL REFERENCES branches(id),
  user_id INT NOT NULL REFERENCES users(id),
  refund_amount NUMERIC(14,2) NOT NULL,
  refund_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);

CREATE TABLE IF NOT EXISTS return_items (
  id SERIAL PRIMARY KEY,
  return_id INT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id INT NOT NULL REFERENCES sale_items(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  line_refund NUMERIC(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  branch_id INT REFERENCES branches(id),
  name VARCHAR(160) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'other',
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60),
  entity_id VARCHAR(40),
  description TEXT,
  ip VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

CREATE TABLE IF NOT EXISTS counters (
  name VARCHAR(40) PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);
