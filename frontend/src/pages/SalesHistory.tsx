import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Printer, Ban, Receipt as ReceiptIcon, Download } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Badge, Button, Select, Input, Spinner, EmptyState, Pagination, ConfirmDialog, SearchInput } from '../components/ui';
import { money, fmtDateTime, downloadCSV } from '../utils/format';
import { toast } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { ReceiptModal } from './POS';
import type { Sale, Meta } from '../types';

const statusColor: Record<string, 'green' | 'red' | 'amber' | 'blue'> = {
  completed: 'green', cancelled: 'red', partially_returned: 'amber', returned: 'blue',
};

export default function SalesHistory() {
  const [params] = useSearchParams();
  const [sales, setSales] = useState<Sale[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const can = useAuthStore((s) => s.can);

  const load = () => {
    setLoading(true);
    api.get('/sales', { params: { search: search || undefined, status: status || undefined, payment_method: method || undefined, from: from || undefined, to: to || undefined, page, limit: 20 } })
      .then(({ data }) => { setSales(data.data); setMeta(data.meta); })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, status, method, from, to, page]);

  const openSale = async (id: number) => {
    try { const { data } = await api.get(`/sales/${id}`); setViewSale(data.data); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const doCancel = async () => {
    if (!cancelId) return;
    setCancelLoading(true);
    try {
      await api.post(`/sales/${cancelId}/cancel`);
      toast.success('Sale cancelled — inventory restored');
      setCancelId(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setCancelLoading(false);
  };

  const exportCSV = () => {
    downloadCSV('sales.csv',
      ['Invoice', 'Customer', 'Cashier', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment', 'Status', 'Date'],
      sales.map((s) => [s.invoice_number, s.customer_name || 'Walk-in', s.cashier_name || '', s.subtotal, s.discount, s.tax, s.total, s.payment_method, s.status, fmtDateTime(s.created_at)]));
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Sales History</h1>
          <p className="text-sm text-slate-400">{meta.total.toLocaleString()} transactions</p>
        </div>
        <Button variant="secondary" className="ml-auto" onClick={exportCSV}><Download size={15} /> Export CSV</Button>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Invoice #, customer…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All statuses</option>
            <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            <option value="partially_returned">Partially returned</option><option value="returned">Returned</option>
          </Select>
          <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All payments</option>
            <option value="cash">Cash</option><option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option><option value="mobile">Mobile</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="!w-auto" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="!w-auto" />
        </div>

        {loading ? <Spinner /> : sales.length === 0 ? (
          <EmptyState title="No sales found" subtitle="Adjust your filters or make a sale in the POS" icon={<ReceiptIcon size={40} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 hidden md:table-cell">Cashier</th><th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Payment</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Date</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-medium">{s.invoice_number}</td>
                    <td className="px-4 py-3">{s.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500">{s.cashier_name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(s.total)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell capitalize text-slate-500">{s.payment_method.replace('_', ' ')}</td>
                    <td className="px-4 py-3"><Badge color={statusColor[s.status] || 'slate'}>{s.status.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{fmtDateTime(s.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openSale(s.id)} title="View / print invoice" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Eye size={15} /></button>
                        {can('delete_sale') && s.status === 'completed' && (
                          <button onClick={() => setCancelId(s.id)} title="Cancel sale" className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Ban size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
      </Card>

      {viewSale && <ReceiptModal sale={viewSale} onClose={() => setViewSale(null)} />}
      <ConfirmDialog open={!!cancelId} onClose={() => setCancelId(null)} onConfirm={doCancel} loading={cancelLoading}
        title="Cancel this sale?" danger confirmLabel="Cancel sale"
        message="The sale will be marked as cancelled and all sold items will be returned to inventory. The financial record is kept for auditing. This cannot be undone." />
    </div>
  );
}
