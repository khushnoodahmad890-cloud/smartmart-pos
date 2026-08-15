import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { asyncHandler, ok, created } from '../utils/helpers.js';
import { badRequest, notFound, unauthorized } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- API keys ----------
export const listApiKeys = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT k.id, k.name, k.key_prefix, k.revoked, k.last_used_at, k.created_at, u.name AS created_by
     FROM api_keys k LEFT JOIN users u ON u.id = k.created_by ORDER BY k.created_at DESC`
  );
  ok(res, rows);
});

export const createApiKey = asyncHandler(async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) throw badRequest('Give the key a name (e.g. "Accounting integration")');
  const raw = `pos_${crypto.randomBytes(24).toString('hex')}`;
  await query(
    `INSERT INTO api_keys (name, key_prefix, key_hash, created_by) VALUES ($1,$2,$3,$4)`,
    [name, raw.slice(0, 10), sha256(raw), req.user.id]
  );
  await audit({ userId: req.user.id, action: 'api_key_create', entity: 'api_key', description: `Created API key "${name}"`, ip: req.ip });
  // The full key is shown ONCE — only the hash is stored.
  created(res, { key: raw, message: 'Copy this key now — it will not be shown again.' });
});

export const revokeApiKey = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`UPDATE api_keys SET revoked = TRUE WHERE id=$1`, [Number(req.params.id)]);
  if (!rowCount) throw notFound('API key not found');
  await audit({ userId: req.user.id, action: 'api_key_revoke', entity: 'api_key', entityId: req.params.id, description: `Revoked API key #${req.params.id}`, ip: req.ip });
  ok(res, { message: 'Key revoked' });
});

/** Middleware alternative to JWT: X-API-Key header for machine integrations (read-only endpoints). */
export async function apiKeyAuth(req, _res, next) {
  try {
    const key = req.headers['x-api-key'];
    if (!key) return next(unauthorized('API key required'));
    const { rows } = await query(`SELECT * FROM api_keys WHERE key_hash=$1 AND revoked=FALSE`, [sha256(String(key))]);
    if (!rows.length) return next(unauthorized('Invalid or revoked API key'));
    await query(`UPDATE api_keys SET last_used_at=NOW() WHERE id=$1`, [rows[0].id]);
    req.apiKey = rows[0];
    next();
  } catch (e) { next(e); }
}

// ---------- Webhooks ----------
export const listWebhooks = asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT * FROM webhooks ORDER BY created_at DESC`);
  ok(res, rows);
});

export const createWebhook = asyncHandler(async (req, res) => {
  const { url, event } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) throw badRequest('Enter a valid http(s) URL');
  const ev = ['sale.created', 'sale.cancelled', 'refund.created', 'stock.low'].includes(event) ? event : 'sale.created';
  const { rows } = await query(`INSERT INTO webhooks (url, event) VALUES ($1,$2) RETURNING *`, [url, ev]);
  await audit({ userId: req.user.id, action: 'webhook_create', entity: 'webhook', entityId: rows[0].id, description: `Webhook ${ev} → ${url}`, ip: req.ip });
  created(res, rows[0]);
});

export const deleteWebhook = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM webhooks WHERE id=$1`, [Number(req.params.id)]);
  if (!rowCount) throw notFound('Webhook not found');
  ok(res, { message: 'Webhook deleted' });
});

/** Fire-and-forget webhook dispatch (called from sale flow). */
export async function fireWebhooks(event, payload) {
  try {
    const { rows } = await query(`SELECT * FROM webhooks WHERE event=$1 AND is_active=TRUE`, [event]);
    for (const hook of rows) {
      fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-POS-Event': event },
        body: JSON.stringify({ event, data: payload, fired_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      }).then((r) => query(`UPDATE webhooks SET last_status=$1, last_fired_at=NOW() WHERE id=$2`, [r.status, hook.id]))
        .catch(() => query(`UPDATE webhooks SET last_status=0, last_fired_at=NOW() WHERE id=$1`, [hook.id]).catch(() => {}));
    }
  } catch (e) { console.error('webhook dispatch failed:', e.message); }
}

// ---------- Cashier PIN switching ----------
export const setPin = asyncHandler(async (req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{4,6}$/.test(pin)) throw badRequest('PIN must be 4–6 digits');
  const hash = await bcrypt.hash(pin, 8);
  await query(`UPDATE users SET pin_hash=$1, updated_at=NOW() WHERE id=$2`, [hash, req.user.id]);
  await audit({ userId: req.user.id, action: 'pin_set', entity: 'user', entityId: req.user.id, description: 'Quick-switch PIN set', ip: req.ip });
  ok(res, { message: 'PIN saved. You can now switch users quickly at the POS.' });
});

/** List users that have a PIN (for the switch screen — no sensitive data). */
export const pinUsers = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = TRUE AND u.pin_hash IS NOT NULL ORDER BY u.name`
  );
  ok(res, rows);
});

/** Exchange user_id + PIN for a fresh session (fast cashier switching). */
export const pinLogin = asyncHandler(async (req, res) => {
  const { user_id, pin } = req.body || {};
  if (!user_id || !pin) throw badRequest('User and PIN are required');
  const { rows } = await query(
    `SELECT u.*, r.name AS role_name,
            COALESCE((SELECT json_agg(p.code) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id), '[]') AS permissions
     FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.is_active=TRUE`, [user_id]
  );
  const user = rows[0];
  if (!user?.pin_hash || !(await bcrypt.compare(String(pin), user.pin_hash))) {
    throw unauthorized('Incorrect PIN');
  }
  await query(`UPDATE users SET last_login=NOW() WHERE id=$1`, [user.id]);
  await audit({ userId: user.id, action: 'pin_login', entity: 'user', entityId: user.id, description: `${user.name} switched in via PIN`, ip: req.ip });
  const token = jwt.sign({ sub: user.id, role: user.role_name }, env.jwtSecret, { expiresIn: '8h' });
  const { password_hash, pin_hash, ...pub } = user;
  ok(res, { token, user: pub });
});
