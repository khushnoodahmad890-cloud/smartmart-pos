import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { asyncHandler, ok } from '../utils/helpers.js';
import { badRequest, unauthorized } from '../utils/errors.js';
import { audit } from '../services/auditService.js';
import { mailEnabled, sendMail } from '../services/mailService.js';

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '30m';
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 7);

function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role_name }, env.jwtSecret, { expiresIn: ACCESS_TTL });
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + REFRESH_DAYS * 86400000);
  await query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [userId, sha256(token), expires]);
  return token;
}

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw badRequest('Username and password are required');

  const { rows } = await query(
    `SELECT u.*, r.name AS role_name,
            COALESCE((SELECT json_agg(p.code) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id), '[]') AS permissions
     FROM users u JOIN roles r ON r.id=u.role_id
     WHERE (LOWER(u.username)=LOWER($1) OR LOWER(u.email)=LOWER($1))`,
    [username.trim()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized('Invalid username or password');
  }
  if (!user.is_active) throw unauthorized('Your account has been disabled. Contact an administrator.');

  await query(`UPDATE users SET last_login=NOW() WHERE id=$1`, [user.id]);
  const refreshToken = await issueRefreshToken(user.id);
  await audit({ userId: user.id, action: 'login', entity: 'user', entityId: user.id, description: `${user.name} signed in`, ip: req.ip });

  ok(res, { token: signAccess(user), refreshToken, user: publicUser(user) });
});

/** Exchange a valid refresh token for a new access token (rotates the refresh token). */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw unauthorized('Refresh token required');

  const { rows } = await query(
    `SELECT rt.*, u.is_active, r.name AS role_name, u.id AS uid
     FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id JOIN roles r ON r.id=u.role_id
     WHERE rt.token_hash=$1`, [sha256(refreshToken)]
  );
  const rt = rows[0];
  if (!rt || rt.revoked || new Date(rt.expires_at) < new Date()) throw unauthorized('Session expired. Please sign in again.');
  if (!rt.is_active) throw unauthorized('Account disabled');

  // rotate: revoke old, issue new
  await query(`UPDATE refresh_tokens SET revoked=TRUE WHERE id=$1`, [rt.id]);
  const newRefresh = await issueRefreshToken(rt.user_id);
  ok(res, { token: signAccess({ id: rt.uid, role_name: rt.role_name }), refreshToken: newRefresh });
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) await query(`UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=$1`, [sha256(refreshToken)]);
  await audit({ userId: req.user.id, action: 'logout', entity: 'user', entityId: req.user.id, description: `${req.user.name} signed out`, ip: req.ip });
  ok(res, { message: 'Signed out' });
});

/** Revoke all refresh tokens for a user (used when disabling accounts). */
export async function revokeUserTokens(userId) {
  await query(`UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1 AND revoked=FALSE`, [userId]);
}

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) throw badRequest('Email is required');
  const { rows } = await query(`SELECT id, name, email FROM users WHERE LOWER(email)=LOWER($1) AND is_active=TRUE`, [email.trim()]);
  const user = rows[0];

  // Always respond identically to avoid leaking which emails exist
  const generic = { message: 'If that email is registered, password reset instructions have been sent.' };
  if (!user) return ok(res, generic);

  const token = crypto.randomBytes(32).toString('hex');
  await query(`INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2,NOW() + INTERVAL '1 hour')`, [user.id, token]);

  const resetUrl = `${req.headers.origin || ''}/reset-password?token=${token}`;
  const mail = await sendMail({
    to: user.email,
    subject: 'Password reset — SmartMart POS',
    html: `<p>Hello ${user.name},</p><p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });

  await audit({ userId: user.id, action: 'password_reset_request', entity: 'user', entityId: user.id, description: 'Password reset requested', ip: req.ip });

  if (!mailEnabled() && !env.isProd) {
    // Dev/demo convenience: no SMTP configured, so surface the token directly
    return ok(res, { ...generic, dev_reset_token: token, note: 'SMTP not configured — token returned for demo use only.' });
  }
  ok(res, generic);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) throw badRequest('Token and new password are required');
  if (String(newPassword).length < 6) throw badRequest('Password must be at least 6 characters');

  const { rows } = await query(
    `SELECT * FROM password_resets WHERE token=$1 AND used=FALSE AND expires_at > NOW()`, [token]
  );
  const pr = rows[0];
  if (!pr) throw badRequest('This reset link is invalid or has expired. Request a new one.');

  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [hash, pr.user_id]);
  await query(`UPDATE password_resets SET used=TRUE WHERE id=$1`, [pr.id]);
  await revokeUserTokens(pr.user_id);
  await audit({ userId: pr.user_id, action: 'password_reset', entity: 'user', entityId: pr.user_id, description: 'Password reset via token', ip: req.ip });
  ok(res, { message: 'Password reset successfully. You can now sign in.' });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.username, u.email, u.phone, u.role_id, u.branch_id, u.is_active, u.last_login, u.created_at,
            r.name AS role_name,
            COALESCE((SELECT json_agg(p.code) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id), '[]') AS permissions
     FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
    [req.user.id]
  );
  ok(res, rows[0]);
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw badRequest('Current and new password are required');
  if (String(newPassword).length < 6) throw badRequest('New password must be at least 6 characters');

  const { rows } = await query(`SELECT password_hash FROM users WHERE id=$1`, [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) throw badRequest('Current password is incorrect');

  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [hash, req.user.id]);
  await audit({ userId: req.user.id, action: 'change_password', entity: 'user', entityId: req.user.id, description: 'Password changed', ip: req.ip });
  ok(res, { message: 'Password updated successfully' });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !name.trim()) throw badRequest('Name is required');
  const { rows } = await query(
    `UPDATE users SET name=$1, phone=$2, updated_at=NOW() WHERE id=$3 RETURNING id, name, username, email, phone`,
    [name.trim(), phone || null, req.user.id]
  );
  ok(res, rows[0]);
});
