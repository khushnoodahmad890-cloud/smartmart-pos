-- ============================================================
-- Expansion: shifts, split/credit payments, loyalty, quotations,
-- purchase returns, partial receiving, batches/expiry, refresh
-- tokens, password resets, price tiers, kitchen mode
-- ============================================================

-- Cash drawer shifts
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  user_id INT NOT NULL REFERENCES users(id),
  opening_float NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(14,2),
  expected_cash NUMERIC(14,2),
  over_short NUMERIC(14,2),
  status VARCHAR(10) NOT NULL DEFAULT 'open', -- open, closed
  notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id, status);

CREATE TABLE IF NOT EXISTS cash_movements (
  id SERIAL PRIMARY KEY,
  shift_id INT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL, -- in, out
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT NOT NULL,
  user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parked / held sales (server-side so any terminal can recall)
CREATE TABLE IF NOT EXISTS held_sales (
  id SERIAL PRIMARY KEY,
  branch_id INT NOT NULL REFERENCES branches(id),
  user_id INT NOT NULL REFERENCES users(id),
  label VARCHAR(120) NOT NULL,
  customer_id INT REFERENCES customers(id),
  customer_name VARCHAR(160),
  cart JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quotations
CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,
  quote_number VARCHAR(40) NOT NULL UNIQUE,
  branch_id INT NOT NULL REFERENCES branches(id),
  customer_id INT REFERENCES customers(id),
  user_id INT NOT NULL REFERENCES users(id),
  items JSONB NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'open', -- open, converted, expired, cancelled
  valid_until DATE,
  converted_sale_id INT REFERENCES sales(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id SERIAL PRIMARY KEY,
  return_number VARCHAR(40) NOT NULL UNIQUE,
  purchase_id INT NOT NULL REFERENCES purchases(id),
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  branch_id INT NOT NULL REFERENCES branches(id),
  user_id INT NOT NULL REFERENCES users(id),
  total NUMERIC(14,2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id SERIAL PRIMARY KEY,
  purchase_return_id INT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_item_id INT NOT NULL REFERENCES purchase_items(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL
);

-- Batch / expiry tracking
CREATE TABLE IF NOT EXISTS product_batches (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INT NOT NULL REFERENCES branches(id),
  batch_no VARCHAR(60),
  expiry_date DATE,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id, branch_id);

-- Auth: refresh tokens & password resets
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Column additions (idempotent)
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE products SET avg_cost = purchase_price WHERE avg_cost = 0;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INT NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_tier VARCHAR(15) NOT NULL DEFAULT 'retail';

ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id INT REFERENCES shifts(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS points_earned INT NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS points_redeemed INT NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_type VARCHAR(15) NOT NULL DEFAULT 'counter';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_status VARCHAR(15);

ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS received_quantity INT NOT NULL DEFAULT 0;
UPDATE purchase_items pi SET received_quantity = pi.quantity
  FROM purchases p WHERE p.id = pi.purchase_id AND p.status = 'received' AND pi.received_quantity = 0;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_role VARCHAR(30);

-- New permissions
INSERT INTO permissions (code, label, category) VALUES
  ('manage_shifts', 'Open/close cash drawer shifts', 'sales'),
  ('manage_quotations', 'Create & manage quotations', 'sales'),
  ('view_kitchen', 'View kitchen order display', 'sales')
ON CONFLICT (code) DO NOTHING;

-- Grant to system roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('super_admin','manager') AND p.code IN ('manage_shifts','manage_quotations','view_kitchen')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'cashier' AND p.code IN ('manage_shifts','manage_quotations')
ON CONFLICT DO NOTHING;

-- New settings defaults
INSERT INTO settings (key, value) VALUES
  ('tax_mode', 'exclusive'),
  ('loyalty_enabled', 'true'),
  ('loyalty_earn_rate', '1'),        -- points per 100 currency spent
  ('loyalty_redeem_value', '1'),     -- currency value per point
  ('daily_sales_target', '50000'),
  ('audit_retention_days', '365'),
  ('kitchen_mode', 'false'),
  ('smtp_configured', 'false')
ON CONFLICT (key) DO NOTHING;
