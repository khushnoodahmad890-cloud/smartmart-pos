import React from 'react';
import type { Sale } from '../types';
import { useSettingsStore } from '../stores/settings';

/** Thermal-style receipt (58/80mm friendly). Rendered inside #print-area for printing. */
export default function Receipt({ sale }: { sale: Sale }) {
  const settings = useSettingsStore((s) => s.settings);
  const sym = settings.currency_symbol || '$';
  const m = (v: any) => `${sym}${Number(v).toFixed(2)}`;
  const width = settings.receipt_width === '58mm' ? 'max-w-[220px]' : 'max-w-[300px]';

  return (
    <div className={`thermal-receipt mx-auto bg-white p-4 ${width} w-full`}>
      <div className="text-center">
        {settings.receipt_show_logo !== 'false' && settings.business_logo && (
          <img src={settings.business_logo} alt="" className="mx-auto mb-1 max-h-14 object-contain" />
        )}
        <p className="font-bold text-sm">{settings.business_name || 'SmartMart Superstore'}</p>
        <p>{settings.business_address}</p>
        <p>{settings.business_phone}</p>
      </div>
      <hr className="border-dashed border-black my-2" />
      <div>
        <p>Invoice: <b>{sale.invoice_number}</b></p>
        <p>Date: {new Date(sale.created_at).toLocaleString('en-GB')}</p>
        <p>Cashier: {sale.cashier_name}</p>
        <p>Customer: {sale.customer_name || 'Walk-in Customer'}</p>
      </div>
      <hr className="border-dashed border-black my-2" />
      <table className="w-full">
        <thead>
          <tr className="text-left border-b border-dashed border-black">
            <th className="pb-1">Item</th><th className="pb-1 text-center">Qty</th>
            <th className="pb-1 text-right">Price</th><th className="pb-1 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((it) => (
            <tr key={it.id}>
              <td className="py-0.5 pr-1">{it.product_name}{Number(it.discount) > 0 ? ` (-${m(it.discount)})` : ''}</td>
              <td className="text-center">{it.quantity}</td>
              <td className="text-right">{Number(it.unit_price).toFixed(2)}</td>
              <td className="text-right">{Number(it.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="border-dashed border-black my-2" />
      <div className="space-y-0.5">
        <p className="flex justify-between"><span>Subtotal</span><span>{m(sale.subtotal)}</span></p>
        {Number(sale.discount) > 0 && <p className="flex justify-between"><span>Discount</span><span>-{m(sale.discount)}</span></p>}
        {settings.receipt_show_tax !== 'false' && Number(sale.tax) > 0 && <p className="flex justify-between"><span>Tax</span><span>{m(sale.tax)}</span></p>}
        <p className="flex justify-between font-bold text-sm border-t border-dashed border-black pt-1 mt-1">
          <span>TOTAL</span><span>{m(sale.total)}</span>
        </p>
        <p className="flex justify-between"><span>Paid ({sale.payment_method.replace('_', ' ')})</span><span>{m(sale.amount_paid)}</span></p>
        {Number(sale.change_due) > 0 && <p className="flex justify-between"><span>Change</span><span>{m(sale.change_due)}</span></p>}
      </div>
      <hr className="border-dashed border-black my-2" />
      <p className="text-center whitespace-pre-wrap">{settings.receipt_footer || 'Thank you for shopping with us!'}</p>
      <p className="text-center mt-1">*** {sale.invoice_number} ***</p>
    </div>
  );
}
