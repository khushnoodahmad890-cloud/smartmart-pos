import { query, withTransaction } from '../db/pool.js';
import { asyncHandler, ok, created, parsePagination, round2 } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

/** Compute expected cash for a shift: float + cash sales − cash refunds + cash-in − cash-out */
async function shiftTotals(shiftId) {
  const { rows: srows } = await query(`SELECT * FROM shifts WHERE id=$1`, [shiftId]);
  const shift = srows[0];
  if (!shift) return null;

  const sales = (await query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total FROM sales WHERE shift_id=$1 AND status <> 'cancelled'`, [shiftId]
  )).rows[0];

  // Cash received on sales attached to this shift
  const cashSales = (await query(
    `SELECT COALESCE(SUM(p.amount),0) AS amount
     FROM payments p JOIN sales s ON s.id=p.reference_id AND p.reference_type='sale'
     WHERE s.shift_id=$1 AND p.method='cash' AND p.amount > 0`, [shiftId]
  )).rows[0];

  const cashRefunds = (await query(
    `SELECT COALESCE(SUM(ABS(p.amount)),0) AS amount
     FROM payments p WHERE p.reference_type='refund' AND p.method='cash' AND p.amount < 0
       AND p.user_id = $1 AND p.created_at >= $2 AND ($3::timestamptz IS NULL OR p.created_at <= $3)`,
    [shift.user_id, shift.opened_at, shift.closed_at]
  )).rows[0];

  const movements = (await query(
    `SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount ELSE -amount END),0) AS net,
            json_agg(json_build_object('id',id,'type',type,'amount',amount,'reason',reason,'created_at',created_at) ORDER BY created_at) AS list
     FROM cash_movements WHERE shift_id=$1`, [shiftId]
  )).rows[0];

  const byMethod = (await query(
    `SELECT p.method, COALESCE(SUM(p.amount),0) AS amount, COUNT(DISTINCT p.reference_id) AS count
     FROM payments p JOIN sales s ON s.id=p.reference_id AND p.reference_type='sale'
     WHERE s.shift_id=$1 AND p.amount > 0 GROUP BY p.method`, [shiftId]
  )).rows;

  const expected = round2(Number(shift.opening_float) + Number(cashSales.amount) - Number(cashRefunds.amount) + Number(movements.net || 0));
  return {
    shift, expected,
    sales_count: Number(sales.count), sales_total: Number(sales.total),
    cash_sales: Number(cashSales.amount), cash_refunds: Number(cashRefunds.amount),
    cash_movements_net: Number(movements.net || 0), movements: movements.list || [],
    by_method: byMethod,
  };
}

export const currentShift = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM shifts WHERE user_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1`, [req.user.id]
  );
  if (!rows.length) return ok(res, null);
  ok(res, await shiftTotals(rows[0].id));
});

export const openShift = asyncHandler(async (req, res) => {
  const float = round2(Number(req.body?.opening_float ?? 0));
  if (float < 0) throw badRequest('Opening float cannot be negative');
  const existing = (await query(`SELECT id FROM shifts WHERE user_id=$1 AND status='open'`, [req.user.id])).rows;
  if (existing.length) throw badRequest('You already have an open shift. Close it before opening a new one.');

  const { rows } = await query(
    `INSERT INTO shifts (branch_id, user_id, opening_float) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.branch_id || 1, req.user.id, float]
  );
  await audit({ userId: req.user.id, action: 'shift_open', entity: 'shift', entityId: rows[0].id, description: `Shift opened with float ${float}`, ip: req.ip });
  created(res, rows[0]);
});

export const cashMovement = asyncHandler(async (req, res) => {
  const { type, amount, reason } = req.body || {};
  if (!['in', 'out'].includes(type)) throw badRequest('Type must be in or out');
  const amt = round2(Number(amount));
  if (!amt || amt <= 0) throw badRequest('Amount must be positive');
  if (!reason || !reason.trim()) throw badRequest('A reason is required');

  const shift = (await query(`SELECT id FROM shifts WHERE user_id=$1 AND status='open'`, [req.user.id])).rows[0];
  if (!shift) throw badRequest('No open shift. Open a shift first.');

  await query(`INSERT INTO cash_movements (shift_id, type, amount, reason, user_id) VALUES ($1,$2,$3,$4,$5)`,
    [shift.id, type, amt, reason.trim(), req.user.id]);
  await audit({ userId: req.user.id, action: 'cash_movement', entity: 'shift', entityId: shift.id, description: `Cash ${type}: ${amt} — ${reason.trim()}`, ip: req.ip });
  ok(res, await shiftTotals(shift.id));
});

export const closeShift = asyncHandler(async (req, res) => {
  const counted = round2(Number(req.body?.closing_cash));
  if (Number.isNaN(counted) || counted < 0) throw badRequest('Enter the counted cash amount');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM shifts WHERE user_id=$1 AND status='open' FOR UPDATE`, [req.user.id]
    );
    const shift = rows[0];
    if (!shift) throw badRequest('No open shift to close');

    const totals = await shiftTotals(shift.id);
    const overShort = round2(counted - totals.expected);
    await client.query(
      `UPDATE shifts SET status='closed', closing_cash=$1, expected_cash=$2, over_short=$3, notes=$4, closed_at=NOW() WHERE id=$5`,
      [counted, totals.expected, overShort, req.body?.notes || null, shift.id]
    );
    await audit({
      userId: req.user.id, action: 'shift_close', entity: 'shift', entityId: shift.id,
      description: `Shift closed. Expected ${totals.expected}, counted ${counted}, over/short ${overShort}`, ip: req.ip,
    }, client);
    return shift.id;
  });
  ok(res, await shiftTotals(result));
});

export const listShifts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req, { limit: 20 });
  const params = [];
  let where = 'WHERE 1=1';
  const isPrivileged = req.user.role_name === 'super_admin' || (req.user.permissions || []).includes('view_reports');
  if (!isPrivileged) { params.push(req.user.id); where += ` AND s.user_id=$${params.length}`; }
  if (req.query.user_id && isPrivileged) { params.push(Number(req.query.user_id)); where += ` AND s.user_id=$${params.length}`; }

  const total = (await query(`SELECT COUNT(*) FROM shifts s ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT s.*, u.name AS user_name, b.name AS branch_name,
            (SELECT COUNT(*) FROM sales sa WHERE sa.shift_id=s.id AND sa.status <> 'cancelled') AS sales_count,
            (SELECT COALESCE(SUM(sa.total),0) FROM sales sa WHERE sa.shift_id=s.id AND sa.status <> 'cancelled') AS sales_total
     FROM shifts s JOIN users u ON u.id=s.user_id JOIN branches b ON b.id=s.branch_id
     ${where} ORDER BY s.opened_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params
  );
  ok(res, rows, { page, limit, total: Number(total) });
});

export const shiftReport = asyncHandler(async (req, res) => {
  const totals = await shiftTotals(Number(req.params.id));
  if (!totals) throw notFound('Shift not found');
  ok(res, totals);
});
