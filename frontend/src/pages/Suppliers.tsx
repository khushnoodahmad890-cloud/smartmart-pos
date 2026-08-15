import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Truck, History, HandCoins } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Textarea, Badge, Spinner, EmptyState, Pagination, Modal, ConfirmDialog, SearchInput } from '../components/ui';
import { money, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import type { Supplier, Meta } from '../types';

export default function Suppliers() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') || '');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);
  const [payFor, setPayFor] = useState<Supplier | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/suppliers', { params: { search: search || undefined, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, page]);

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/suppliers/${deleting.id}`);
      toast.success('Supplier deleted');
      setDeleting(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setDeleteLoading(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Suppliers</h1>
          <p className="text-sm text-slate-400">{meta.total.toLocaleString()} suppliers</p>
        </div>
        <Button className="ml-auto" onClick={() => setEditing('new')}><Plus size={15} /> Add supplier</Button>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Company, contact, phone…" onSearch={(v) => { setSearch(v); setPage(1); }} />
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No suppliers found" icon={<Truck size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Supplier</th><th className="px-4 py-3 hidden sm:table-cell">Contact</th>
                  <th className="px-4 py-3 text-right">Total purchased</th>
                  <th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3 hidden md:table-cell">Terms</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.company_name}</p>
                      <p className="text-xs text-slate-400">{s.email || '—'}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500">
                      <p>{s.contact_person || '—'}</p><p className="text-xs">{s.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{money(s.total_purchased)}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(s.balance) > 0 ? <span className="font-semibold text-rose-500">{money(s.balance)}</span> : <Badge color="green">clear</Badge>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500">{s.payment_terms || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {Number(s.balance) > 0 && <button onClick={() => setPayFor(s)} title="Record payment" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500"><HandCoins size={15} /></button>}
                        <button onClick={() => setHistoryFor(s)} title="History" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><History size={15} /></button>
                        <button onClick={() => setEditing(s)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil size={15} /></button>
                        <button onClick={() => setDeleting(s)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Trash2 size={15} /></button>
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

      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={deleteLoading}
        danger title="Delete supplier?" confirmLabel="Delete"
        message={`Delete "${deleting?.company_name}"? Suppliers with purchase history cannot be deleted.`} />
      {historyFor && <SupplierHistory supplier={historyFor} onClose={() => setHistoryFor(null)} />}
      {payFor && <PaySupplier supplier={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); }} />}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSaved }: any) {
  const [f, setF] = useState({
    company_name: supplier?.company_name || '', contact_person: supplier?.contact_person || '',
    phone: supplier?.phone || '', email: supplier?.email || '', address: supplier?.address || '',
    tax_number: supplier?.tax_number || '', payment_terms: supplier?.payment_terms || '', notes: supplier?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (supplier) await api.put(`/suppliers/${supplier.id}`, f);
      else await api.post('/suppliers', f);
      toast.success(supplier ? 'Supplier updated' : 'Supplier created');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={supplier ? 'Edit supplier' : 'Add supplier'} wide>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <Input label="Company name *" value={f.company_name} onChange={(e) => set('company_name', e.target.value)} required autoFocus className="sm:col-span-2" />
        <Input label="Contact person" value={f.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
        <Input label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Tax number" value={f.tax_number} onChange={(e) => set('tax_number', e.target.value)} />
        <Input label="Address" value={f.address} onChange={(e) => set('address', e.target.value)} />
        <Input label="Payment terms (e.g. Net 30)" value={f.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} />
        <Textarea label="Notes" value={f.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{supplier ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function SupplierHistory({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get(`/suppliers/${supplier.id}/history`).then(({ data }) => setData(data.data)).catch((e) => toast.error(errMsg(e)));
  }, [supplier.id]);

  return (
    <Modal open onClose={onClose} title={`History — ${supplier.company_name}`} wide>
      {!data ? <Spinner /> : (
        <div className="space-y-4">
          <div className="flex gap-6 text-sm">
            <span>Outstanding balance: <b className="text-rose-500">{money(data.supplier.balance)}</b></span>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Purchases ({data.purchases.length})</h4>
            {data.purchases.length === 0 ? <p className="text-sm text-slate-400">No purchases</p> : (
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/60">
                {data.purchases.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-mono font-medium">{p.purchase_number}</span>
                      <span className="text-slate-400 ml-2 text-xs">{fmtDateTime(p.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={p.status === 'received' ? 'green' : 'amber'}>{p.status}</Badge>
                      <span className="font-semibold">{money(p.total)}</span>
                      {Number(p.total) - Number(p.amount_paid) > 0 && <span className="text-xs text-rose-400">owes {money(Number(p.total) - Number(p.amount_paid))}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {data.payments.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Direct payments</h4>
              {data.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-500">{fmtDateTime(p.created_at)} · {p.method}</span>
                  <span className="font-medium text-emerald-600">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PaySupplier({ supplier, onClose, onDone }: any) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/suppliers/${supplier.id}/pay`, { amount: Number(amount), method });
      toast.success('Payment recorded');
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Pay supplier — ${supplier.company_name}`}>
      <p className="text-sm text-slate-500 mb-3">Outstanding balance: <b className="text-rose-500">{money(supplier.balance)}</b></p>
      <div className="space-y-3">
        <Input label="Payment amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option>
          <option value="card">Card</option><option value="mobile">Mobile</option>
        </Select>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Record payment</Button>
        </div>
      </div>
    </Modal>
  );
}
