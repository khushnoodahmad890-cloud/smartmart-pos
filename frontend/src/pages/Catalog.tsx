import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Layers, Power } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Badge, Spinner, EmptyState, Modal, ConfirmDialog } from '../components/ui';
import { toast } from '../stores/toast';

type Tab = 'categories' | 'brands' | 'units';

export default function Catalog() {
  const [tab, setTab] = useState<Tab>('categories');
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Categories, Brands & Units</h1>
        <p className="text-sm text-slate-400">Organize your product catalog</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['categories', 'brands', 'units'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>
      <CrudTable key={tab} kind={tab} />
    </div>
  );
}

function CrudTable({ kind }: { kind: Tab }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const label = kind === 'categories' ? 'Category' : kind === 'brands' ? 'Brand' : 'Unit';

  const load = () => {
    setLoading(true);
    api.get(`/${kind}`).then(({ data }) => setRows(data.data)).finally(() => setLoading(false));
  };
  useEffect(load, [kind]);

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/${kind}/${deleting.id}`);
      toast.success(`${label} deleted`);
      setDeleting(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setDeleteLoading(false);
  };

  const toggleActive = async (row: any) => {
    try {
      await api.put(`/${kind}/${row.id}`, { is_active: !row.is_active });
      toast.success(`${label} ${row.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Card>
      <div className="p-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
        <p className="text-sm text-slate-400">{rows.length} {kind}</p>
        <Button onClick={() => setEditing('new')}><Plus size={15} /> Add {label.toLowerCase()}</Button>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title={`No ${kind} yet`} icon={<Layers size={36} />} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Name</th>
                {kind === 'units' && <th className="px-4 py-3">Short name</th>}
                {kind === 'categories' && <th className="px-4 py-3 hidden sm:table-cell">Parent</th>}
                {kind !== 'units' && <th className="px-4 py-3 text-center">Products</th>}
                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  {kind === 'units' && <td className="px-4 py-3 text-slate-500">{r.short_name}</td>}
                  {kind === 'categories' && <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{r.parent_name || '—'}</td>}
                  {kind !== 'units' && <td className="px-4 py-3 text-center text-slate-500">{r.product_count ?? 0}</td>}
                  <td className="px-4 py-3"><Badge color={r.is_active ? 'green' : 'slate'}>{r.is_active ? 'active' : 'inactive'}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => toggleActive(r)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400" title={r.is_active ? 'Deactivate' : 'Activate'}><Power size={15} /></button>
                      <button onClick={() => setEditing(r)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil size={15} /></button>
                      <button onClick={() => setDeleting(r)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CrudForm kind={kind} label={label} row={editing === 'new' ? null : editing} rows={rows}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={deleteLoading}
        danger title={`Delete ${label.toLowerCase()}?`} confirmLabel="Delete"
        message={`"${deleting?.name}" will be permanently deleted. If it's used by products, deletion is blocked — deactivate instead.`} />
    </Card>
  );
}

function CrudForm({ kind, label, row, rows, onClose, onSaved }: any) {
  const [name, setName] = useState(row?.name || '');
  const [shortName, setShortName] = useState(row?.short_name || '');
  const [parentId, setParentId] = useState(row?.parent_id || '');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload: any = { name };
    if (kind === 'units') payload.short_name = shortName || name.slice(0, 3).toLowerCase();
    if (kind === 'categories') payload.parent_id = parentId || null;
    try {
      if (row) await api.put(`/${kind}/${row.id}`, payload);
      else await api.post(`/${kind}`, payload);
      toast.success(`${label} ${row ? 'updated' : 'created'}`);
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={row ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {kind === 'units' && <Input label="Short name (e.g. pc, kg)" value={shortName} onChange={(e) => setShortName(e.target.value)} />}
        {kind === 'categories' && (
          <Select label="Parent category (for subcategories)" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— none (top level) —</option>
            {rows.filter((r: any) => r.id !== row?.id).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}
