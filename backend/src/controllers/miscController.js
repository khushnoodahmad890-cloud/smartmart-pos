import { spawn } from 'child_process';
import { query } from '../db/pool.js';
import { asyncHandler, ok } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/auditService.js';
import { saleInvoicePdf } from '../services/pdfService.js';
import { sendMail, mailEnabled } from '../services/mailService.js';
import { env } from '../config/env.js';

async function loadSale(id) {
  const { rows } = await query(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
            u.name AS cashier_name,
            (SELECT json_agg(row_to_json(si) ORDER BY si.id) FROM sale_items si WHERE si.sale_id=s.id) AS items
     FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.user_id WHERE s.id=$1`, [id]
  );
  return rows[0];
}

export const invoicePdf = asyncHandler(async (req, res) => {
  const sale = await loadSale(Number(req.params.id));
  if (!sale) throw notFound('Invoice not found');
  await saleInvoicePdf(sale, res);
});

export const emailReceipt = asyncHandler(async (req, res) => {
  const sale = await loadSale(Number(req.params.id));
  if (!sale) throw notFound('Invoice not found');
  const to = (req.body?.email || sale.customer_email || '').trim();
  if (!to) throw badRequest('No email address — enter one or add it to the customer profile');
  if (!mailEnabled()) throw badRequest('Email is not configured on this server. Set SMTP_HOST etc. in the backend environment.');

  const settings = Object.fromEntries((await query(`SELECT key, value FROM settings`)).rows.map((r) => [r.key, r.value]));
  const sym = settings.currency_symbol || 'Rs.';
  const rowsHtml = (sale.items || []).map((it) =>
    `<tr><td style="padding:4px 8px">${it.product_name}</td><td align="center">${it.quantity}</td><td align="right">${Number(it.unit_price).toFixed(2)}</td><td align="right">${Number(it.line_total).toFixed(2)}</td></tr>`).join('');

  const result = await sendMail({
    to,
    subject: `Receipt ${sale.invoice_number} — ${settings.business_name || 'SmartMart'}`,
    html: `<div style="font-family:sans-serif;max-width:480px">
      <h2 style="color:#4338ca">${settings.business_name || 'SmartMart'}</h2>
      <p>Invoice <b>${sale.invoice_number}</b> · ${new Date(sale.created_at).toLocaleString('en-GB')}</p>
      <table width="100%" style="border-collapse:collapse;font-size:13px">
        <tr style="background:#eef2ff"><th align="left" style="padding:6px 8px">Item</th><th>Qty</th><th align="right">Price</th><th align="right">Amount</th></tr>
        ${rowsHtml}
      </table>
      <p style="text-align:right;font-size:15px"><b>Total: ${sym} ${Number(sale.total).toFixed(2)}</b></p>
      <p style="color:#666;font-size:12px">${settings.receipt_footer || 'Thank you for shopping with us!'}</p>
    </div>`,
  });
  if (!result.sent) throw badRequest(`Could not send email: ${result.reason}`);
  await audit({ userId: req.user.id, action: 'receipt_emailed', entity: 'sale', entityId: sale.id, description: `Receipt ${sale.invoice_number} emailed to ${to}`, ip: req.ip });
  ok(res, { message: `Receipt sent to ${to}` });
});

/** Stream a pg_dump SQL backup (super admin only, enforced at route level). */
export const downloadBackup = asyncHandler(async (req, res) => {
  const url = new URL(env.databaseUrl);
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="pos-backup-${new Date().toISOString().slice(0, 10)}.sql"`);

  const child = spawn('pg_dump', ['--no-owner', '--no-privileges', env.databaseUrl], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || '') },
  });
  child.stdout.pipe(res);
  let errOut = '';
  child.stderr.on('data', (d) => { errOut += d; });
  child.on('error', () => {
    if (!res.headersSent) res.status(500).json({ success: false, error: 'pg_dump is not available on this server' });
  });
  child.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) res.end(`\n-- pg_dump exited with code ${code}: ${errOut.slice(0, 300)}`);
  });
  await audit({ userId: req.user.id, action: 'backup_download', entity: 'system', description: 'Database backup downloaded', ip: req.ip });
});

/** Purge audit logs older than the retention setting. */
export const purgeAuditLogs = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT value FROM settings WHERE key='audit_retention_days'`);
  const days = Math.max(30, Number(rows[0]?.value || 365));
  const { rowCount } = await query(`DELETE FROM audit_logs WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
  await audit({ userId: req.user.id, action: 'audit_purge', entity: 'system', description: `Purged ${rowCount} audit records older than ${days} days`, ip: req.ip });
  ok(res, { purged: rowCount, retention_days: days });
});

/** Daily target progress for the dashboard. */
export const targetProgress = asyncHandler(async (req, res) => {
  const { rows: st } = await query(`SELECT value FROM settings WHERE key='daily_sales_target'`);
  const target = Number(st[0]?.value || 0);
  const { rows } = await query(
    `SELECT COALESCE(SUM(total),0) AS today FROM sales WHERE status <> 'cancelled' AND created_at >= date_trunc('day', NOW())`
  );
  ok(res, { target, today: Number(rows[0].today), pct: target > 0 ? Math.min(100, (Number(rows[0].today) / target) * 100) : 0 });
});
