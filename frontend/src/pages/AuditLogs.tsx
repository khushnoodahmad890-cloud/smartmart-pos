import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '../api/client';
import { Card, Badge, Spinner, EmptyState, Pagination, Select, SearchInput } from '../components/ui';
import { fmtDateTime } from '../utils/format';
import type { Meta } from '../types';

const ACTION_COLORS: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'purple'> = {
  login: 'blue', logout: 'slate', sale_create: 'green', sale_cancel: 'red', refund: 'red',
  product_create: 'green', product_update: 'amber', product_delete: 'red',
  inventory_adjustment: 'amber', stock_transfer: 'amber', purchase_create: 'green',
  user_create: 'purple', user_update: 'purple', password_reset: 'purple',
  permissions_update: 'purple', settings_update: 'purple',
};

const COMMON_ACTIONS = ['login', 'logout', 'sale_create', 'sale_cancel', 'refund', 'product_create', 'product_update',
  'product_delete', 'inventory_adjustment', 'stock_transfer', 'purchase_create', 'purchase_receive',
  'user_create', 'user_update', 'password_reset', 'permissions_update', 'settings_update', 'expense_create'];

export default function AuditLogs() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 30, total: 0 });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get('/audit-logs', { params: { action: action || undefined, search: search || undefined, page, limit: 30 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .finally(() => setLoading(false));
  }, [action, search, page]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Audit Logs</h1>
        <p className="text-sm text-slate-400">Complete trail of every important action in the system</p>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Search description…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All actions</option>
            {COMMON_ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </Select>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No audit records" icon={<ScrollText size={40} />} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th><th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 hidden lg:table-cell">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-3">{r.user_name || 'System'}<span className="text-xs text-slate-400 block">@{r.username || '—'}</span></td>
                    <td className="px-4 py-3"><Badge color={ACTION_COLORS[r.action] || 'slate'}>{r.action.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-md">{r.description}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-400 font-mono text-xs">{r.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
      </Card>
    </div>
  );
}
