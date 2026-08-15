import { query } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

export const EXPENSE_CATEGORIES = ['rent', 'electricity', 'internet', 'salaries', 'transportation', 'maintenance', 'marketing', 'other'];

export const listExpenses = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const search = (req.query.search || '').trim();
  if (search) { params.push(`%${search}%`); where += ` AND (e.name ILIKE $${params.length} OR e.description ILIKE $${params.length})`; }
  if (req.query.category) { params.push(req.query.category); where += ` AND e.category=$${params.length}`; }
  if (req.query.from) { params.push(req.query.from); where += ` AND e.expense_date >= $${params.length}::date`; }
  if (req.query.to) { params.push(req.query.to); where += ` AND e.expense_date <= $${params.length}::date`; }

  const total = (await query(`SELECT COUNT(*) FROM expenses e ${where}`, params)).rows[0].count;
  const sum = (await query(`SELECT COALESCE(SUM(e.amount),0) AS total_amount FROM expenses e ${where}`, params)).rows[0].total_amount;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT e.*, u.name AS created_by FROM expenses e LEFT JOIN users u ON u.id=e.user_id
     ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  ok(res, rows, { page, limit, total: Number(total), total_amount: Number(sum) });
});

export const createExpense = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.name.trim()) throw badRequest('Expense name is required');
  const amount = round2(Number(b.amount));
  if (!amount || amount <= 0) throw badRequest('Amount must be positive');
  const category = EXPENSE_CATEGORIES.includes(b.category) ? b.category : 'other';

  const { rows } = await query(
    `INSERT INTO expenses (branch_id, name, category, amount, description, payment_method, expense_date, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8) RETURNING *`,
    [b.branch_id || req.user.branch_id || 1, b.name.trim(), category, amount, b.description || null,
     b.payment_method || 'cash', b.expense_date || null, req.user.id]
  );
  await audit({ userId: req.user.id, action: 'expense_create', entity: 'expense', entityId: rows[0].id, description: `Expense "${b.name}" — ${amount}`, ip: req.ip });
  created(res, rows[0]);
});

export const updateExpense = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = (await query(`SELECT * FROM expenses WHERE id=$1`, [id])).rows[0];
  if (!existing) throw notFound('Expense not found');
  const { rows } = await query(
    `UPDATE expenses SET name=COALESCE($1,name), category=COALESCE($2,category), amount=COALESCE($3,amount),
       description=$4, payment_method=COALESCE($5,payment_method), expense_date=COALESCE($6::date,expense_date)
     WHERE id=$7 RETURNING *`,
    [b.name?.trim(), b.category, b.amount !== undefined ? round2(Number(b.amount)) : null,
     b.description ?? existing.description, b.payment_method, b.expense_date || null, id]
  );
  ok(res, rows[0]);
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = (await query(`SELECT name, amount FROM expenses WHERE id=$1`, [id])).rows[0];
  if (!existing) throw notFound('Expense not found');
  await query(`DELETE FROM expenses WHERE id=$1`, [id]);
  await audit({ userId: req.user.id, action: 'expense_delete', entity: 'expense', entityId: id, description: `Deleted expense "${existing.name}" (${existing.amount})`, ip: req.ip });
  ok(res, { message: 'Expense deleted' });
});
