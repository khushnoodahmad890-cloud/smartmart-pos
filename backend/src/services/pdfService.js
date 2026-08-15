import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';

async function getSettings() {
  const { rows } = await query(`SELECT key, value FROM settings`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Streams a professional A4 PDF invoice for a sale. */
export async function saleInvoicePdf(sale, res) {
  const s = await getSettings();
  const sym = s.currency_symbol || 'Rs.';
  const m = (v) => `${sym} ${Number(v).toFixed(2)}`;

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${sale.invoice_number}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#312e81').text(s.business_name || 'SmartMart', { continued: false });
  doc.fontSize(9).font('Helvetica').fillColor('#555')
    .text(s.business_address || '').text(`${s.business_phone || ''}   ${s.business_email || ''}`);
  doc.moveDown(0.5);
  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#c7d2fe').stroke();
  doc.moveDown(0.8);

  // Invoice meta
  const metaY = doc.y;
  doc.fontSize(15).font('Helvetica-Bold').fillColor('#111').text('INVOICE', 48, metaY);
  doc.fontSize(10).font('Helvetica').fillColor('#333')
    .text(`Invoice #: ${sale.invoice_number}`, 48, metaY + 22)
    .text(`Date: ${new Date(sale.created_at).toLocaleString('en-GB')}`, 48, metaY + 36)
    .text(`Cashier: ${sale.cashier_name}`, 48, metaY + 50);
  doc.text(`Bill to:`, 380, metaY + 8)
    .font('Helvetica-Bold').text(sale.customer_name || 'Walk-in Customer', 380, metaY + 22)
    .font('Helvetica').text(sale.customer_phone || '', 380, metaY + 36);
  doc.moveDown(2.5);

  // Table header
  const tableTop = metaY + 80;
  const cols = { item: 48, qty: 320, price: 380, total: 480 };
  doc.rect(48, tableTop, 499, 20).fill('#eef2ff');
  doc.fillColor('#312e81').fontSize(9).font('Helvetica-Bold')
    .text('ITEM', cols.item + 6, tableTop + 6)
    .text('QTY', cols.qty, tableTop + 6)
    .text('UNIT PRICE', cols.price, tableTop + 6)
    .text('AMOUNT', cols.total, tableTop + 6);

  let y = tableTop + 26;
  doc.font('Helvetica').fontSize(9.5).fillColor('#222');
  for (const it of sale.items || []) {
    doc.text(it.product_name, cols.item + 6, y, { width: 260 })
      .text(String(it.quantity), cols.qty, y)
      .text(Number(it.unit_price).toFixed(2), cols.price, y)
      .text(Number(it.line_total).toFixed(2), cols.total, y);
    y += 18;
    if (y > 720) { doc.addPage(); y = 60; }
  }

  y += 8;
  doc.moveTo(320, y).lineTo(547, y).strokeColor('#e2e8f0').stroke();
  y += 10;
  const totalLine = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? '#111' : '#444')
      .text(label, 340, y).text(m(value), cols.total, y);
    y += bold ? 20 : 15;
  };
  totalLine('Subtotal', sale.subtotal);
  if (Number(sale.discount) > 0) totalLine('Discount', -sale.discount);
  if (Number(sale.tax) > 0) totalLine('Tax', sale.tax);
  totalLine('TOTAL', sale.total, true);
  totalLine('Paid', sale.amount_paid);
  if (Number(sale.due_amount) > 0) totalLine('Balance due', sale.due_amount);
  if (Number(sale.change_due) > 0) totalLine('Change', sale.change_due);

  doc.fontSize(8.5).fillColor('#777').text(s.receipt_footer || 'Thank you for your business!', 48, 760, { width: 499, align: 'center' });
  doc.end();
}
