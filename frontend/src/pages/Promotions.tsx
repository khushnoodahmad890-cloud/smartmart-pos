import React, { useEffect, useState } from 'react';
import { Plus, Tag, Trash2, Power } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Badge, Spinner, EmptyState, Modal, ConfirmDialog } from '../components/ui';
import { fmtDate } from '../utils/format';
import { toast } from '../stores/toast';

export default function Promotions() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/promotions').then(({ data }) => setRows(data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = async (r: any) => {
    try {
      await api.put(`/promotions/${r.id}`, { is_active: !r.is_active });
      toast.success(`Promotion ${r.is_active ? 'paused' : 'activated'}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/promotions/${deleting.id}`);
      toast.success('Promotion deleted');
      setDeleting(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setDeleteLoading(false);
  };

  const describe = (r: any) => {
    if (r.type === 'percent_product') return `${Number(r.percent)}% off ${r.product_name}`;
    if (r.type === 'percent_category') return `${Number(r.percent)}% off everything in ${r.category_name}`;
    if (r.type === 'bogo') return `Buy ${r.buy_qty} ${r.product_name}, get ${r.free_qty} free`;
    return r.type;
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Promotions</h1>
          <p className="text-sm text-slate-400">Automatic offers applied at the POS — % discounts and Buy-X-Get-Y</p>
        </div>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus size={15} /> New promotion</Button>
      </div>

      <Card>
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="No promotions yet" subtitle='Create your first offer — e.g. "20% off Beverages" or "Buy 2 Get 1 Free"' icon={<Tag size={40} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Promotion</th><th className="px-4 py-3">Offer</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Valid</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-slate-500">{describe(r)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500">
                      {r.starts_on || r.ends_on ? `${r.starts_on ? fmtDate(r.starts_on) : '…'} → ${r.ends_on ? fmtDate(r.ends_on) : '…'}` : 'Always'}
                    </td>
                    <td className="px-4 py-3"><Badge color={r.is_active ? 'green' : 'slate'}>{r.is_active ? 'active' : 'paused'}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => toggle(r)} title={r.is_active ? 'Pause' : 'Activate'} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><Power size={15} /></button>
                        <button onClick={() => setDeleting(r)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {createOpen && <PromoForm onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={deleteLoading}
        danger title="Delete promotion?" confirmLabel="Delete" message={`Delete "${deleting?.name}"? It will stop applying immediately.`} />
    </div>
  );
}

function PromoForm({ onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ name: '', type: 'percent_product', percent: '', buy_qty: '2', free_qty: '1', starts_on: '', ends_on: '' });
  const [product, setProduct] = useState<any>(null);
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  useEffect(() => { api.get('/categories').then(({ data }) => setCategories(data.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (q.length < 1) { setOptions([]); return; }
    const t = setTimeout(() => api.get('/products', { params: { search: q, limit: 8 } }).then(({ data }) => setOptions(data.data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/promotions', {
        name: f.name, type: f.type,
        product_id: product?.id, category_id: categoryId ? Number(categoryId) : undefined,
        percent: f.percent ? Number(f.percent) : undefined,
        buy_qty: Number(f.buy_qty), free_qty: Number(f.free_qty),
        starts_on: f.starts_on || null, ends_on: f.ends_on || null,
      });
      toast.success('Promotion created — it applies at the POS immediately');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title="New promotion">
      <div className="space-y-3">
        <Input label="Promotion name *" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder='e.g. "Weekend Beverage Sale"' />
        <Select label="Offer type" value={f.type} onChange={(e) => set('type', e.target.value)}>
          <option value="percent_product">% off a specific product</option>
          <option value="percent_category">% off a whole category</option>
          <option value="bogo">Buy X get Y free (same product)</option>
        </Select>

        {f.type === 'percent_category' ? (
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— select category —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        ) : (
          <div className="relative">
            <Input label="Product" placeholder="Search product…"
              value={product ? product.name : q}
              onChange={(e) => { setProduct(null); setQ(e.target.value); }} />
            {options.length > 0 && !product && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg max-h-44 overflow-y-auto">
                {options.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setProduct(p); setOptions([]); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm">{p.name}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {f.type.startsWith('percent') ? (
          <Input label="Discount % (1–100)" type="number" min={1} max={100} value={f.percent} onChange={(e) => set('percent', e.target.value)} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Buy quantity" type="number" min={1} value={f.buy_qty} onChange={(e) => set('buy_qty', e.target.value)} />
            <Input label="Get free" type="number" min={1} value={f.free_qty} onChange={(e) => set('free_qty', e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Starts (optional)" type="date" value={f.starts_on} onChange={(e) => set('starts_on', e.target.value)} />
          <Input label="Ends (optional)" type="date" value={f.ends_on} onChange={(e) => set('ends_on', e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!f.name.trim()}>Create promotion</Button>
        </div>
      </div>
    </Modal>
  );
}
