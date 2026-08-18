import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Layers, Tags, Receipt, RotateCcw,
  Users, Truck, ShoppingBag, Wallet, BarChart3, Settings, ScrollText, UserCog,
  Menu, X, Sun, Moon, Bell, LogOut, Search, Store, Wifi, WifiOff, ChevronDown, KeyRound, Barcode,
  Clock, FileText, UtensilsCrossed, Languages, CreditCard, Lock, Crown, Sparkles, Tag,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { useConnectionStore } from '../stores/connection';
import { useSettingsStore } from '../stores/settings';
import { api, errMsg } from '../api/client';
import { toast } from '../stores/toast';
import { useI18n, LANGS } from '../stores/i18n';
import { useSubscriptionStore } from '../stores/subscription';
import { useEvents } from '../hooks/useEvents';
import { Modal, Button, Input, Badge } from '../components/ui';
import CommandPalette from '../components/CommandPalette';
import OnboardingWizard from '../components/OnboardingWizard';
import { fmtDateTime } from '../utils/format';

interface NavItem { to: string; label: string; icon: React.ReactNode; perms?: string[]; feature?: string }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Main', items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, perms: ['view_dashboard'] },
      { to: '/pos', label: 'POS Terminal', icon: <ShoppingCart size={18} />, perms: ['create_sale'] },
      { to: '/shifts', label: 'Shifts & Cash', icon: <Clock size={18} />, perms: ['manage_shifts', 'create_sale'], feature: 'shifts' },
      { to: '/sales', label: 'Sales History', icon: <Receipt size={18} />, perms: ['create_sale', 'view_reports'] },
      { to: '/quotations', label: 'Quotations', icon: <FileText size={18} />, perms: ['manage_quotations', 'create_sale'], feature: 'quotations' },
      { to: '/returns', label: 'Returns & Refunds', icon: <RotateCcw size={18} />, perms: ['process_refund'] },
      { to: '/kitchen', label: 'Kitchen Display', icon: <UtensilsCrossed size={18} />, perms: ['view_kitchen'], feature: 'kitchen' },
    ],
  },
  {
    section: 'Catalog', items: [
      { to: '/products', label: 'Products', icon: <Package size={18} />, perms: ['view_products'] },
      { to: '/promotions', label: 'Promotions', icon: <Tag size={18} />, perms: ['manage_catalog', 'manage_settings'] },
      { to: '/categories', label: 'Categories & Brands', icon: <Layers size={18} />, perms: ['manage_catalog'] },
      { to: '/barcodes', label: 'Barcode Labels', icon: <Barcode size={18} />, perms: ['view_products'] },
      { to: '/inventory', label: 'Inventory', icon: <Boxes size={18} />, perms: ['view_inventory'] },
    ],
  },
  {
    section: 'Partners', items: [
      { to: '/customers', label: 'Customers', icon: <Users size={18} />, perms: ['manage_customers'] },
      { to: '/suppliers', label: 'Suppliers', icon: <Truck size={18} />, perms: ['manage_suppliers'], feature: 'suppliers' },
      { to: '/purchases', label: 'Purchases', icon: <ShoppingBag size={18} />, perms: ['manage_purchases'], feature: 'purchases' },
    ],
  },
  {
    section: 'Finance', items: [
      { to: '/expenses', label: 'Expenses', icon: <Wallet size={18} />, perms: ['manage_expenses'], feature: 'expenses' },
      { to: '/reports', label: 'Reports', icon: <BarChart3 size={18} />, perms: ['view_reports'], feature: 'reports' },
      { to: '/insights', label: 'Insights', icon: <Sparkles size={18} />, perms: ['view_reports'], feature: 'reports' },
    ],
  },
  {
    section: 'Administration', items: [
      { to: '/users', label: 'Users & Roles', icon: <UserCog size={18} />, perms: ['manage_users'] },
      { to: '/audit-logs', label: 'Audit Logs', icon: <ScrollText size={18} />, perms: ['view_audit_logs'], feature: 'audit_logs' },
      { to: '/billing', label: 'Billing & Plans', icon: <CreditCard size={18} />, perms: ['manage_billing', 'manage_settings'] },
      { to: '/settings', label: 'Settings', icon: <Settings size={18} />, perms: ['manage_settings'] },
    ],
  },
];

const NAV_KEYS: Record<string, string> = {
  '/': 'dashboard', '/pos': 'pos', '/shifts': 'shifts', '/sales': 'sales', '/quotations': 'quotations',
  '/returns': 'returns', '/kitchen': 'kitchen', '/products': 'products', '/categories': 'categories',
  '/barcodes': 'barcodes', '/inventory': 'inventory', '/customers': 'customers', '/suppliers': 'suppliers',
  '/purchases': 'purchases', '/expenses': 'expenses', '/reports': 'reports', '/users': 'users',
  '/audit-logs': 'audit', '/settings': 'settings',
};

function navLabel(to: string, fallback: string) {
  const t = useI18n.getState().t;
  const key = NAV_KEYS[to];
  return key ? t(key) : fallback;
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, can, logout } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const online = useConnectionStore((s) => s.online);
  const settings = useSettingsStore((s) => s.settings);
  const navigate = useNavigate();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  // First-run onboarding: shown to admins until completed/skipped
  useEffect(() => {
    if (settingsLoaded && settings.onboarding_done !== 'true' && can('manage_settings')) {
      setShowOnboarding(true);
    }
  }, [settingsLoaded]);

  const { lang, setLang } = useI18n();
  const { hasFeature, subscription, plans } = useSubscriptionStore();

  useEffect(() => {
    const load = () => api.get('/notifications').then(({ data }) => {
      setNotifs(data.data); setUnread(data.meta?.unread || 0);
    }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  // Real-time: refresh notifications instantly when the server broadcasts a sale
  useEvents({
    sale: () => api.get('/notifications').then(({ data }) => {
      setNotifs(data.data); setUnread(data.meta?.unread || 0);
    }).catch(() => {}),
  });

  const markRead = async () => {
    try { await api.post('/notifications/read'); setUnread(0); setNotifs((n) => n.map((x) => ({ ...x, is_read: true }))); } catch {}
  };

  const doLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/login');
  };

  const visibleNav = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => {
      if (i.to === '/kitchen' && settings.kitchen_mode !== 'true') return false;
      return !i.perms || can(...i.perms);
    }),
  })).filter((s) => s.items.length);

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#0b1437] text-slate-300 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/5">
          {settings.business_logo
            ? <img src={settings.business_logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-0.5" />
            : <div className="p-1.5 bg-indigo-600 rounded-lg"><Store size={20} className="text-white" /></div>}
          <div className="min-w-0">
            <p className="font-bold text-white text-sm truncate">{settings.business_name || 'SmartMart POS'}</p>
            <p className="text-[11px] text-slate-500">Business Suite</p>
          </div>
          <button className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {visibleNav.map((section) => (
            <div key={section.section}>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500/70 mb-1.5">{section.section}</p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to} to={item.to} end={item.to === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-xl text-sm mb-0.5 transition-all ${isActive ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-medium shadow-lg shadow-indigo-950/60' : 'text-slate-400 hover:bg-white/5 hover:text-white'} ${item.feature && !hasFeature(item.feature) ? 'opacity-60' : ''}`}
                >
                  {item.icon}{navLabel(item.to, item.label)}
                  {item.feature && !hasFeature(item.feature) && <Lock size={12} className="ml-auto text-amber-400" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {subscription && subscription.effective_plan !== 'pro' && can('manage_billing', 'manage_settings') && (
          <div className="mx-3 mb-2 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-4 text-white shadow-lg shadow-indigo-950/50">
            <div className="flex items-center gap-2 mb-1"><Crown size={16} className="text-amber-300" /><p className="font-bold text-sm">Upgrade to Pro</p></div>
            <p className="text-[11px] text-indigo-100 mb-3">Unlock loyalty, insights, multi-branch & more.</p>
            <NavLink to="/billing" onClick={() => setSidebarOpen(false)}
              className="block text-center bg-white text-indigo-700 rounded-xl py-2 text-xs font-bold hover:bg-indigo-50 transition-colors">
              Upgrade
            </NavLink>
          </div>
        )}
        <div className="p-3 border-t border-white/5 space-y-2">
          {subscription && (
            <NavLink to="/billing" onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-800 transition-colors">
              <Crown size={13} className={subscription.effective_plan === 'pro' ? 'text-violet-400' : subscription.effective_plan === 'standard' ? 'text-sky-400' : 'text-slate-500'} />
              <span className="text-slate-400">
                {plans[subscription.effective_plan]?.name || 'Basic'} plan
                {subscription.status === 'trial' && <span className="text-violet-400"> · trial {subscription.days_left}d</span>}
                {subscription.status === 'cancelled' && <span className="text-rose-400"> · cancelled</span>}
              </span>
            </NavLink>
          )}
          <div className="text-xs text-slate-500 flex items-center gap-2 px-2">
            {online ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-rose-400" />}
            {online ? 'Connected' : 'Offline — cart is saved locally'}
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 px-4 lg:px-6 no-print">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <button onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-400 hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700 transition-all w-72">
            <Search size={15} /> Search… <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-mono">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {!online && <Badge color="red">offline</Badge>}
            <div className="relative flex items-center gap-1 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Language / زبان / اللغة / Idioma">
              <Languages size={16} />
              <select value={lang} onChange={(e) => setLang(e.target.value as any)}
                className="bg-transparent text-xs font-semibold outline-none cursor-pointer appearance-none pr-1">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Toggle theme">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <button onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) markRead(); }} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 relative">
                <Bell size={18} />
                {unread > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unread}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 max-h-96 overflow-y-auto">
                  <p className="px-4 py-2.5 text-sm font-semibold border-b border-slate-100 dark:border-slate-700">Notifications</p>
                  {notifs.length === 0 && <p className="p-4 text-sm text-slate-400">No notifications</p>}
                  {notifs.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-slate-500">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtDateTime(n.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                  {user?.name?.charAt(0) || '?'}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium leading-tight">{user?.name}</p>
                  <p className="text-[11px] text-slate-400 capitalize">{user?.role_name?.replace('_', ' ')}</p>
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-1.5">
                  <button onClick={() => { setPwModal(true); setProfileOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                    <KeyRound size={15} /> Change password
                  </button>
                  <button onClick={doLogout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} />
      <CommandPalette />
      {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!q || q.length < 2) { setResults(null); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.get('/search', { params: { q } }).then(({ data }) => setResults(data.data)).catch(() => {});
    }, 300);
  }, [q]);

  if (!open) return null;
  const go = (path: string) => { onClose(); setQ(''); setResults(null); navigate(path); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-slate-200 dark:border-slate-700">
          <Search size={18} className="text-slate-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, SKU, barcode, invoices, customers, suppliers…"
            className="flex-1 py-3.5 bg-transparent outline-none text-sm" />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {results?.products?.length > 0 && <>
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase text-slate-400">Products</p>
            {results.products.map((p: any) => (
              <button key={p.id} onClick={() => go(`/products?search=${encodeURIComponent(p.sku)}`)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex justify-between">
                <span>{p.name} <span className="text-slate-400 text-xs">· {p.sku}</span></span>
              </button>
            ))}
          </>}
          {results?.invoices?.length > 0 && <>
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase text-slate-400">Invoices</p>
            {results.invoices.map((s: any) => (
              <button key={s.id} onClick={() => go(`/sales?search=${encodeURIComponent(s.invoice_number)}`)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">{s.invoice_number}</button>
            ))}
          </>}
          {results?.customers?.length > 0 && <>
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase text-slate-400">Customers</p>
            {results.customers.map((c: any) => (
              <button key={c.id} onClick={() => go(`/customers?search=${encodeURIComponent(c.name)}`)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">{c.name} <span className="text-slate-400 text-xs">{c.phone}</span></button>
            ))}
          </>}
          {results?.suppliers?.length > 0 && <>
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase text-slate-400">Suppliers</p>
            {results.suppliers.map((s: any) => (
              <button key={s.id} onClick={() => go(`/suppliers?search=${encodeURIComponent(s.company_name)}`)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">{s.company_name}</button>
            ))}
          </>}
          {q.length >= 2 && results && !results.products?.length && !results.invoices?.length && !results.customers?.length && !results.suppliers?.length && (
            <p className="p-4 text-sm text-slate-400 text-center">No results for “{q}”</p>
          )}
          {q.length < 2 && <p className="p-4 text-sm text-slate-400 text-center">Type at least 2 characters to search</p>}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: cur, newPassword: next });
      toast.success('Password updated');
      setCur(''); setNext(''); onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Current password" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <Input label="New password (min 6 characters)" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Update password</Button>
        </div>
      </form>
    </Modal>
  );
}
