import React, { useEffect, useState } from 'react';
import { Plus, ShoppingBag, PackageCheck, HandCoins, Trash2, Undo2, CalendarClock } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Badge, Spinner, EmptyState, Pagination, Modal, ConfirmDialog, SearchInput } from '../components/ui';
import { money, fmtDate, fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import type { Meta } from '../types';

export default function PurchasesPage() {
  const [tab, setTab] = useState<'purchases' | 'returns' | 'expiry'>('purchases');
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([['purchases', 'Purchases'], ['returns', 'Purchase returns'], ['expiry', 'Expiring stock']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === v ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'purchases' && <Purchases />}
      {tab === 'returns' && <PurchaseReturns />}
      {tab === 'expiry' && <ExpiringStock />}
    </div>
  );
}

function PurchaseReturns() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/purchase-returns').then(({ data }) => setRows(data.data)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  if (!rows.length) return <Card><EmptyState title="No purchase returns" subtitle="Return goods to a supplier from the Purchases tab" icon={<Undo2 size={36} />} /></Card>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-3">Return #</th><th className="px-4 py-3">Purchase</th><th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 hidden md:table-cell">Items</th><th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 hidden sm:table-cell">Reason</th><th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono font-medium">{r.return_number}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{r.purchase_number}</td>
                <td className="px-4 py-3">{r.supplier_name}</td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500 max-w-[200px] truncate">{r.items?.map((i: any) => `${i.product_name} ×${i.quantity}`).join(', ')}</td>
                <td className="px-4 py-3 text-right font-semibold text-rose-500">{money(r.total)}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{r.reason}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExpiringStock() {
  const [rows, setRows] = useState<any[]>([]);
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get('/batches/expiring', { params: { days } }).then(({ data }) => setRows(data.data)).finally(() => setLoading(false));
  }, [days]);
  return (
    <Card>
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <CalendarClock size={16} className="text-amber-500" />
        <span className="text-sm">Batches expiring within</span>
        <Select value={days} onChange={(e) => setDays(e.target.value)} className="!w-auto">
          <option value="7">7 days</option><option value="30">30 days</option>
          <option value="90">90 days</option><option value="180">180 days</option>
        </Select>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No batches expiring in this window" subtitle="Batch numbers & expiry dates are captured when receiving purchases" icon={<CalendarClock size={36} />} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Product</th><th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3 text-center">Qty left</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
              {rows.map((b) => {
                const daysLeft = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium">{b.product_name}<span className="text-xs text-slate-400 ml-1.5">{b.sku}</span></td>
                    <td className="px-4 py-3 font-mono text-slate-500">{b.batch_no || '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold">{b.quantity}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(b.expiry_date)}</td>
                    <td className="px-4 py-3">
                      {daysLeft <= 0 ? <Badge color="red">EXPIRED</Badge> : daysLeft <= 7 ? <Badge color="red">{daysLeft}d left</Badge> : <Badge color="amber">{daysLeft}d left</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Purchases() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiving, setReceiving] = useState<any | null>(null);
  const [payFor, setPayFor] = useState<any | null>(null);
  const [returnFor, setReturnFor] = useState<any | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/purchases', { params: { search: search || undefined, status: status || undefined, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, status, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Purchases</h1>
          <p className="text-sm text-slate-400">Purchase orders, goods received & supplier payments</p>
        </div>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus size={15} /> New purchase</Button>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Purchase #, supplier…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All statuses</option><option value="ordered">Ordered</option>
            <option value="partially_received">Partially received</option>
            <option value="received">Received</option><option value="cancelled">Cancelled</option>
          </Select>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No purchases yet" icon={<ShoppingBag size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Purchase #</th><th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 hidden md:table-cell">Items</th>
                  <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right hidden sm:table-cell">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Date</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-medium">{p.purchase_number}</td>
                    <td className="px-4 py-3">{p.supplier_name}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500 max-w-[220px] truncate">
                      {p.items?.map((i: any) => `${i.product_name} ×${i.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{money(p.total)}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-slate-500">{money(p.amount_paid)}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(p.balance_due) > 0 ? <span className="text-rose-500 font-medium">{money(p.balance_due)}</span> : <Badge color="green">paid</Badge>}
                    </td>
                    <td className="px-4 py-3"><Badge color={p.status === 'received' ? 'green' : p.status === 'cancelled' ? 'red' : 'amber'}>{p.status.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{fmtDateTime(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {['ordered', 'partially_received'].includes(p.status) && (
                          <button onClick={() => setReceiving(p)} title="Receive into inventory (full or partial)" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500"><PackageCheck size={15} /></button>
                        )}
                        {['received', 'partially_received'].includes(p.status) && (
                          <button onClick={() => setReturnFor(p)} title="Return goods to supplier" className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Undo2 size={15} /></button>
                        )}
                        {Number(p.balance_due) > 0 && (
                          <button onClick={() => setPayFor(p)} title="Record payment" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><HandCoins size={15} /></button>
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

      {createOpen && <PurchaseForm onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />}
      {receiving && <ReceiveModal purchase={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); load(); }} />}
      {returnFor && <PurchaseReturnModal purchase={returnFor} onClose={() => setReturnFor(null)} onDone={() => { setReturnFor(null); load(); }} />}
      {payFor && <PayModal purchase={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); }} />}
    </div>
  );
}

/** Full or partial receiving with optional batch/expiry per line. */
function ReceiveModal({ purchase, onClose, onDone }: any) {
  const [lines, setLines] = useState<any[]>(() =>
    (purchase.items || []).map((it: any) => ({
      item: it, qty: it.quantity - it.received_quantity, batch_no: '', expiry_date: '',
    })).filter((l: any) => l.qty > 0)
  );
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const toReceive = lines.filter((l) => Number(l.qty) > 0);
    if (!toReceive.length) { toast.warning('Enter at least one quantity to receive'); return; }
    setLoading(true);
    try {
      const { data } = await api.post(`/purchases/${purchase.id}/receive`, {
        items: toReceive.map((l) => ({
          purchase_item_id: l.item.id, quantity: Number(l.qty),
          batch_no: l.batch_no || undefined, expiry_date: l.expiry_date || undefined,
        })),
      });
      toast.success(data.data.message);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Receive — ${purchase.purchase_number}`} wide>
      <p className="text-sm text-slate-400 mb-3">Adjust quantities for partial receiving. Batch number & expiry date are optional (used for expiry tracking).</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <th className="py-2">Product</th><th className="py-2 text-center">Ordered</th><th className="py-2 text-center">Received</th>
            <th className="py-2 w-24">Receive now</th><th className="py-2 w-28">Batch #</th><th className="py-2 w-36">Expiry</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {lines.map((l, i) => (
            <tr key={l.item.id}>
              <td className="py-2">{l.item.product_name}</td>
              <td className="py-2 text-center text-slate-500">{l.item.quantity}</td>
              <td className="py-2 text-center text-slate-500">{l.item.received_quantity}</td>
              <td className="py-2"><input type="number" min={0} max={l.item.quantity - l.item.received_quantity} value={l.qty}
                onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Math.min(l.item.quantity - l.item.received_quantity, Math.max(0, Number(e.target.value) || 0)) } : x))}
                className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" /></td>
              <td className="py-2"><input value={l.batch_no} placeholder="optional"
                onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, batch_no: e.target.value } : x))}
                className="w-24 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" /></td>
              <td className="py-2"><input type="date" value={l.expiry_date}
                onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, expiry_date: e.target.value } : x))}
                className="w-34 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading}><PackageCheck size={15} /> Receive items</Button>
      </div>
    </Modal>
  );
}

/** Return received goods to the supplier. */
function PurchaseReturnModal({ purchase, onClose, onDone }: any) {
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const items = (purchase.items || []).filter((it: any) => it.received_quantity > 0);
  const total = items.reduce((s: number, it: any) => s + (qtys[it.id] || 0) * Number(it.unit_cost), 0);

  const submit = async () => {
    const selected = Object.entries(qtys).filter(([, q]) => q > 0).map(([id, q]) => ({ purchase_item_id: Number(id), quantity: q }));
    if (!selected.length) { toast.warning('Select quantities to return'); return; }
    if (!reason.trim()) { toast.warning('A reason is required'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/purchase-returns', { purchase_id: purchase.id, items: selected, reason: reason.trim() });
      toast.success(`Return ${data.data.return_number} recorded — stock & supplier balance updated`);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Return to supplier — ${purchase.purchase_number}`}>
      <table className="w-full text-sm mb-3">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <th className="py-2">Product</th><th className="py-2 text-center">Received</th><th className="py-2 w-24 text-center">Return</th>
            <th className="py-2 text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {items.map((it: any) => (
            <tr key={it.id}>
              <td className="py-2">{it.product_name}</td>
              <td className="py-2 text-center text-slate-500">{it.received_quantity}</td>
              <td className="py-2 text-center"><input type="number" min={0} max={it.received_quantity} value={qtys[it.id] || 0}
                onChange={(e) => setQtys({ ...qtys, [it.id]: Math.min(it.received_quantity, Math.max(0, Number(e.target.value) || 0)) })}
                className="w-16 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-center" /></td>
              <td className="py-2 text-right font-medium">{money((qtys[it.id] || 0) * Number(it.unit_cost))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit" />
      <div className="flex items-center justify-between mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40">
        <span className="text-sm font-medium text-rose-700 dark:text-rose-300">Return value</span>
        <span className="text-lg font-bold text-rose-600">{money(total)}</span>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={submit} loading={loading} disabled={total <= 0}><Undo2 size={15} /> Process return</Button>
      </div>
    </Modal>
  );
}

function PurchaseForm({ onClose, onSaved }: any) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<{ product: any; quantity: number; unit_cost: number }[]>([]);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [amountPaid, setAmountPaid] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [receiveNow, setReceiveNow] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/suppliers', { params: { limit: 100 } }).then(({ data }) => setSuppliers(data.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (q.length < 1) { setOptions([]); return; }
    const t = setTimeout(() => api.get('/products', { params: { search: q, limit: 8 } }).then(({ data }) => setOptions(data.data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const addLine = (p: any) => {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines([...lines, { product: p, quantity: 10, unit_cost: Number(p.purchase_price) }]);
    setQ(''); setOptions([]);
  };
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  const submit = async () => {
    if (!supplierId) { toast.warning('Select a supplier'); return; }
    if (!lines.length) { toast.warning('Add at least one product'); return; }
    setLoading(true);
    try {
      await api.post('/purchases', {
        supplier_id: Number(supplierId),
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, unit_cost: l.unit_cost })),
        amount_paid: Number(amountPaid) || 0, payment_method: method, receive_now: receiveNow,
      });
      toast.success('Purchase recorded');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title="New purchase" wide>
      <div className="space-y-3">
        <Select label="Supplier *" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— select supplier —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
        </Select>

        <div className="relative">
          <Input label="Add products" placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} />
          {options.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg max-h-48 overflow-y-auto">
              {options.map((p) => (
                <button key={p.id} type="button" onClick={() => addLine(p)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm">
                  {p.name} <span className="text-xs text-slate-400">· current cost {money(p.purchase_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-2">Product</th><th className="py-2 w-24">Qty</th><th className="py-2 w-32">Unit cost</th>
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
                  <td className="py-2"><input type="number" min={0} step="0.01" value={l.unit_cost}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_cost: Math.max(0, Number(e.target.value) || 0) } : x))}
                    className="w-28 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" /></td>
                  <td className="py-2 text-right font-medium">{money(l.quantity * l.unit_cost)}</td>
                  <td className="py-2 text-right"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
          <span className="text-sm font-medium">Purchase total</span>
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{money(total)}</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input label={`Amount paid now (0 – ${money(total)})`} type="number" min={0} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option><option value="mobile">Mobile</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} className="accent-indigo-600" />
          Receive into inventory immediately (uncheck to create an open purchase order)
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Create purchase</Button>
        </div>
      </div>
    </Modal>
  );
}

function PayModal({ purchase, onClose, onDone }: any) {
  const [amount, setAmount] = useState(String(purchase.balance_due));
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/purchases/${purchase.id}/pay`, { amount: Number(amount), method });
      toast.success('Payment recorded');
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Pay — ${purchase.purchase_number}`}>
      <p className="text-sm text-slate-500 mb-3">Remaining balance: <b className="text-rose-500">{money(purchase.balance_due)}</b></p>
      <div className="space-y-3">
        <Input label="Amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
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
