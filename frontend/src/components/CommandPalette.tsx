import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, LayoutDashboard, ShoppingCart, Receipt, RotateCcw, Package, Boxes, Users, Truck,
  ShoppingBag, Wallet, BarChart3, Settings, CreditCard, Clock, FileText, Tag, Command,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

interface Cmd { id: string; label: string; hint?: string; icon: React.ReactNode; to?: string; perms?: string[] }

const COMMANDS: Cmd[] = [
  { id: 'pos', label: 'Open POS Terminal', hint: 'sell scan checkout', icon: <ShoppingCart size={16} />, to: '/pos', perms: ['create_sale'] },
  { id: 'dash', label: 'Go to Dashboard', icon: <LayoutDashboard size={16} />, to: '/', perms: ['view_dashboard'] },
  { id: 'sales', label: 'Sales History', hint: 'invoices transactions', icon: <Receipt size={16} />, to: '/sales', perms: ['create_sale', 'view_reports'] },
  { id: 'returns', label: 'Returns & Refunds', icon: <RotateCcw size={16} />, to: '/returns', perms: ['process_refund'] },
  { id: 'products', label: 'Products', hint: 'catalog items', icon: <Package size={16} />, to: '/products', perms: ['view_products'] },
  { id: 'inventory', label: 'Inventory', hint: 'stock levels', icon: <Boxes size={16} />, to: '/inventory', perms: ['view_inventory'] },
  { id: 'customers', label: 'Customers', icon: <Users size={16} />, to: '/customers', perms: ['manage_customers'] },
  { id: 'suppliers', label: 'Suppliers', icon: <Truck size={16} />, to: '/suppliers', perms: ['manage_suppliers'] },
  { id: 'purchases', label: 'Purchases', icon: <ShoppingBag size={16} />, to: '/purchases', perms: ['manage_purchases'] },
  { id: 'expenses', label: 'Expenses', icon: <Wallet size={16} />, to: '/expenses', perms: ['manage_expenses'] },
  { id: 'reports', label: 'Reports', hint: 'profit loss analytics', icon: <BarChart3 size={16} />, to: '/reports', perms: ['view_reports'] },
  { id: 'insights', label: 'Insights', hint: 'digest anomalies reorder', icon: <BarChart3 size={16} />, to: '/insights', perms: ['view_reports'] },
  { id: 'shifts', label: 'Shifts & Cash Drawer', hint: 'z-report', icon: <Clock size={16} />, to: '/shifts', perms: ['create_sale'] },
  { id: 'quotes', label: 'Quotations', icon: <FileText size={16} />, to: '/quotations', perms: ['create_sale'] },
  { id: 'promos', label: 'Promotions', hint: 'discount bogo offer', icon: <Tag size={16} />, to: '/promotions', perms: ['manage_catalog', 'manage_settings'] },
  { id: 'billing', label: 'Billing & Plans', hint: 'subscription upgrade', icon: <CreditCard size={16} />, to: '/billing', perms: ['manage_billing', 'manage_settings'] },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} />, to: '/settings', perms: ['manage_settings'] },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const can = useAuthStore((s) => s.can);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setSel(0); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!q || q.length < 2) { setResults(null); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api.get('/search', { params: { q } }).then(({ data }) => setResults(data.data)).catch(() => {}), 250);
  }, [q]);

  const cmds = useMemo(() => COMMANDS.filter((c) =>
    (!c.perms || can(...c.perms)) &&
    (!q || `${c.label} ${c.hint || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [q, can]);

  const dataRows = useMemo(() => {
    if (!results) return [];
    const rows: { label: string; sub: string; to: string }[] = [];
    for (const p of results.products || []) rows.push({ label: p.name, sub: `Product · ${p.sku}`, to: `/products?search=${encodeURIComponent(p.sku)}` });
    for (const s of results.invoices || []) rows.push({ label: s.invoice_number, sub: 'Invoice', to: `/sales?search=${encodeURIComponent(s.invoice_number)}` });
    for (const c of results.customers || []) rows.push({ label: c.name, sub: `Customer · ${c.phone || c.code}`, to: `/customers?search=${encodeURIComponent(c.name)}` });
    return rows;
  }, [results]);

  const all = [...cmds.map((c) => ({ kind: 'cmd' as const, c })), ...dataRows.map((d) => ({ kind: 'data' as const, d }))];

  const go = (idx: number) => {
    const item = all[idx];
    if (!item) return;
    setOpen(false); setQ(''); setResults(null);
    navigate(item.kind === 'cmd' ? item.c.to! : item.d.to);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] p-4 no-print">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2.5 px-4 border-b border-slate-100 dark:border-slate-800">
          <Search size={17} className="text-slate-400" />
          <input autoFocus value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(all.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === 'Enter') go(sel);
            }}
            placeholder="Type a command, product, invoice or customer…"
            className="flex-1 py-3.5 bg-transparent outline-none text-sm" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400 flex items-center gap-0.5"><Command size={9} />K</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {all.length === 0 && <p className="p-4 text-sm text-slate-400 text-center">No matches</p>}
          {all.map((item, i) => (
            <button key={i} onClick={() => go(i)} onMouseEnter={() => setSel(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm ${sel === i ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : ''}`}>
              {item.kind === 'cmd' ? (
                <><span className="text-slate-400">{item.c.icon}</span><span className="font-medium">{item.c.label}</span></>
              ) : (
                <><Search size={15} className="text-slate-300" />
                  <span><span className="font-medium">{item.d.label}</span><span className="text-xs text-slate-400 ml-2">{item.d.sub}</span></span></>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
