import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Users, History, Star, HandCoins } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Textarea, Badge, Spinner, EmptyState, Pagination, Modal, ConfirmDialog, SearchInput } from '../components/ui';
import { money, fmtDate, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import type { Customer, Meta } from '../types';

export default function Customers() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Customer[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') || '');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [payFor, setPayFor] = useState<Customer | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/customers', { params: { search: search || undefined, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, page]);

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/customers/${deleting.id}`);
      toast.success('Customer deleted');
      setDeleting(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setDeleteLoading(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-sm text-slate-400">{meta.total.toLocaleString()} registered customers</p>
        </div>
        <Button className="ml-auto" onClick={() => setEditing('new')}><Plus size={15} /> Add customer</Button>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Name, phone, email…" onSearch={(v) => { setSearch(v); setPage(1); }} />
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No customers found" icon={<Users size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Customer</th><th className="px-4 py-3 hidden sm:table-cell">Phone</th>
                  <th className="px-4 py-3 text-right">Total purchases</th>
                  <th className="px-4 py-3 text-right">Owes</th>
                  <th className="px-4 py-3 text-center hidden md:table-cell">Points</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Tier</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{c.code}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(c.total_purchases)}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(c.outstanding_balance) > 0 ? <span className="font-semibold text-rose-500">{money(c.outstanding_balance)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {Number((c as any).loyalty_points) > 0 ? <span className="text-amber-500 font-medium inline-flex items-center gap-1"><Star size={12} /> {(c as any).loyalty_points}</span> : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <Badge color={(c as any).price_tier === 'wholesale' ? 'purple' : 'slate'}>{(c as any).price_tier || 'retail'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {Number(c.outstanding_balance) > 0 && (
                          <button onClick={() => setPayFor(c)} title="Receive credit payment" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500"><HandCoins size={15} /></button>
                        )}
                        <button onClick={() => setHistoryFor(c)} title="Purchase history" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><History size={15} /></button>
                        <button onClick={() => setEditing(c)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil size={15} /></button>
                        <button onClick={() => setDeleting(c)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Trash2 size={15} /></button>
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

      {editing && <CustomerForm customer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={deleteLoading}
        danger title="Delete customer?" confirmLabel="Delete"
        message={`Delete "${deleting?.name}"? Customers with purchase history cannot be deleted and should be deactivated instead.`} />
      {historyFor && <HistoryModal customer={historyFor} onClose={() => setHistoryFor(null)} />}
      {payFor && <CreditPaymentModal customer={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); }} />}
    </div>
  );
}

/** Receive payment against a customer's oldest unpaid credit invoices. */
function CreditPaymentModal({ customer, onClose, onDone }: any) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/sales', { params: { customer_id: customer.id, unpaid: 'true', limit: 20 } })
      .then(({ data }) => {
        setInvoices(data.data);
        if (data.data.length) { setSelected(data.data[0]); setAmount(String(data.data[0].due_amount)); }
      }).catch(() => {});
  }, [customer.id]);

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await api.post(`/sales/${selected.id}/pay-due`, { amount: Number(amount), method });
      toast.success('Payment received');
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Receive payment — ${customer.name}`}>
      <p className="text-sm text-slate-500 mb-3">Outstanding balance: <b className="text-rose-500">{money(customer.outstanding_balance)}</b></p>
      {invoices.length === 0 ? <p className="text-sm text-slate-400">No unpaid invoices found</p> : (
        <div className="space-y-3">
          <Select label="Unpaid invoice" value={selected?.id || ''} onChange={(e) => {
            const inv = invoices.find((i) => i.id === Number(e.target.value));
            setSelected(inv); if (inv) setAmount(String(inv.due_amount));
          }}>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number} — due {money(i.due_amount)}</option>)}
          </Select>
          <Input label="Amount received" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option><option value="mobile">Mobile</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={loading}>Receive payment</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CustomerForm({ customer, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '',
    address: customer?.address || '', notes: customer?.notes || '',
    price_tier: customer?.price_tier || 'retail',
  });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (customer) await api.put(`/customers/${customer.id}`, f);
      else await api.post('/customers', f);
      toast.success(customer ? 'Customer updated' : 'Customer created');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={customer ? 'Edit customer' : 'Add customer'}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Name *" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <Input label="Address" value={f.address} onChange={(e) => set('address', e.target.value)} />
        <Select label="Price tier" value={f.price_tier} onChange={(e) => set('price_tier', e.target.value)}>
          <option value="retail">Retail (standard prices)</option>
          <option value="wholesale">Wholesale (wholesale prices where set)</option>
        </Select>
        <Textarea label="Notes" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{customer ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get(`/customers/${customer.id}/history`).then(({ data }) => setData(data.data)).catch((e) => toast.error(errMsg(e)));
  }, [customer.id]);

  return (
    <Modal open onClose={onClose} title={`History — ${customer.name}`} wide>
      {!data ? <Spinner /> : (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Invoices ({data.sales.length})</h4>
            {data.sales.length === 0 ? <p className="text-sm text-slate-400">No purchases yet</p> : (
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/60">
                {data.sales.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-mono font-medium">{s.invoice_number}</span>
                      <span className="text-slate-400 ml-2 text-xs">{fmtDateTime(s.created_at)} · {s.cashier_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={s.status === 'completed' ? 'green' : s.status === 'cancelled' ? 'red' : 'amber'}>{s.status}</Badge>
                      <span className="font-semibold">{money(s.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {data.returns.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Returns</h4>
              {data.returns.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="font-mono">{r.return_number} <span className="text-slate-400 text-xs">against {r.invoice_number}</span></span>
                  <span className="text-rose-500 font-medium">−{money(r.refund_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
