import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { unauthorized, forbidden } from '../utils/errors.js';

/** Verify JWT and attach user (with role + permissions) to req.user */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized('Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw unauthorized('Invalid or expired session. Please sign in again.');
    }

    const { rows } = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role_id, u.branch_id, u.is_active,
              r.name AS role_name,
              COALESCE(json_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '[]') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
       GROUP BY u.id, r.name`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user) throw unauthorized('User no longer exists');
    if (!user.is_active) throw forbidden('Your account has been disabled. Contact an administrator.');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require at least one of the given permission codes (super_admin passes everything) */
export function requirePermission(...codes) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role_name === 'super_admin') return next();
    const perms = req.user.permissions || [];
    if (codes.some((c) => perms.includes(c))) return next();
    return next(forbidden());
  };
}
