import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created } from '../utils/helpers.js';
import { badRequest } from '../utils/errors.js';
import { audit, notify } from '../services/auditService.js';
import { nextNumber } from '../services/numberService.js';
import { PLANS, getSubscription, getUsage, plansForClient } from '../services/subscriptionService.js';
import { verifyLicense } from '../services/licenseService.js';

/**
 * Activate an offline license key (desktop edition).
 * Signed keys switch the subscription without a card — verified fully offline.
 */
export const activateLicense = asyncHandler(async (req, res) => {
  const result = verifyLicense(req.body?.key);
  if (!result.valid) throw badRequest(result.reason || 'Invalid license key');

  await withTransaction(async (client) => {
    const expiresAt = result.expires === 'never' ? null : new Date(result.expires + 'T23:59:59');
    await client.query(
      `UPDATE subscriptions SET plan=$1, status='active', period='yearly', started_at=NOW(),
         expires_at=$2, cancelled_at=NULL, updated_at=NOW()
       WHERE id = (SELECT id FROM subscriptions ORDER BY id DESC LIMIT 1)`,
      [result.plan, expiresAt]
    );
    const invoiceNumber = await nextNumber(client, 'billing_invoice', 'LIC');
    await client.query(
      `INSERT INTO billing_invoices (invoice_number, plan, period, amount, method, status, user_id)
       VALUES ($1,$2,'yearly',0,'license','paid',$3)`,
      [invoiceNumber, result.plan, req.user.id]
    );
    await audit({
      userId: req.user.id, action: 'license_activate', entity: 'subscription',
      description: `License activated: ${PLANS[result.plan].name} plan for "${result.customer}" (expires ${result.expires})`, ip: req.ip,
    }, client);
    await notify({ type: 'subscription', title: `License activated — ${PLANS[result.plan].name}`, message: `Licensed to ${result.customer}, valid until ${result.expires}.` }, client);
  });

  ok(res, {
    subscription: await getSubscription(),
    license: { plan: result.plan, customer: result.customer, expires: result.expires },
    message: `${PLANS[result.plan].name} license activated for ${result.customer}`,
  });
});

/** Current subscription + plan catalog + usage — powers the billing page and the frontend feature gate. */
export const getBilling = asyncHandler(async (_req, res) => {
  const [subscription, usage] = await Promise.all([getSubscription(), getUsage()]);
  ok(res, {
    subscription,
    plans: plansForClient(),
    usage,
    features: PLANS[subscription.effective_plan].features,
  });
});

/**
 * Subscribe / upgrade / downgrade with a simulated card checkout.
 * This is a demo payment processor: it validates card shape, "charges" it, and records an invoice.
 * Swap `simulateCharge` with Stripe/local gateway calls for production.
 */
export const subscribe = asyncHandler(async (req, res) => {
  const { plan, period, card } = req.body || {};
  if (!PLANS[plan]) throw badRequest('Unknown plan');
  if (!['monthly', 'yearly'].includes(period)) throw badRequest('Billing period must be monthly or yearly');

  const price = period === 'yearly' ? PLANS[plan].price_yearly : PLANS[plan].price_monthly;

  // Free plan: no payment needed
  let last4 = null;
  if (price > 0) {
    const num = String(card?.number || '').replace(/[\s-]/g, '');
    const cvc = String(card?.cvc || '');
    const exp = String(card?.expiry || '');
    if (!/^\d{13,19}$/.test(num)) throw badRequest('Enter a valid card number (13–19 digits). Use 4242 4242 4242 4242 for the demo.');
    if (!/^\d{3,4}$/.test(cvc)) throw badRequest('Enter a valid CVC');
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) throw badRequest('Expiry must be MM/YY');
    const [mm, yy] = exp.split('/').map(Number);
    if (new Date(2000 + yy, mm) < new Date()) throw badRequest('This card has expired');
    // Simulated decline for testing failure paths
    if (num.endsWith('0002')) throw badRequest('Your card was declined by the payment processor. Try a different card.');
    last4 = num.slice(-4);
  }

  const result = await withTransaction(async (client) => {
    const expires = new Date();
    if (period === 'yearly') expires.setFullYear(expires.getFullYear() + 1);
    else expires.setMonth(expires.getMonth() + 1);

    await client.query(
      `UPDATE subscriptions SET plan=$1, status='active', period=$2, started_at=NOW(),
         expires_at=$3, cancelled_at=NULL, updated_at=NOW()
       WHERE id = (SELECT id FROM subscriptions ORDER BY id DESC LIMIT 1)`,
      [plan, period, price > 0 ? expires : null]
    );

    let invoice = null;
    if (price > 0) {
      const invoiceNumber = await nextNumber(client, 'billing_invoice', 'SUB');
      const { rows } = await client.query(
        `INSERT INTO billing_invoices (invoice_number, plan, period, amount, method, card_last4, user_id)
         VALUES ($1,$2,$3,$4,'card',$5,$6) RETURNING *`,
        [invoiceNumber, plan, period, price, last4, req.user.id]
      );
      invoice = rows[0];
    }

    await audit({
      userId: req.user.id, action: 'subscription_change', entity: 'subscription',
      description: `Subscribed to ${PLANS[plan].name} (${period})${price > 0 ? ` — charged ${price}` : ' — free plan'}`,
      ip: req.ip,
    }, client);
    await notify({ type: 'subscription', title: `Plan changed to ${PLANS[plan].name}`, message: `${req.user.name} switched the subscription to ${PLANS[plan].name} (${period}).` }, client);
    return invoice;
  });

  const subscription = await getSubscription();
  created(res, { subscription, invoice: result, message: `You're now on the ${PLANS[plan].name} plan` });
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const sub = await getSubscription();
  if (sub.status === 'cancelled') throw badRequest('Subscription is already cancelled');
  await query(
    `UPDATE subscriptions SET status='cancelled', cancelled_at=NOW(), updated_at=NOW()
     WHERE id = (SELECT id FROM subscriptions ORDER BY id DESC LIMIT 1)`
  );
  await audit({ userId: req.user.id, action: 'subscription_cancel', entity: 'subscription', description: 'Subscription cancelled — reverting to Basic features', ip: req.ip });
  ok(res, { subscription: await getSubscription(), message: 'Subscription cancelled. Your data is safe — paid features are locked until you resubscribe.' });
});

export const listBillingInvoices = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT bi.*, u.name AS paid_by FROM billing_invoices bi LEFT JOIN users u ON u.id=bi.user_id
     ORDER BY bi.created_at DESC LIMIT 50`
  );
  ok(res, rows);
});
