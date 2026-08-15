-- ============================================================
-- SaaS billing: subscriptions + billing invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  plan VARCHAR(20) NOT NULL DEFAULT 'basic',          -- basic, standard, pro
  status VARCHAR(20) NOT NULL DEFAULT 'active',       -- trial, active, cancelled
  period VARCHAR(10) NOT NULL DEFAULT 'monthly',      -- monthly, yearly
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL,
  period VARCHAR(10) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(30) NOT NULL DEFAULT 'card',
  card_last4 VARCHAR(4),
  status VARCHAR(15) NOT NULL DEFAULT 'paid',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Start every fresh install on a 14-day Pro trial
INSERT INTO subscriptions (plan, status, period, expires_at)
SELECT 'pro', 'trial', 'monthly', NOW() + INTERVAL '14 days'
WHERE NOT EXISTS (SELECT 1 FROM subscriptions);

-- Billing permission (super admin implicitly has it; grant explicitly too)
INSERT INTO permissions (code, label, category) VALUES
  ('manage_billing', 'Manage subscription & billing', 'admin')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin' AND p.code = 'manage_billing'
ON CONFLICT DO NOTHING;
