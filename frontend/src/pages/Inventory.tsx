import React, { useEffect, useState } from 'react';
import { Boxes, SlidersHorizontal, ArrowRightLeft, History, AlertTriangle, XCircle, Coins } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Textarea, Badge, Spinner, EmptyState, Pagination, Modal, StatCard, SearchInput } from '../components/ui';
import { money, num, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import type { Meta } from '../types';

const movementLabels: Record<string, { label: string; color: 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'purple' }> = {
  opening: { label: 'Opening', color: 'slate' }, purchase: { label: 'Purchase', color: 'green' },
  sale: { label: 'Sale', color: 'blue' }, return_in: { label: 'Return', color: 'purple' },
  adjustment: { label: 'Adjustment', color: 'amber' }, damage: { label: 'Damaged', color: 'red' },
  transfer_in: { label: 'Transfer in', color: 'green' }, transfer_out: { label: 'Transfer out', color: 'amber' },
};

export default function Inventory() {
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [summary, setSummary] = useState<any>(null);
  const can = useAuthStore((s) => s.can);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api.get('/inventory/summary').then(({ data }) => setSummary(data.data)).catch(() => {});
  }, [refresh]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Inventory</h1>
          <p className="text-sm text-slate-400">Stock levels, adjustments and movement history</p>
        </div>
        {can('edit_inventory') && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setTransferOpen(true)}><ArrowRightLeft size={15} /> Transfer</Button>
            <Button onClick={() => setAdjustOpen(true)}><SlidersHorizontal size={15} /> Adjust stock</Button>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Active products" value={num(summary.total_products)} icon={<Boxes size={20} />} tone="indigo" />
          <StatCard label="Stock value (cost)" value={money(summary.total_value)} sub={`${num(summary.total_units)} units`} icon={<Coins size={20} />} tone="emerald" />
          <StatCard label="Low stock" value={num(summary.low_stock)} icon={<AlertTriangle size={20} />} tone="amber" />
          <StatCard label="Out of stock" value={num(summary.out_of_stock)} icon={<XCircle size={20} />} tone="rose" />
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([['stock', 'Stock levels'], ['movements', 'Movement history']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t === 'movements' && <History size={14} />}{l}
          </button>
        ))}
      </div>

      {tab === 'stock' ? <StockTable key={refresh} /> : <MovementsTable key={refresh} />}

      <AdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} onDone={() => { setAdjustOpen(false); setRefresh((r) => r + 1); }} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); setRefresh((r) => r + 1); }} />
    </div>
  );
}

function StockTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/inventory', { params: { search: search || undefined, stock: stock || undefined, page, limit: 25 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  }, [search, stock, page]);

  return (
    <Card>
      <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
        <SearchInput placeholder="Product, SKU, barcode…" onSearch={(v) => { setSearch(v); setPage(1); }} />
        <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }} className="!w-auto">
          <option value="">All</option><option value="ok">In stock</option>
          <option value="low">Low stock</option><option value="out">Out of stock</option>
        </Select>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No products" icon={<Boxes size={40} />} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Product</th><th className="px-4 py-3 text-center">Current</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">Min</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Stock value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{r.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-base">{r.stock}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell text-slate-400">{r.min_stock}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">{money(r.stock_value)}</td>
                  <td className="px-4 py-3">
                    {r.stock_status === 'out' ? <Badge color="red">OUT OF STOCK</Badge>
                      : r.stock_status === 'low' ? <Badge color="amber">LOW STOCK</Badge>
                      : <Badge color="green">OK</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
    </Card>
  );
}

function MovementsTable() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 30, total: 0 });
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/inventory/movements', { params: { type: type || undefined, page, limit: 30 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  }, [type, page]);

  return (
    <Card>
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="!w-auto">
          <option value="">All movement types</option>
          {Object.entries(movementLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No movements" icon={<History size={40} />} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Product</th><th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-center hidden sm:table-cell">Before → After</th>
                <th className="px-4 py-3 hidden md:table-cell">Reference / Reason</th>
                <th className="px-4 py-3 hidden lg:table-cell">User</th><th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
              {rows.map((m) => {
                const t = movementLabels[m.movement_type] || { label: m.movement_type, color: 'slate' as const };
                return (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.product_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{m.sku}</p>
                    </td>
                    <td className="px-4 py-3"><Badge color={t.color}>{t.label}</Badge></td>
                    <td className={`px-4 py-3 text-center font-semibold ${m.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell text-slate-500">{m.previous_stock} → {m.new_stock}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500 max-w-[220px] truncate">{m.reference}{m.reason ? ` · ${m.reason}` : ''}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{m.user_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
    </Card>
  );
}

function ProductPicker({ value, onChange }: { value: any; onChange: (p: any) => void }) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.length < 1) { setOptions([]); return; }
    const t = setTimeout(() => {
      api.get('/products', { params: { search: q, limit: 8 } }).then(({ data }) => setOptions(data.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <Input label="Product" placeholder="Search product by name, SKU or barcode…"
        value={value ? `${value.name} (${value.sku}) — stock ${value.stock}` : q}
        onChange={(e) => { onChange(null); setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && options.length > 0 && !value && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg max-h-56 overflow-y-auto">
          {options.map((p) => (
            <button key={p.id} type="button" onClick={() => { onChange(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm">
              {p.name} <span className="text-xs text-slate-400">· {p.sku} · stock {p.stock}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustModal({ open, onClose, onDone }: any) {
  const [product, setProduct] = useState<any>(null);
  const [type, setType] = useState('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!product) { toast.warning('Select a product'); return; }
    setLoading(true);
    try {
      await api.post('/inventory/adjust', { product_id: product.id, type, quantity: Number(qty), reason });
      toast.success('Stock updated');
      setProduct(null); setQty(''); setReason(''); onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Adjust stock">
      <div className="space-y-3">
        <ProductPicker value={product} onChange={setProduct} />
        <Select label="Adjustment type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="add">Add stock (received / found)</option>
          <option value="remove">Remove stock</option>
          <option value="damage">Record damaged stock</option>
          <option value="adjustment_set">Set exact quantity (reconciliation)</option>
        </Select>
        <Input label={type === 'adjustment_set' ? 'New exact quantity' : 'Quantity'} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        <Textarea label="Reason (required — recorded in the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Yearly stock count correction" />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Apply adjustment</Button>
        </div>
      </div>
    </Modal>
  );
}

function TransferModal({ open, onClose, onDone }: any) {
  const [branches, setBranches] = useState<any[]>([]);
  const [product, setProduct] = useState<any>(null);
  const [fromB, setFromB] = useState('');
  const [toB, setToB] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) api.get('/branches').then(({ data }) => setBranches(data.data)).catch(() => {}); }, [open]);

  const submit = async () => {
    if (!product || !fromB || !toB) { toast.warning('Fill in all fields'); return; }
    setLoading(true);
    try {
      await api.post('/inventory/transfer', { product_id: product.id, from_branch_id: Number(fromB), to_branch_id: Number(toB), quantity: Number(qty), reason });
      toast.success('Stock transferred');
      setProduct(null); setQty(''); setReason(''); onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Transfer stock between branches">
      <div className="space-y-3">
        <ProductPicker value={product} onChange={setProduct} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="From branch" value={fromB} onChange={(e) => setFromB(e.target.value)}>
            <option value="">— select —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select label="To branch" value={toB} onChange={(e) => setToB(e.target.value)}>
            <option value="">— select —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <Input label="Quantity" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Transfer</Button>
        </div>
      </div>
    </Modal>
  );
}
