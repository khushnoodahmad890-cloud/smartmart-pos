import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ShoppingCart, XCircle, Trash2 } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Badge, Spinner, EmptyState, Pagination, Modal, SearchInput } from '../components/ui';
import { money, fmtDate, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import { useCartStore } from '../stores/cart';
import type { Meta } from '../types';

export default function Quotations() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/quotations', { params: { search: search || undefined, status: status || undefined, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, status, page]);

  /** Load a quotation into the POS cart for conversion. */
  const convert = async (q: any) => {
    try {
      const { data } = await api.get(`/quotations/${q.id}`);
      const quote = data.data;
      const items = quote.items.map((it: any) => ({
        product_id: it.product_id, name: it.product_name, sku: it.sku, barcode: null,
        unit_price: Number(it.unit_price), tax_rate: it.tax_rate || 0,
        quantity: it.quantity, discount: 0, stock: 9999,
      }));
      useCartStore.setState({
        items, customerId: quote.customer_id, customerName: quote.customer_name || 'Walk-in Customer',
        orderDiscount: Number(quote.discount) || 0,
      });
      sessionStorage.setItem('pos-quotation-id', String(quote.id));
      toast.info(`Quotation ${quote.quote_number} loaded into POS — complete the payment to convert it`);
      navigate('/pos');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const cancel = async (q: any) => {
    try {
      await api.put(`/quotations/${q.id}/status`, { status: 'cancelled' });
      toast.success('Quotation cancelled');
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Quotations</h1>
          <p className="text-sm text-slate-400">Create quotes and convert them to sales</p>
        </div>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus size={15} /> New quotation</Button>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Quote #, customer…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All statuses</option><option value="open">Open</option>
            <option value="converted">Converted</option><option value="cancelled">Cancelled</option>
          </Select>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No quotations yet" icon={<FileText size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Quote #</th><th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 hidden md:table-cell">Items</th><th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Valid until</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Created</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-medium">{q.quote_number}</td>
                    <td className="px-4 py-3">{q.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500 max-w-[220px] truncate">
                      {q.items?.map((i: any) => `${i.product_name} ×${i.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{money(q.total)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{q.valid_until ? fmtDate(q.valid_until) : '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={q.status === 'open' ? 'blue' : q.status === 'converted' ? 'green' : 'slate'}>{q.status}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{fmtDateTime(q.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {q.status === 'open' && <>
                          <button onClick={() => convert(q)} title="Convert to sale (loads into POS)" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500"><ShoppingCart size={15} /></button>
                          <button onClick={() => cancel(q)} title="Cancel quotation" className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><XCircle size={15} /></button>
                        </>}
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

      {createOpen && <QuoteForm onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />}
    </div>
  );
}

function QuoteForm({ onClose, onSaved }: any) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<{ product: any; quantity: number; unit_price: number }[]>([]);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/customers', { params: { limit: 100 } }).then(({ data }) => setCustomers(data.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (q.length < 1) { setOptions([]); return; }
    const t = setTimeout(() => api.get('/products', { params: { search: q, limit: 8 } }).then(({ data }) => setOptions(data.data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const addLine = (p: any) => {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines([...lines, { product: p, quantity: 1, unit_price: Number(p.discount_price ?? p.selling_price) }]);
    setQ(''); setOptions([]);
  };
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const submit = async () => {
    if (!lines.length) { toast.warning('Add at least one product'); return; }
    setLoading(true);
    try {
      await api.post('/quotations', {
        customer_id: customerId ? Number(customerId) : null,
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, unit_price: l.unit_price })),
        valid_until: validUntil || null,
      });
      toast.success('Quotation created');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title="New quotation" wide>
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Select label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in / none</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Valid until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
        <div className="relative">
          <Input label="Add products" placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} />
          {options.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg max-h-48 overflow-y-auto">
              {options.map((p) => (
                <button key={p.id} type="button" onClick={() => addLine(p)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm">
                  {p.name} <span className="text-xs text-slate-400">· {money(p.selling_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-2">Product</th><th className="py-2 w-24">Qty</th><th className="py-2 w-32">Price</th>
                <th className="py-2 text-right">Total</th><th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {lines.map((l, i) => (
                <tr key={l.product.id}>
                  <td className="py-2">{l.product.name}</td>
                  <td className="py-2"><input type="number" min={1} value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                    className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" /></td>
                  <td className="py-2"><input type="number" min={0} step="0.01" value={l.unit_price}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: Math.max(0, Number(e.target.value) || 0) } : x))}
                    className="w-28 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" /></td>
                  <td className="py-2 text-right font-medium">{money(l.quantity * l.unit_price)}</td>
                  <td className="py-2 text-right"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-rose-400"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
          <span className="text-sm font-medium">Quotation total (before tax)</span>
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{money(total)}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Create quotation</Button>
        </div>
      </div>
    </Modal>
  );
}
