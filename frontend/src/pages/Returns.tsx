import React, { useEffect, useState } from 'react';
import { Search, RotateCcw, CornerDownLeft } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Badge, Spinner, EmptyState, Pagination } from '../components/ui';
import { money, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import type { Meta } from '../types';

export default function Returns() {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Returns & Refunds</h1>
        <p className="text-sm text-slate-400">Process product returns against an invoice</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['new', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t === 'new' ? 'New return' : 'Return history'}
          </button>
        ))}
      </div>
      {tab === 'new' ? <NewReturn /> : <ReturnHistory />}
    </div>
  );
}

function NewReturn() {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [sale, setSale] = useState<any>(null);
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const find = async () => {
    if (!invoiceNo.trim()) return;
    setLoading(true); setSale(null); setQtys({});
    try {
      const { data } = await api.get('/returns/find-invoice', { params: { invoice: invoiceNo.trim() } });
      setSale(data.data);
      if (data.data.status === 'cancelled') toast.warning('This invoice was cancelled');
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  const refund = sale ? sale.items.reduce((sum: number, it: any) => {
    const q = qtys[it.id] || 0;
    return sum + (Number(it.line_total) / it.quantity) * q;
  }, 0) : 0;

  const submit = async () => {
    const items = Object.entries(qtys).filter(([, q]) => q > 0).map(([id, q]) => ({ sale_item_id: Number(id), quantity: q }));
    if (!items.length) { toast.warning('Select at least one product to return'); return; }
    if (!reason.trim()) { toast.warning('Please enter a return reason'); return; }
    setProcessing(true);
    try {
      const { data } = await api.post('/returns', { sale_id: sale.id, items, reason: reason.trim(), refund_method: method });
      toast.success(`Return ${data.data.return_number} processed — refund ${money(data.data.refund_amount)}`);
      setSale(null); setInvoiceNo(''); setQtys({}); setReason('');
    } catch (e) { toast.error(errMsg(e)); }
    setProcessing(false);
  };

  return (
    <Card className="p-5 max-w-3xl">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()}
            placeholder="Enter invoice number, e.g. INV-2026-000001"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <Button onClick={find} loading={loading}><CornerDownLeft size={15} /> Find invoice</Button>
      </div>

      {sale && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 mb-4">
            <span>Invoice: <b className="text-slate-800 dark:text-slate-200 font-mono">{sale.invoice_number}</b></span>
            <span>Customer: <b className="text-slate-800 dark:text-slate-200">{sale.customer_name || 'Walk-in'}</b></span>
            <span>Total: <b className="text-slate-800 dark:text-slate-200">{money(sale.total)}</b></span>
            <Badge color={sale.status === 'completed' ? 'green' : 'amber'}>{sale.status.replace('_', ' ')}</Badge>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-2">Product</th><th className="py-2 text-center">Sold</th>
                <th className="py-2 text-center">Already returned</th><th className="py-2 text-center">Return qty</th>
                <th className="py-2 text-right">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {sale.items.map((it: any) => {
                const returnable = it.quantity - it.returned_quantity;
                const q = qtys[it.id] || 0;
                return (
                  <tr key={it.id}>
                    <td className="py-2.5">{it.product_name}</td>
                    <td className="py-2.5 text-center">{it.quantity}</td>
                    <td className="py-2.5 text-center text-slate-400">{it.returned_quantity}</td>
                    <td className="py-2.5 text-center">
                      <input type="number" min={0} max={returnable} value={q} disabled={returnable === 0}
                        onChange={(e) => setQtys({ ...qtys, [it.id]: Math.min(returnable, Math.max(0, Number(e.target.value) || 0)) })}
                        className="w-16 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-center disabled:opacity-40" />
                    </td>
                    <td className="py-2.5 text-right font-medium">{money((Number(it.line_total) / it.quantity) * q)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <Input label="Return reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged product" />
            <Select label="Refund method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option><option value="mobile">Mobile</option>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-5 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40">
            <span className="font-medium text-rose-700 dark:text-rose-300">Total refund</span>
            <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">{money(refund)}</span>
          </div>
          <Button variant="danger" className="w-full mt-4 !py-3" onClick={submit} loading={processing} disabled={refund <= 0}>
            <RotateCcw size={16} /> Process refund
          </Button>
        </div>
      )}
    </Card>
  );
}

function ReturnHistory() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/returns', { params: { page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <Spinner />;
  if (!rows.length) return <Card><EmptyState title="No returns yet" icon={<RotateCcw size={36} />} /></Card>;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-3">Return #</th><th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Items</th><th className="px-4 py-3 text-right">Refund</th>
              <th className="px-4 py-3 hidden md:table-cell">Reason</th><th className="px-4 py-3 hidden sm:table-cell">By</th>
              <th className="px-4 py-3 hidden lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono">{r.return_number}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{r.invoice_number}</td>
                <td className="px-4 py-3 text-slate-500">{r.items?.map((i: any) => `${i.product_name} ×${i.quantity}`).join(', ')}</td>
                <td className="px-4 py-3 text-right font-semibold text-rose-500">{money(r.refund_amount)}</td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500">{r.reason}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{r.user_name}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
    </Card>
  );
}
