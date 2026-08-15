import { query } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';

/**
 * Plan catalog — single source of truth for features, limits and pricing.
 * Feature gating is enforced here (server-side); the frontend only mirrors it for UX.
 */
export const PLANS = {
  basic: {
    name: 'Basic',
    rank: 0,
    price_monthly: 0,
    price_yearly: 0,
    tagline: 'For a single small shop getting started',
    features: [
      'pos', 'products', 'inventory', 'customers', 'sales_history', 'returns',
      'barcode_labels', 'held_sales', 'dashboard',
    ],
    limits: { max_users: 2, max_products: 100, max_branches: 1 },
  },
  standard: {
    name: 'Standard',
    rank: 1,
    price_monthly: 29,
    price_yearly: 290,
    tagline: 'For growing stores that need purchasing & reporting',
    features: [
      'pos', 'products', 'inventory', 'customers', 'sales_history', 'returns',
      'barcode_labels', 'held_sales', 'dashboard',
      'suppliers', 'purchases', 'expenses', 'reports', 'shifts', 'quotations', 'pdf_invoices',
    ],
    limits: { max_users: 5, max_products: 1000, max_branches: 2 },
  },
  pro: {
    name: 'Pro',
    rank: 2,
    price_monthly: 59,
    price_yearly: 590,
    tagline: 'Full platform for multi-branch & specialty businesses',
    features: [
      'pos', 'products', 'inventory', 'customers', 'sales_history', 'returns',
      'barcode_labels', 'held_sales', 'dashboard',
      'suppliers', 'purchases', 'expenses', 'reports', 'shifts', 'quotations', 'pdf_invoices',
      'loyalty', 'kitchen', 'batch_expiry', 'price_tiers', 'audit_logs', 'backup',
      'email_receipts', 'multi_branch',
    ],
    limits: { max_users: Infinity, max_products: Infinity, max_branches: Infinity },
  },
};

/** Human labels used in upgrade error messages. */
export const FEATURE_LABELS = {
  suppliers: 'Supplier management', purchases: 'Purchase management', expenses: 'Expense tracking',
  reports: 'Reports & analytics', shifts: 'Shifts & cash drawer', quotations: 'Quotations',
  pdf_invoices: 'PDF invoices', loyalty: 'Loyalty program', kitchen: 'Kitchen display',
  batch_expiry: 'Batch & expiry tracking', price_tiers: 'Wholesale price tiers',
  audit_logs: 'Audit logs', backup: 'Database backup', email_receipts: 'Email receipts',
  multi_branch: 'Multiple branches',
};

/** Lowest plan that includes a feature (for error messages / UI). */
export function requiredPlanFor(feature) {
  for (const key of ['basic', 'standard', 'pro']) {
    if (PLANS[key].features.includes(feature)) return key;
  }
  return 'pro';
}

/**
 * Load the current subscription row and compute the EFFECTIVE plan:
 * expired or cancelled subscriptions fall back to Basic (data is never blocked, features are).
 */
export async function getSubscription() {
  const { rows } = await query(`SELECT * FROM subscriptions ORDER BY id DESC LIMIT 1`);
  const sub = rows[0] || { plan: 'basic', status: 'active', expires_at: null };
  const expired = sub.expires_at && new Date(sub.expires_at) < new Date();
  const effectivePlan = (sub.status === 'cancelled' || expired) ? 'basic' : sub.plan;
  return {
    ...sub,
    effective_plan: effectivePlan,
    is_expired: Boolean(expired),
    days_left: sub.expires_at ? Math.max(0, Math.ceil((new Date(sub.expires_at) - new Date()) / 86400000)) : null,
  };
}

export async function hasFeature(feature) {
  const sub = await getSubscription();
  return PLANS[sub.effective_plan].features.includes(feature);
}

/** Express middleware: block the route unless the current plan includes the feature. */
export function requireFeature(feature) {
  return async (_req, _res, next) => {
    try {
      const sub = await getSubscription();
      if (PLANS[sub.effective_plan].features.includes(feature)) return next();
      const plan = requiredPlanFor(feature);
      const err = new ApiError(
        402,
        `${FEATURE_LABELS[feature] || feature} is available on the ${PLANS[plan].name} plan and above. Your current plan: ${PLANS[sub.effective_plan].name}.`,
        'UPGRADE_REQUIRED'
      );
      err.feature = feature;
      err.required_plan = plan;
      next(err);
    } catch (e) { next(e); }
  };
}

/** Throw a 402 if adding `adding` more of `kind` would exceed the plan limit. */
export async function checkLimit(kind, currentCount, adding = 1) {
  const sub = await getSubscription();
  const limit = PLANS[sub.effective_plan].limits[kind];
  if (limit !== Infinity && Number(currentCount) + adding > limit) {
    const labels = { max_users: 'users', max_products: 'products', max_branches: 'branches' };
    throw new ApiError(
      402,
      `Your ${PLANS[sub.effective_plan].name} plan allows up to ${limit} ${labels[kind]}. Upgrade your subscription to add more.`,
      'UPGRADE_REQUIRED'
    );
  }
}

/** Usage counters for the billing page. */
export async function getUsage() {
  const [users, products, branches] = await Promise.all([
    query(`SELECT COUNT(*) FROM users WHERE is_active=TRUE`),
    query(`SELECT COUNT(*) FROM products WHERE is_deleted=FALSE`),
    query(`SELECT COUNT(*) FROM branches WHERE is_active=TRUE`),
  ]);
  return {
    users: Number(users.rows[0].count),
    products: Number(products.rows[0].count),
    branches: Number(branches.rows[0].count),
  };
}

/** Serializable plan catalog for the frontend (Infinity → null). */
export function plansForClient() {
  return Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, {
    ...p,
    limits: Object.fromEntries(Object.entries(p.limits).map(([lk, lv]) => [lk, lv === Infinity ? null : lv])),
  }]));
}
