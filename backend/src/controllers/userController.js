import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination } from '../utils/helpers.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';
import { audit } from '../services/auditService.js';
import { revokeUserTokens } from './authController.js';
import { checkLimit } from '../services/subscriptionService.js';

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const search = (req.query.search || '').trim();
  const params = [];
  let where = 'WHERE 1=1';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
  }
  const total = (await query(`SELECT COUNT(*) FROM users u ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT u.id, u.name, u.username, u.email, u.phone, u.is_active, u.last_login, u.created_at,
            u.role_id, r.name AS role_name, u.branch_id, b.name AS branch_name
     FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN branches b ON b.id=u.branch_id
     ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, username, email, phone, password, role_id, branch_id } = req.body || {};
  if (!name || !username || !email || !password || !role_id) throw badRequest('Name, username, email, password and role are required');
  if (String(password).length < 6) throw badRequest('Password must be at least 6 characters');

  const activeUsers = (await query(`SELECT COUNT(*) FROM users WHERE is_active=TRUE`)).rows[0].count;
  await checkLimit('max_users', activeUsers);

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, username, email, phone, password_hash, role_id, branch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, username, email, phone, role_id, branch_id, is_active, created_at`,
    [name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), phone || null, hash, role_id, branch_id || null]
  );
  await audit({ userId: req.user.id, action: 'user_create', entity: 'user', entityId: rows[0].id, description: `Created user ${username}`, ip: req.ip });
  created(res, rows[0]);
});

export const updateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone, role_id, branch_id, is_active } = req.body || {};
  const target = (await query(`SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`, [id])).rows[0];
  if (!target) throw notFound('User not found');
  if (target.role_name === 'super_admin' && req.user.role_name !== 'super_admin') {
    throw forbidden('Only a super admin can modify a super admin account');
  }
  if (id === req.user.id && is_active === false) throw badRequest('You cannot disable your own account');

  const { rows } = await query(
    `UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email), phone=$3,
       role_id=COALESCE($4,role_id), branch_id=$5, is_active=COALESCE($6,is_active), updated_at=NOW()
     WHERE id=$7 RETURNING id, name, username, email, phone, role_id, branch_id, is_active`,
    [name, email, phone ?? target.phone, role_id, branch_id ?? target.branch_id, is_active, id]
  );
  if (is_active === false) await revokeUserTokens(id); // kill sessions of disabled users
  await audit({ userId: req.user.id, action: 'user_update', entity: 'user', entityId: id, description: `Updated user ${target.username}`, ip: req.ip });
  ok(res, rows[0]);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) throw badRequest('New password must be at least 6 characters');
  const target = (await query(`SELECT username FROM users WHERE id=$1`, [id])).rows[0];
  if (!target) throw notFound('User not found');
  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [hash, id]);
  await audit({ userId: req.user.id, action: 'password_reset', entity: 'user', entityId: id, description: `Reset password for ${target.username}`, ip: req.ip });
  ok(res, { message: 'Password reset successfully' });
});

export const listRoles = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id=r.id) AS user_count,
            COALESCE((SELECT json_agg(p.code) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id), '[]') AS permissions
     FROM roles r ORDER BY r.id`
  );
  ok(res, rows);
});

export const listPermissions = asyncHandler(async (_req, res) => {
  const { rows } = await query(`SELECT * FROM permissions ORDER BY category, code`);
  ok(res, rows);
});

export const createRole = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body || {};
  if (!name || !name.trim()) throw badRequest('Role name is required');
  const slug = name.trim().toLowerCase().replace(/\s+/g, '_');
  const { rows } = await query(`INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING *`, [slug, description || null]);
  if (Array.isArray(permissions) && permissions.length) {
    await query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`,
      [rows[0].id, permissions]
    );
  }
  await audit({ userId: req.user.id, action: 'role_create', entity: 'role', entityId: rows[0].id, description: `Created role ${slug}`, ip: req.ip });
  ok(res, rows[0]);
});

export const updateRolePermissions = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { permissions } = req.body || {};
  if (!Array.isArray(permissions)) throw badRequest('permissions must be a list of permission codes');
  const role = (await query(`SELECT * FROM roles WHERE id=$1`, [id])).rows[0];
  if (!role) throw notFound('Role not found');
  if (role.name === 'super_admin') throw badRequest('Super admin permissions cannot be modified');

  await query(`DELETE FROM role_permissions WHERE role_id=$1`, [id]);
  if (permissions.length) {
    await query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`,
      [id, permissions]
    );
  }
  await audit({ userId: req.user.id, action: 'permissions_update', entity: 'role', entityId: id, description: `Updated permissions for role ${role.name}`, ip: req.ip });
  ok(res, { message: 'Permissions updated' });
});
