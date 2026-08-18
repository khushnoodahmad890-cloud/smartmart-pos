import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, TrendingUp, ShoppingCart, Package, AlertTriangle, XCircle, Users, Truck,
  Wallet, ShoppingBag, Clock, TrendingDown, Target, ArrowUpRight, Filter, Download, Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { api } from '../api/client';
import { Card, Spinner, Badge, Select, Input, Button } from '../components/ui';
import Sparkline from '../components/Sparkline';
import { money, num, fmtDateTime, downloadCSV } from '../utils/format';
import { useAuthStore } from '../stores/auth';

const PERIODS = [
  { v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: 'week', l: 'This Week' },
  { v: 'month', l: 'This Month' }, { v: 'year', l: 'This Year' }, { v: 'custom', l: 'Custom range' },
];

const PIE_COLORS = ['#7c3aed', '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#ef4444', '#64748b'];

export default function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [branches, setBranches] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  const isSuper = user?.role_name === 'super_admin';

  const [target, setTarget] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  useEffect(() => {
    api.get('/branches').then(({ data }) => setBranches(data.data)).catch(() => {});
    api.get('/system/target').then(({ data }) => setTarget(data.data)).catch(() => {});
    api.get('/insights/kpi-trends').then(({ data }) => setTrends(data.data)).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const params: any = { branch_id: branchId };
    if (period === 'custom' && from && to) { params.from = from; params.to = to; }
    else params.period = period === 'custom' ? 'today' : period;
    api.get('/reports/dashboard', { params }).then(({ data }) => setData(data.data)).finally(() => setLoading(false));
  };
  useEffect(load, [period, branchId]);

  if (loading && !data) return <Spinner label="Loading dashboard…" />;
  if (!data) return null;

  const s = data.sales;
  const series = data.series.map((r: any) => ({
    label: data.bucket === 'hour'
      ? new Date(r.bucket).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : new Date(r.bucket).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    revenue: Number(r.revenue), profit: Number(r.profit), sales: Number(r.sales),
  }));

  const exportSummary = () => downloadCSV('dashboard-summary.csv',
    ['Metric', 'Value'],
    [['Sales', s.sales_count], ['Revenue', s.revenue], ['Gross profit', s.gross_profit],
     ['Net profit', data.net_profit], ['Refunds', data.refunds.refund_total],
     ['Expenses', data.expenses.expense_total], ['Low stock', data.inventory.low_stock],
     ['Out of stock', data.inventory.out_of_stock]]);

  const firstName = (user?.name || '').split(' ')[0] || 'there';

  // Hero stat cards (Afix-style): icon tile + big number + delta + sparkline
  const heroCards = [
    {
      label: 'Total Revenue', value: money(s.revenue), delta: trends?.deltas?.revenue,
      spark: trends?.sparkline?.map((x: any) => Number(x.revenue)) || [], color: '#7c3aed',
      icon: <DollarSign size={20} />, tile: 'from-violet-500 to-purple-500',
    },
    {
      label: 'Total Sales', value: num(s.sales_count), delta: trends?.deltas?.sales,
      spark: trends?.sparkline?.map((x: any) => Number(x.sales)) || [], color: '#6366f1',
      icon: <ShoppingCart size={20} />, tile: 'from-indigo-500 to-blue-500',
    },
    {
      label: 'Gross Profit', value: money(s.gross_profit), delta: trends?.deltas?.profit,
      spark: trends?.sparkline?.map((x: any) => Number(x.profit)) || [], color: '#10b981',
      icon: <TrendingUp size={20} />, tile: 'from-emerald-500 to-teal-500',
    },
    {
      label: 'Net Profit', value: money(data.net_profit), delta: null,
      spark: trends?.sparkline?.map((x: any) => Number(x.profit)) || [],
      color: data.net_profit >= 0 ? '#f59e0b' : '#ef4444',
      icon: <Wallet size={20} />, tile: data.net_profit >= 0 ? 'from-amber-500 to-orange-500' : 'from-rose-500 to-red-500',
    },
  ];

  const targetPct = target && target.target > 0 ? Math.min(100, target.pct) : null;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* ---- Welcome header ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back, {firstName}! 👋</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track your sales activity, stock and profit here.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isSuper && branches.length > 1 && (
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="!w-auto">
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2">
            <Filter size={14} className="text-indigo-500" />
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              className="py-2 pr-1 bg-transparent text-sm font-medium outline-none cursor-pointer">
              {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <Button onClick={load}>Apply</Button>
            </div>
          )}
          <Button variant="secondary" onClick={exportSummary}><Download size={14} /> Export</Button>
        </div>
      </div>

      {/* ---- Hero row: 4 stat cards + target banner ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {heroCards.map((c) => (
          <Card key={c.label} className="p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.tile} text-white flex items-center justify-center shadow-lg`}>
                {c.icon}
              </div>
              <Sparkline data={c.spark.length > 1 ? c.spark : [0, 0]} width={84} height={30} stroke={c.color} />
            </div>
            <p className="text-xs font-medium text-slate-400 mt-4">{c.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{c.value}</p>
            {c.delta !== null && c.delta !== undefined && (
              <p className={`text-xs font-bold mt-1 flex items-center gap-1 ${Number(c.delta) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {Number(c.delta) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Number(c.delta) >= 0 ? '+' : ''}{c.delta}% <span className="text-slate-400 font-medium">vs yesterday</span>
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* ---- Target banner (Afix-style purple gradient) ---- */}
      {targetPct !== null && (
        <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-5 text-white flex flex-wrap items-center gap-5 shadow-xl shadow-violet-500/20">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(targetPct / 100) * 97.4} 97.4`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{targetPct.toFixed(0)}%</span>
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="font-bold flex items-center gap-2"><Target size={16} />
              {targetPct >= 100 ? "Today's target smashed! 🎉" : 'Your daily target is in progress'}</p>
            <p className="text-sm text-white/75 mt-0.5">
              {money(target.today)} of {money(target.target)} — {targetPct >= 100 ? 'outstanding work!' : `${money(Math.max(0, target.target - target.today))} to go.`}
            </p>
          </div>
          <Link to="/insights" className="bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5 transition-colors">
            <Sparkles size={14} /> View insights <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {/* ---- Analytics row: big area chart + payment donut ---- */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Revenue Analytics</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Total Profit <b className="text-slate-700 dark:text-slate-200">{money(s.gross_profit)}</b> ·
                Total Revenue <b className="text-slate-700 dark:text-slate-200"> {money(s.revenue)}</b> ·
                Sales <b className="text-slate-700 dark:text-slate-200"> {num(s.sales_count)}</b>
              </p>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 rounded-lg hover:opacity-90">View all</Link>
          </div>
          <div className="h-72 mt-3">
            <ResponsiveContainer>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b820" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => money(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Legend iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="revenue" stroke="#7c3aed" fill="url(#rev)" strokeWidth={2.5} name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="#6366f1" fill="url(#prof)" strokeWidth={2.5} name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-slate-900 dark:text-white mb-1">Sales by Payment</h3>
          <p className="text-xs text-slate-400 mb-2">Where your money comes from</p>
          <div className="h-56 relative">
            {data.byPayment.length ? (
              <>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.byPayment.map((p: any) => ({ name: p.payment_method.replace('_', ' '), value: Number(p.amount) }))}
                      dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={4} cornerRadius={6}>
                      {data.byPayment.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => money(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{money(s.revenue)}</p>
                </div>
              </>
            ) : <p className="text-sm text-slate-400 text-center pt-20">No sales in this period</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {data.byPayment.map((p: any, i: number) => (
              <div key={p.payment_method} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="capitalize text-slate-500 truncate">{p.payment_method.replace('_', ' ')}</span>
                <span className="ml-auto font-bold">{num(p.count)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ---- Secondary stats strip ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {([
          ['Products', num(data.inventory.total_products), <Package size={16} key="i" />, 'text-sky-500 bg-sky-50 dark:bg-sky-950'],
          ['Low stock', num(data.inventory.low_stock), <AlertTriangle size={16} key="i" />, 'text-amber-500 bg-amber-50 dark:bg-amber-950'],
          ['Out of stock', num(data.inventory.out_of_stock), <XCircle size={16} key="i" />, 'text-rose-500 bg-rose-50 dark:bg-rose-950'],
          ['Customers', num(data.counts.customers), <Users size={16} key="i" />, 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950'],
          ['Suppliers', num(data.counts.suppliers), <Truck size={16} key="i" />, 'text-violet-500 bg-violet-50 dark:bg-violet-950'],
          ['Purchases', money(data.purchases.purchase_total), <ShoppingBag size={16} key="i" />, 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950'],
          ['Pending pay', money(data.purchases.pending_payments), <Clock size={16} key="i" />, 'text-orange-500 bg-orange-50 dark:bg-orange-950'],
          ['Refunds', money(data.refunds.refund_total), <XCircle size={16} key="i" />, 'text-pink-500 bg-pink-50 dark:bg-pink-950'],
        ] as [string, string, React.ReactNode, string][]).map(([label, value, icon, tone]) => (
          <Card key={label} className="p-3.5 flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide truncate">{label}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ---- Bottom row: best sellers (Top deals style) + category bars + recent activity ---- */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white">Top Products</h3>
            <Link to="/reports" className="text-xs font-semibold text-indigo-500 hover:underline">View all</Link>
          </div>
          {data.bestSellers.length === 0 && <p className="text-sm text-slate-400 pt-8 text-center">No sales in this period</p>}
          <div className="space-y-1">
            {data.bestSellers.map((p: any, i: number) => (
              <div key={p.product_id} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-gradient-to-br ${['from-violet-500 to-purple-500', 'from-indigo-500 to-blue-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-pink-500 to-rose-500', 'from-sky-500 to-cyan-500'][i % 6]}`}>
                  {p.product_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.product_name}</p>
                  <p className="text-[11px] text-slate-400">{num(p.units_sold)} units sold</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{money(p.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4">Sales by Category</h3>
          <div className="h-64">
            {data.byCategory.length ? (
              <ResponsiveContainer>
                <BarChart data={data.byCategory.map((c: any) => ({ name: c.category, amount: Number(c.amount) }))} layout="vertical" barSize={14}>
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => money(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                    {data.byCategory.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-400 text-center pt-20">No data</p>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white">Recent Activity</h3>
            <Link to="/sales" className="text-xs font-semibold text-indigo-500 hover:underline">View all</Link>
          </div>
          <div className="space-y-1 relative">
            <div className="absolute left-[13px] top-2 bottom-2 w-px bg-slate-100 dark:bg-slate-800" />
            {data.recentSales.map((r: any) => (
              <div key={r.id} className="flex items-start gap-3 py-1.5 relative">
                <div className={`w-[27px] h-[27px] rounded-full border-2 border-white dark:border-slate-900 shrink-0 flex items-center justify-center z-10 ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900' : r.status === 'cancelled' ? 'bg-rose-100 text-rose-500 dark:bg-rose-900' : 'bg-amber-100 text-amber-600 dark:bg-amber-900'}`}>
                  <ShoppingCart size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold">{r.invoice_number}
                    <span className="font-normal text-slate-400"> · {r.customer_name || 'Walk-in'}</span></p>
                  <p className="text-[11px] text-slate-400">{r.cashier_name} · {fmtDateTime(r.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-bold">{money(r.total)}</p>
                  <Badge color={r.status === 'completed' ? 'green' : r.status === 'cancelled' ? 'red' : 'amber'}>{r.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
