import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Textarea, Badge, Spinner, EmptyState, Pagination, Modal, ConfirmDialog, SearchInput } from '../components/ui';
import { money, fmtDate } from '../utils/format';
import { toast } from '../stores/toast';
import type { Meta } from '../types';

const CATEGORIES = ['rent', 'electricity', 'internet', 'salaries', 'transportation', 'maintenance', 'marketing', 'other'];

export default function Expenses() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta & { total_amount?: number }>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/expenses', { params: { search: search || undefined, category: category || undefined, from: from || undefined, to: to || undefined, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, category, from, to, page]);

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/expenses/${deleting.id}`);
      toast.success('Expense deleted');
      setDeleting(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setDeleteLoading(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Expenses</h1>
          <p className="text-sm text-slate-400">Total in view: <b className="text-slate-700 dark:text-slate-200">{money(meta.total_amount)}</b></p>
        </div>
        <Button className="ml-auto" onClick={() => setEditing('new')}><Plus size={15} /> Add expense</Button>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Expense name…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-auto" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-auto" />
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No expenses recorded" icon={<Wallet size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Expense</th><th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 hidden sm:table-cell">Method</th>
                  <th className="px-4 py-3 hidden md:table-cell">Date</th><th className="px-4 py-3 hidden lg:table-cell">By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.name}</p>
                      {e.description && <p className="text-xs text-slate-400 truncate max-w-[240px]">{e.description}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge color="slate">{e.category}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-500">{money(e.amount)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500 capitalize">{e.payment_method.replace('_', ' ')}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{e.created_by || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(e)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil size={15} /></button>
                        <button onClick={() => setDeleting(e)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Trash2 size={15} /></button>
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

      {editing && <ExpenseForm expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={deleteLoading}
        danger title="Delete expense?" confirmLabel="Delete" message={`Delete "${deleting?.name}" (${money(deleting?.amount)})?`} />
    </div>
  );
}

function ExpenseForm({ expense, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name: expense?.name || '', category: expense?.category || 'other', amount: expense?.amount || '',
    description: expense?.description || '', payment_method: expense?.payment_method || 'cash',
    expense_date: expense?.expense_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (expense) await api.put(`/expenses/${expense.id}`, { ...f, amount: Number(f.amount) });
      else await api.post('/expenses', { ...f, amount: Number(f.amount) });
      toast.success(expense ? 'Expense updated' : 'Expense recorded');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Expense name *" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Amount *" type="number" min={0.01} step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Payment method" value={f.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
            <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option><option value="mobile">Mobile</option>
          </Select>
          <Input label="Date" type="date" value={f.expense_date} onChange={(e) => set('expense_date', e.target.value)} />
        </div>
        <Textarea label="Description" value={f.description} onChange={(e) => set('description', e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{expense ? 'Save' : 'Record expense'}</Button>
        </div>
      </form>
    </Modal>
  );
}
