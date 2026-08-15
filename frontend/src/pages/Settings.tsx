import React, { useEffect, useState } from 'react';
import { Save, Store, Receipt, Boxes, Building2, Plus, Pencil, Star, DatabaseBackup, Plug, Copy, Trash2, KeyRound } from 'lucide-react';
import { useEffect as useEffect2 } from 'react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Textarea, Badge, Spinner, Modal } from '../components/ui';
import { toast } from '../stores/toast';
import { useSettingsStore } from '../stores/settings';
import { money } from '../utils/format';

export default function Settings() {
  const [tab, setTab] = useState<'business' | 'receipt' | 'inventory' | 'loyalty' | 'branches' | 'system' | 'integrations'>('business');
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400">Business configuration and preferences</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {([['business', 'Business', <Store size={14} key="s" />], ['receipt', 'Invoice & Receipt', <Receipt size={14} key="r" />],
          ['inventory', 'Inventory & Barcode', <Boxes size={14} key="i" />],
          ['loyalty', 'Loyalty & Targets', <Star size={14} key="l" />],
          ['branches', 'Branches', <Building2 size={14} key="b" />],
          ['system', 'Backup & System', <DatabaseBackup size={14} key="d" />],
          ['integrations', 'API & Webhooks', <Plug size={14} key="p" />]] as any).map(([v, l, ic]: any) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5 ${tab === v ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {ic}{l}
          </button>
        ))}
      </div>
      {tab === 'branches' ? <BranchesTab /> : tab === 'system' ? <SystemTab /> : tab === 'integrations' ? <IntegrationsTab /> : <SettingsForm section={tab} />}
    </div>
  );
}

function IntegrationsTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [hooks, setHooks] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [freshKey, setFreshKey] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvent, setHookEvent] = useState('sale.created');
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.get('/api-keys').then(({ data }) => setKeys(data.data)).catch(() => {});
    api.get('/webhooks').then(({ data }) => setHooks(data.data)).catch(() => {});
  };
  useEffect2(load, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/api-keys', { name: newKeyName.trim() });
      setFreshKey(data.data.key);
      setNewKeyName('');
      load();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  const addHook = async () => {
    if (!hookUrl.trim()) return;
    setLoading(true);
    try {
      await api.post('/webhooks', { url: hookUrl.trim(), event: hookEvent });
      toast.success('Webhook added');
      setHookUrl(''); load();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-1 flex items-center gap-2"><KeyRound size={16} /> API keys</h3>
        <p className="text-sm text-slate-400 mb-4">Machine access to read-only endpoints: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">GET /api/v1/products</code> and <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">GET /api/v1/sales</code> with header <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">X-API-Key</code>.</p>
        {freshKey && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
            <p className="text-xs font-semibold text-emerald-600 mb-1">Copy this key now — it won't be shown again:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono break-all flex-1">{freshKey}</code>
              <button onClick={() => { navigator.clipboard?.writeText(freshKey); toast.success('Copied'); }} className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-600"><Copy size={14} /></button>
            </div>
          </div>
        )}
        <div className="flex gap-2 mb-4">
          <Input placeholder='Key name, e.g. "Accounting sync"' value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="flex-1" />
          <Button onClick={createKey} loading={loading}><Plus size={14} /> Create</Button>
        </div>
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-sm">
              <div className="flex-1">
                <p className="font-medium">{k.name} {k.revoked && <Badge color="red">revoked</Badge>}</p>
                <p className="text-xs text-slate-400 font-mono">{k.key_prefix}…{k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString('en-GB')}` : ' · never used'}</p>
              </div>
              {!k.revoked && <Button variant="secondary" className="!px-2.5 !py-1 text-xs text-rose-500" onClick={async () => { await api.post(`/api-keys/${k.id}/revoke`); load(); }}>Revoke</Button>}
            </div>
          ))}
          {keys.length === 0 && <p className="text-sm text-slate-400">No API keys yet</p>}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-1 flex items-center gap-2"><Plug size={16} /> Webhooks</h3>
        <p className="text-sm text-slate-400 mb-4">Get an HTTP POST to your URL when events happen (e.g. push each sale into your accounting or analytics system).</p>
        <div className="flex gap-2 mb-4">
          <Input placeholder="https://your-system.com/hook" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} className="flex-1" />
          <Select value={hookEvent} onChange={(e) => setHookEvent(e.target.value)} className="!w-auto">
            <option value="sale.created">sale.created</option>
            <option value="sale.cancelled">sale.cancelled</option>
            <option value="refund.created">refund.created</option>
            <option value="stock.low">stock.low</option>
          </Select>
          <Button onClick={addHook} loading={loading}><Plus size={14} /></Button>
        </div>
        <div className="space-y-2">
          {hooks.map((h) => (
            <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{h.url}</p>
                <p className="text-xs text-slate-400">{h.event}{h.last_fired_at ? ` · last fired ${new Date(h.last_fired_at).toLocaleString('en-GB')} (HTTP ${h.last_status})` : ' · never fired'}</p>
              </div>
              <button onClick={async () => { await api.delete(`/webhooks/${h.id}`); load(); }} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
            </div>
          ))}
          {hooks.length === 0 && <p className="text-sm text-slate-400">No webhooks configured</p>}
        </div>
      </Card>
    </div>
  );
}

function SystemTab() {
  const [purging, setPurging] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const backup = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/system/backup', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.sql`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (e) { toast.error(errMsg(e)); }
    setDownloading(false);
  };

  const purge = async () => {
    setPurging(true);
    try {
      const { data } = await api.post('/system/purge-audit');
      toast.success(`Purged ${data.data.purged} audit records older than ${data.data.retention_days} days`);
    } catch (e) { toast.error(errMsg(e)); }
    setPurging(false);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
      <Card className="p-5">
        <h3 className="font-semibold mb-1">Database backup</h3>
        <p className="text-sm text-slate-400 mb-4">Download a full SQL backup of the database (pg_dump). Store it somewhere safe — restoring is done with <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">psql &lt; backup.sql</code>.</p>
        <Button onClick={backup} loading={downloading}><DatabaseBackup size={15} /> Download backup now</Button>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-1">Audit log retention</h3>
        <p className="text-sm text-slate-400 mb-4">Delete audit records older than the retention period (set in Loyalty & Targets → audit_retention_days, default 365 days). The purge itself is recorded in the audit trail.</p>
        <Button variant="danger" onClick={purge} loading={purging}>Purge old audit logs</Button>
      </Card>
      <Card className="p-5 md:col-span-2">
        <h3 className="font-semibold mb-1">Email (SMTP)</h3>
        <p className="text-sm text-slate-400">Email receipts and password-reset emails require SMTP configuration on the server. Set <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM</code> in the backend environment and restart. Without SMTP the app still works — password resets show the token on screen (dev mode) and email buttons explain what's missing.</p>
      </Card>
    </div>
  );
}

const FIELDS: Record<string, { key: string; label: string; type?: string; options?: string[][]; hint?: string }[]> = {
  business: [
    { key: 'business_name', label: 'Business name' },
    { key: 'business_address', label: 'Address' },
    { key: 'business_phone', label: 'Phone' },
    { key: 'business_email', label: 'Email' },
    { key: 'currency', label: 'Currency code (e.g. USD, EUR, PKR)' },
    { key: 'currency_symbol', label: 'Currency symbol (e.g. $, €, Rs.)' },
    { key: 'date_format', label: 'Date format', type: 'select', options: [['DD/MM/YYYY', 'DD/MM/YYYY'], ['MM/DD/YYYY', 'MM/DD/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']] },
    { key: 'timezone', label: 'Timezone (e.g. UTC, America/New_York)' },
  ],
  receipt: [
    { key: 'invoice_prefix', label: 'Invoice prefix', hint: 'Used for display — invoice numbers are generated as PREFIX-YYYY-NNNNNN' },
    { key: 'tax_rate', label: 'Default tax rate % (applied to new products)' },
    { key: 'tax_mode', label: 'Tax mode', type: 'select', options: [['exclusive', 'Exclusive — tax added on top of prices'], ['inclusive', 'Inclusive — prices already contain tax']] },
    { key: 'receipt_width', label: 'Thermal receipt width', type: 'select', options: [['80mm', '80mm (standard)'], ['58mm', '58mm (compact)']] },
    { key: 'receipt_show_logo', label: 'Show logo on receipts', type: 'select', options: [['true', 'Yes'], ['false', 'No']] },
    { key: 'receipt_show_tax', label: 'Show tax breakdown on receipts', type: 'select', options: [['true', 'Yes'], ['false', 'No']] },
    { key: 'receipt_footer', label: 'Receipt footer message', type: 'textarea' },
  ],
  inventory: [
    { key: 'low_stock_threshold', label: 'Default low-stock threshold for new products' },
    { key: 'allow_negative_stock', label: 'Allow negative stock (overselling)', type: 'select', options: [['false', 'No — block sales beyond available stock (recommended)'], ['true', 'Yes — allow stock to go negative']] },
    { key: 'barcode_type', label: 'Barcode format', type: 'select', options: [['EAN13', 'EAN-13'], ['CODE128', 'Code 128']] },
    { key: 'weight_barcode_prefix', label: 'Weight-barcode prefix (scale labels)', hint: 'EAN-13 codes starting with this 2-digit prefix are read as PP IIIII WWWWW C — item code + weight in grams. Product SKU must be WB-IIIII, price = per kg.' },
    { key: 'scan_sounds', label: 'POS scan sounds', type: 'select', options: [['true', 'On — beep on scan, buzz on error'], ['false', 'Off']] },
  ],
  loyalty: [
    { key: 'loyalty_enabled', label: 'Loyalty program', type: 'select', options: [['true', 'Enabled'], ['false', 'Disabled']] },
    { key: 'loyalty_earn_rate', label: 'Points earned per 100 spent', hint: 'e.g. 1 = customer earns 1 point per 100 in currency paid' },
    { key: 'loyalty_redeem_value', label: 'Currency value of 1 point', hint: 'e.g. 1 = each point is worth 1 unit of currency at checkout' },
    { key: 'daily_sales_target', label: 'Daily sales target (dashboard goal)' },
    { key: 'kitchen_mode', label: 'Kitchen mode (restaurant order display)', type: 'select', options: [['false', 'Off'], ['true', 'On — enables kitchen orders at POS + display screen']] },
  ],
};

function SettingsForm({ section }: { section: string }) {
  const { settings, set: setStore } = useSettingsStore();
  const [f, setF] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const field of FIELDS[section]) init[field.key] = settings[field.key] || '';
    setF(init);
  }, [section, settings]);

  const save = async () => {
    setLoading(true);
    try {
      const { data } = await api.put('/settings', f);
      setStore(data.data);
      toast.success('Settings saved');
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Card className="p-5 max-w-2xl">
      <div className="space-y-4">
        {FIELDS[section].map((field) => (
          <div key={field.key}>
            {field.type === 'select' ? (
              <Select label={field.label} value={f[field.key] || ''} onChange={(e) => setF({ ...f, [field.key]: e.target.value })}>
                {field.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            ) : field.type === 'textarea' ? (
              <Textarea label={field.label} value={f[field.key] || ''} onChange={(e) => setF({ ...f, [field.key]: e.target.value })} />
            ) : (
              <Input label={field.label} value={f[field.key] || ''} onChange={(e) => setF({ ...f, [field.key]: e.target.value })} />
            )}
            {field.hint && <p className="text-xs text-slate-400 mt-1">{field.hint}</p>}
          </div>
        ))}
        <Button onClick={save} loading={loading}><Save size={15} /> Save settings</Button>
      </div>
    </Card>
  );
}

function BranchesTab() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | 'new' | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/branches').then(({ data }) => setBranches(data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus size={15} /> Add branch</Button></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {branches.map((b) => (
          <Card key={b.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{b.name} <span className="text-xs text-slate-400 font-mono">({b.code})</span></p>
                <p className="text-xs text-slate-400 mt-0.5">{b.address || 'No address'}</p>
                <p className="text-xs text-slate-400">{b.phone}</p>
              </div>
              <button onClick={() => setEditing(b)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><Pencil size={14} /></button>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-400">{b.employee_count} staff</div>
              <div className="text-right">
                <p className="text-xs text-slate-400">This month</p>
                <p className="font-bold text-sm">{money(b.month_sales)}</p>
              </div>
              <Badge color={b.is_active ? 'green' : 'slate'}>{b.is_active ? 'active' : 'inactive'}</Badge>
            </div>
          </Card>
        ))}
      </div>
      {editing && <BranchForm branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function BranchForm({ branch, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: branch?.name || '', code: branch?.code || '', address: branch?.address || '', phone: branch?.phone || '' });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (branch) await api.put(`/branches/${branch.id}`, f);
      else await api.post('/branches', f);
      toast.success(branch ? 'Branch updated' : 'Branch created');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={branch ? 'Edit branch' : 'Add branch'}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Branch name *" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        <Input label="Code * (short, e.g. DHA)" value={f.code} onChange={(e) => set('code', e.target.value)} required disabled={!!branch} />
        <Input label="Address" value={f.address} onChange={(e) => set('address', e.target.value)} />
        <Input label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{branch ? 'Save' : 'Create branch'}</Button>
        </div>
      </form>
    </Modal>
  );
}
