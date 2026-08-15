import React, { useEffect, useState } from 'react';
import { Plus, Pencil, KeyRound, UserCog, ShieldCheck } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Badge, Spinner, EmptyState, Pagination, Modal, SearchInput } from '../components/ui';
import { fmtDateTime } from '../utils/format';
import { toast } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import type { Meta, User } from '../types';

export default function Users() {
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Users & Roles</h1>
        <p className="text-sm text-slate-400">Manage staff accounts, roles and permissions</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['users', 'roles'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t === 'users' ? 'Users' : 'Roles & permissions'}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersTab /> : <RolesTab />}
    </div>
  );
}

function UsersTab() {
  const [rows, setRows] = useState<User[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [roles, setRoles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetFor, setResetFor] = useState<User | null>(null);
  const me = useAuthStore((s) => s.user);

  const load = () => {
    setLoading(true);
    api.get('/users', { params: { search: search || undefined, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, page]);
  useEffect(() => {
    api.get('/roles').then(({ data }) => setRoles(data.data)).catch(() => {});
    api.get('/branches').then(({ data }) => setBranches(data.data)).catch(() => {});
  }, []);

  const toggleActive = async (u: User) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active });
      toast.success(`${u.name} ${u.is_active ? 'disabled' : 'enabled'}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <Card>
        <div className="p-4 flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Name, username, email…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Button onClick={() => setEditing('new')}><Plus size={15} /> Add user</Button>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No users" icon={<UserCog size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">User</th><th className="px-4 py-3 hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3">Role</th><th className="px-4 py-3 hidden md:table-cell">Branch</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Last login</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.name}{u.id === me?.id && <span className="text-xs text-indigo-400 ml-1">(you)</span>}</p>
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{u.email}</td>
                    <td className="px-4 py-3"><Badge color={u.role_name === 'super_admin' ? 'purple' : u.role_name === 'manager' ? 'blue' : 'slate'}>{u.role_name.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500">{u.branch_name || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{u.last_login ? fmtDateTime(u.last_login) : 'never'}</td>
                    <td className="px-4 py-3"><Badge color={u.is_active ? 'green' : 'red'}>{u.is_active ? 'active' : 'disabled'}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setResetFor(u)} title="Reset password" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><KeyRound size={15} /></button>
                        <button onClick={() => setEditing(u)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil size={15} /></button>
                        {u.id !== me?.id && (
                          <button onClick={() => toggleActive(u)} className={`px-2 py-1 rounded-lg text-xs font-medium ${u.is_active ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950'}`}>
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
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
      {editing && <UserForm user={editing === 'new' ? null : editing} roles={roles} branches={branches}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} />}
    </>
  );
}

function UserForm({ user, roles, branches, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name: user?.name || '', username: user?.username || '', email: user?.email || '',
    phone: user?.phone || '', password: '', role_id: user?.role_id || '', branch_id: user?.branch_id || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (user) {
        await api.put(`/users/${user.id}`, { name: f.name, email: f.email, phone: f.phone, role_id: Number(f.role_id), branch_id: f.branch_id ? Number(f.branch_id) : null });
      } else {
        await api.post('/users', { ...f, role_id: Number(f.role_id), branch_id: f.branch_id ? Number(f.branch_id) : null });
      }
      toast.success(user ? 'User updated' : 'User created');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={user ? `Edit — ${user.name}` : 'Add user'}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Full name *" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Username *" value={f.username} onChange={(e) => set('username', e.target.value)} required disabled={!!user} />
          <Input label="Email *" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          {!user && <Input label="Password * (min 6)" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} required minLength={6} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role *" value={f.role_id} onChange={(e) => set('role_id', e.target.value)} required>
            <option value="">— select —</option>
            {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name.replace('_', ' ')}</option>)}
          </Select>
          <Select label="Branch" value={f.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
            <option value="">— none —</option>
            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{user ? 'Save' : 'Create user'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: any) {
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { newPassword: pw });
      toast.success(`Password reset for ${user.name}`);
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}>
      <Input label="New password (min 6 characters)" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus minLength={6} />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading} disabled={pw.length < 6}>Reset password</Button>
      </div>
    </Modal>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newRoleOpen, setNewRoleOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/roles'), api.get('/permissions')])
      .then(([r, p]) => { setRoles(r.data.data); setPermissions(p.data.data); })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const selectRole = (r: any) => { setSelected(r); setChecked(new Set(r.permissions)); };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/roles/${selected.id}/permissions`, { permissions: Array.from(checked) });
      toast.success(`Permissions updated for ${selected.name}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };

  const byCategory = permissions.reduce((acc: any, p: any) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  if (loading) return <Spinner />;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Roles</h3>
          <Button variant="secondary" onClick={() => setNewRoleOpen(true)} className="!px-2.5 !py-1.5 text-xs"><Plus size={13} /> New</Button>
        </div>
        <div className="space-y-1.5">
          {roles.map((r) => (
            <button key={r.id} onClick={() => selectRole(r)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${selected?.id === r.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
              <p className="text-sm font-medium capitalize flex items-center gap-1.5">
                {r.name === 'super_admin' && <ShieldCheck size={14} className="text-violet-500" />}{r.name.replace('_', ' ')}
              </p>
              <p className="text-xs text-slate-400">{r.user_count} user(s) · {r.name === 'super_admin' ? 'all permissions' : `${r.permissions.length} permissions`}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 lg:col-span-2">
        {!selected ? <EmptyState title="Select a role" subtitle="Choose a role on the left to view and edit its permissions" icon={<ShieldCheck size={36} />} /> : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold capitalize">{selected.name.replace('_', ' ')} permissions</h3>
              {selected.name !== 'super_admin' && <Button onClick={save} loading={saving}>Save changes</Button>}
            </div>
            {selected.name === 'super_admin' ? (
              <p className="text-sm text-slate-500">Super admin always has every permission. This cannot be changed.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(byCategory).map(([cat, perms]: any) => (
                  <div key={cat}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{cat}</p>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {perms.map((p: any) => (
                        <label key={p.code} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 cursor-pointer text-sm">
                          <input type="checkbox" checked={checked.has(p.code)} className="accent-indigo-600"
                            onChange={(e) => {
                              const next = new Set(checked);
                              e.target.checked ? next.add(p.code) : next.delete(p.code);
                              setChecked(next);
                            }} />
                          <span>{p.label}<span className="block text-[10px] text-slate-400 font-mono">{p.code}</span></span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {newRoleOpen && <NewRoleModal onClose={() => setNewRoleOpen(false)} onSaved={() => { setNewRoleOpen(false); load(); }} />}
    </div>
  );
}

function NewRoleModal({ onClose, onSaved }: any) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/roles', { name, description: desc });
      toast.success('Role created — now assign its permissions');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };
  return (
    <Modal open onClose={onClose} title="Create role">
      <div className="space-y-3">
        <Input label="Role name (e.g. Store Supervisor)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!name.trim()}>Create role</Button>
        </div>
      </div>
    </Modal>
  );
}
