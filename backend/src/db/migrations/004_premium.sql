-- ============================================================
-- Premium pack: promotions, API keys, webhooks, cashier PINs,
-- receipt customization & onboarding settings
-- ============================================================

CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL,               -- percent_product, percent_category, bogo
  product_id INT REFERENCES products(id) ON DELETE CASCADE,
  category_id INT REFERENCES categories(id) ON DELETE CASCADE,
  percent NUMERIC(5,2),                    -- for percent_* types
  buy_qty INT,                             -- for bogo: buy N
  free_qty INT,                            -- for bogo: get M free
  starts_on DATE,
  ends_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  event VARCHAR(40) NOT NULL DEFAULT 'sale.created',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_status INT,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(200);

INSERT INTO settings (key, value) VALUES
  ('onboarding_done', 'false'),
  ('business_logo', ''),
  ('receipt_show_logo', 'true'),
  ('receipt_show_tax', 'true'),
  ('weight_barcode_prefix', '21'),
  ('scan_sounds', 'true')
ON CONFLICT (key) DO NOTHING;
