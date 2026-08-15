import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, TrendingUp, ShoppingCart, Package, AlertTriangle, XCircle, Users, Truck,
  Wallet, ShoppingBag, Clock,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { api } from '../api/client';
import { StatCard, Card, Spinner, Badge, Select, Input, Button } from '../components/ui';
import Sparkline from '../components/Sparkline';
import { money, num, fmtDateTime } from '../utils/format';
import { useAuthStore } from '../stores/auth';
import { TrendingUp as TrendUp, TrendingDown as TrendDown } from 'lucide-react';

const PERIODS = [
  { v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: 'week', l: 'This Week' },
  { v: 'month', l: 'This Month' }, { v: 'year', l: 'This Year' }, { v: 'custom', l: 'Custom range' },
];

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];

export default function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [branches, setBranches] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isSuper = useAuthStore((s) => s.user?.role_name === 'super_admin');

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

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Business overview & performance</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isSuper && branches.length > 1 && (
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="!w-auto">
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="!w-auto">
            {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </Select>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <Button onClick={load}>Apply</Button>
            </div>
          )}
        </div>
      </div>

      {/* Today vs yesterday trend strip */}
      {trends && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([['Revenue today', trends.today.revenue, trends.deltas.revenue, 'revenue', '#6366f1', true],
             ['Sales today', trends.today.sales, trends.deltas.sales, 'sales', '#0ea5e9', false],
             ['Profit today', trends.today.profit, trends.deltas.profit, 'profit', '#10b981', true]] as any).map(([label, val, delta, key, color, isMoney]: any) => (
            <Card key={label} className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400 font-medium">{label}</p>
                <p className="text-xl font-bold">{isMoney ? money(val) : num(val)}</p>
                {delta !== null && (
                  <p className={`text-xs font-semibold flex items-center gap-1 ${delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {delta >= 0 ? <TrendUp size={12} /> : <TrendDown size={12} />}
                    {delta >= 0 ? '+' : ''}{delta}% vs yesterday
                  </p>
                )}
              </div>
              <Sparkline data={trends.sparkline.map((s: any) => Number(s[key]))} stroke={color} />
            </Card>
          ))}
        </div>
      )}

      {/* Daily target progress */}
      {target && target.target > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Today's sales target</p>
            <p className="text-sm text-slate-500">{money(target.today)} / {money(target.target)} <span className="font-bold text-indigo-500">({target.pct.toFixed(0)}%)</span></p>
          </div>
          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${target.pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, target.pct)}%` }} />
          </div>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard label="Sales" value={num(s.sales_count)} sub="transactions" icon={<ShoppingCart size={20} />} tone="indigo" />
        <StatCard label="Revenue" value={money(s.revenue)} sub={`tax ${money(s.tax_collected)}`} icon={<DollarSign size={20} />} tone="emerald" />
        <StatCard label="Gross Profit" value={money(s.gross_profit)} sub={`COGS ${money(s.cogs)}`} icon={<TrendingUp size={20} />} tone="violet" />
        <StatCard label="Net Profit" value={money(data.net_profit)} sub={`expenses ${money(data.expenses.expense_total)}`} icon={<Wallet size={20} />} tone={data.net_profit >= 0 ? 'emerald' : 'rose'} />
        <StatCard label="Products" value={num(data.inventory.total_products)} icon={<Package size={20} />} tone="sky" />
        <StatCard label="Low Stock" value={num(data.inventory.low_stock)} sub="need reorder" icon={<AlertTriangle size={20} />} tone="amber" />
        <StatCard label="Out of Stock" value={num(data.inventory.out_of_stock)} icon={<XCircle size={20} />} tone="rose" />
        <StatCard label="Pending Supplier Payments" value={money(data.purchases.pending_payments)} sub={`${num(data.purchases.purchase_count)} purchases`} icon={<ShoppingBag size={20} />} tone="amber" />
        <StatCard label="Customers" value={num(data.counts.customers)} icon={<Users size={20} />} tone="indigo" />
        <StatCard label="Suppliers" value={num(data.counts.suppliers)} icon={<Truck size={20} />} tone="sky" />
        <StatCard label="Refunds" value={money(data.refunds.refund_total)} sub={`${num(data.refunds.refund_count)} returns`} icon={<XCircle size={20} />} tone="rose" />
        <StatCard label="Purchases" value={money(data.purchases.purchase_total)} icon={<ShoppingBag size={20} />} tone="violet" />
      </div>

      {/* Revenue & profit chart */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <h3 className="font-semibold text-sm mb-3">Revenue & Profit</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b820" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => money(v)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#rev)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#prof)" strokeWidth={2} name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Sales by Payment Method</h3>
          <div className="h-72">
            {data.byPayment.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data.byPayment.map((p: any) => ({ name: p.payment_method.replace('_', ' '), value: Number(p.amount) }))}
                    dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {data.byPayment.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => money(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-400 text-center pt-24">No sales in this period</p>}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Sales by category */}
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Sales by Category</h3>
          <div className="h-64">
            {data.byCategory.length ? (
              <ResponsiveContainer>
                <BarChart data={data.byCategory.map((c: any) => ({ name: c.category, amount: Number(c.amount) }))} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => money(v)} />
                  <Bar dataKey="amount" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-400 text-center pt-20">No data</p>}
          </div>
        </Card>

        {/* Best sellers */}
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Best-Selling Products</h3>
          {data.bestSellers.length === 0 && <p className="text-sm text-slate-400 pt-10 text-center">No sales in this period</p>}
          <div className="space-y-2.5">
            {data.bestSellers.map((p: any, i: number) => (
              <div key={p.product_id} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.product_name}</p>
                  <p className="text-xs text-slate-400">{num(p.units_sold)} units</p>
                </div>
                <span className="text-sm font-semibold">{money(p.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent transactions */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Recent Transactions</h3>
            <Link to="/sales" className="text-xs text-indigo-500 hover:underline">View all</Link>
          </div>
          <div className="space-y-2.5">
            {data.recentSales.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400"><Clock size={14} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.invoice_number}</p>
                  <p className="text-xs text-slate-400 truncate">{r.customer_name || 'Walk-in'} · {r.cashier_name} · {fmtDateTime(r.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{money(r.total)}</p>
                  <Badge color={r.status === 'completed' ? 'green' : r.status === 'cancelled' ? 'red' : 'amber'}>{r.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
