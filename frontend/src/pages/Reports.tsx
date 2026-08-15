import React, { useEffect, useState } from 'react';
import { Download, Printer, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import { api, errMsg } from '../api/client';
import { Card, Button, Select, Input, Spinner, Badge } from '../components/ui';
import { money, num, fmtDate, downloadCSV } from '../utils/format';
import { toast } from '../stores/toast';

type Tab = 'sales' | 'products' | 'inventory' | 'customers' | 'suppliers' | 'financial';
const TABS: { v: Tab; l: string }[] = [
  { v: 'sales', l: 'Sales' }, { v: 'products', l: 'Products' }, { v: 'inventory', l: 'Inventory' },
  { v: 'customers', l: 'Customers' }, { v: 'suppliers', l: 'Suppliers' }, { v: 'financial', l: 'Profit & Loss' },
];
const PERIODS = [
  { v: 'today', l: 'Today' }, { v: 'week', l: 'This Week' }, { v: 'month', l: 'This Month' },
  { v: 'year', l: 'This Year' }, { v: 'custom', l: 'Custom' },
];

export default function Reports() {
  const [tab, setTab] = useState<Tab>('sales');
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const params = () => {
    const p: any = {};
    if (period === 'custom' && from && to) { p.from = from; p.to = to; }
    else p.period = period === 'custom' ? 'month' : period;
    return p;
  };

  const load = () => {
    setLoading(true);
    api.get(`/reports/${tab}`, { params: params() })
      .then(({ data }) => setData(data.data))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [tab, period]);

  const exportReport = () => {
    if (!data) return;
    if (tab === 'sales') {
      downloadCSV('sales-report.csv', ['Period', 'Transactions', 'Subtotal', 'Discounts', 'Tax', 'Total', 'COGS', 'Gross Profit'],
        data.rows.map((r: any) => [fmtDate(r.period), r.transactions, r.subtotal, r.discounts, r.tax, r.total, r.cogs, r.gross_profit]));
    } else if (tab === 'inventory') {
      downloadCSV('inventory-report.csv', ['Product', 'SKU', 'Stock', 'Min', 'Stock Value', 'Retail Value'],
        data.rows.map((r: any) => [r.name, r.sku, r.stock, r.min_stock, r.stock_value, r.retail_value]));
    } else if (tab === 'products') {
      downloadCSV('product-report.csv', ['Product', 'SKU', 'Units Sold', 'Revenue', 'Profit'],
        data.best.map((r: any) => [r.product_name, r.sku, r.units, r.revenue, r.profit]));
    } else if (tab === 'customers') {
      downloadCSV('customer-report.csv', ['Customer', 'Phone', 'Orders', 'Total Spent'],
        data.top.map((r: any) => [r.name, r.phone || '', r.orders, r.spent]));
    } else if (tab === 'suppliers') {
      downloadCSV('supplier-report.csv', ['Supplier', 'Orders', 'Purchased', 'Outstanding'],
        data.purchases.map((r: any) => [r.company_name, r.orders, r.purchased, r.owed]));
    } else if (tab === 'financial') {
      downloadCSV('financial-report.csv', ['Metric', 'Amount'], [
        ['Revenue (net of refunds)', data.revenue], ['Tax collected', data.tax_collected],
        ['COGS', data.cogs], ['Gross profit', data.gross_profit],
        ['Expenses', data.expense_total], ['Net profit', data.net_profit],
        ['Profit margin %', data.profit_margin.toFixed(2)],
      ]);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-slate-400">Business intelligence across sales, inventory and finance</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="!w-auto">
            {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </Select>
          {period === 'custom' && <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-auto" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-auto" />
            <Button variant="secondary" onClick={load}>Apply</Button>
          </>}
          <Button variant="secondary" onClick={exportReport}><Download size={15} /> CSV</Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> Print</Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-print">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.v ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t.l}
          </button>
        ))}
      </div>

      <div id="print-area">
        {loading ? <Spinner label="Building report…" /> : !data ? null : (
          <>
            {tab === 'sales' && <SalesReport data={data} />}
            {tab === 'products' && <ProductsReport data={data} />}
            {tab === 'inventory' && <InventoryReport data={data} />}
            {tab === 'customers' && <CustomersReport data={data} />}
            {tab === 'suppliers' && <SuppliersReport data={data} />}
            {tab === 'financial' && <FinancialReport data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

function SalesReport({ data }: any) {
  const rows = data.rows.map((r: any) => ({ ...r, label: fmtDate(r.period), total: Number(r.total), gross_profit: Number(r.gross_profit) }));
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Sales & profit by {data.bucket}</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b820" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => money(v)} /><Legend />
              <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} name="Sales" dot={false} />
              <Line type="monotone" dataKey="gross_profit" stroke="#10b981" strokeWidth={2} name="Gross profit" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-3">Period</th><th className="px-4 py-3 text-center">Transactions</th>
              <th className="px-4 py-3 text-right">Discounts</th><th className="px-4 py-3 text-right">Tax</th>
              <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">COGS</th>
              <th className="px-4 py-3 text-right">Gross profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
            {data.rows.map((r: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2.5">{fmtDate(r.period)}</td>
                <td className="px-4 py-2.5 text-center">{r.transactions}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{money(r.discounts)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{money(r.tax)}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{money(r.total)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{money(r.cogs)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{money(r.gross_profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ProductsReport({ data }: any) {
  const Table = ({ title, rows, cols }: any) => (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-3">{title}</h3>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
          {cols.map((c: string) => <th key={c} className="py-2 pr-3">{c}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {rows.map((r: any, i: number) => (
            <tr key={i}>
              <td className="py-2 pr-3">{r.product_name}<span className="text-xs text-slate-400 ml-1.5">{r.sku}</span></td>
              <td className="py-2 pr-3">{num(r.units)}</td>
              {r.revenue !== undefined && <td className="py-2 pr-3 font-medium">{money(r.revenue)}</td>}
              {r.profit !== undefined && <td className="py-2 font-medium text-emerald-600">{money(r.profit)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Table title="Best-selling products" rows={data.best} cols={['Product', 'Units', 'Revenue', 'Profit']} />
      <Table title="Most profitable products" rows={data.profitable} cols={['Product', 'Units', 'Profit']} />
      <Card className="p-4 lg:col-span-2">
        <h3 className="font-semibold text-sm mb-3">Slow-moving products (fewest sales in period)</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.worst.map((r: any) => (
            <div key={r.product_id} className="flex justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm">
              <span className="truncate">{r.product_name}</span>
              <span className="text-slate-400 shrink-0 ml-2">{num(r.units)} sold</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function InventoryReport({ data }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center"><p className="text-xs text-slate-400">Total units</p><p className="text-xl font-bold">{num(data.totals.units)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-slate-400">Inventory value (cost)</p><p className="text-xl font-bold">{money(data.totals.stock_value)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-slate-400">Retail value</p><p className="text-xl font-bold">{money(data.totals.retail_value)}</p></Card>
      </div>
      <Card>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Product</th><th className="px-4 py-3 text-center">Stock</th>
                <th className="px-4 py-3 text-right">Stock value</th><th className="px-4 py-3 text-right">Retail value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
              {data.rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">{r.name}<span className="text-xs text-slate-400 ml-1.5">{r.sku}</span></td>
                  <td className="px-4 py-2.5 text-center font-semibold">{r.stock}</td>
                  <td className="px-4 py-2.5 text-right">{money(r.stock_value)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{money(r.retail_value)}</td>
                  <td className="px-4 py-2.5">
                    {Number(r.stock) <= 0 ? <Badge color="red">out</Badge> : Number(r.stock) <= r.min_stock ? <Badge color="amber">low</Badge> : <Badge color="green">ok</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {data.damaged.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Recent damaged stock</h3>
          {data.damaged.map((d: any, i: number) => (
            <div key={i} className="flex justify-between py-1.5 text-sm border-b border-slate-50 dark:border-slate-800/50 last:border-0">
              <span>{d.name} × {d.quantity} <span className="text-xs text-slate-400">— {d.reason}</span></span>
              <span className="text-slate-400 text-xs">{fmtDate(d.created_at)} · {d.user_name}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function CustomersReport({ data }: any) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Top customers</h3>
        {data.top.length === 0 && <p className="text-sm text-slate-400">No customer sales in this period</p>}
        {data.top.map((c: any, i: number) => (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
            <span className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <div className="flex-1"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-slate-400">{c.phone} · {c.orders} orders</p></div>
            <span className="font-semibold text-sm">{money(c.spent)}</span>
          </div>
        ))}
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Outstanding customer balances</h3>
        {data.balances.length === 0 ? <p className="text-sm text-slate-400">No outstanding balances 🎉</p> :
          data.balances.map((c: any) => (
            <div key={c.id} className="flex justify-between py-2 text-sm border-b border-slate-50 dark:border-slate-800/50 last:border-0">
              <span>{c.name} <span className="text-xs text-slate-400">{c.phone}</span></span>
              <span className="font-semibold text-rose-500">{money(c.outstanding_balance)}</span>
            </div>
          ))}
      </Card>
    </div>
  );
}

function SuppliersReport({ data }: any) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Purchases by supplier</h3>
        {data.purchases.map((s: any) => (
          <div key={s.id} className="flex justify-between py-2 text-sm border-b border-slate-50 dark:border-slate-800/50 last:border-0">
            <span>{s.company_name} <span className="text-xs text-slate-400">· {s.orders} orders</span></span>
            <span className="font-semibold">{money(s.purchased)}</span>
          </div>
        ))}
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Outstanding supplier balances</h3>
        {data.balances.length === 0 ? <p className="text-sm text-slate-400">All suppliers paid 🎉</p> :
          data.balances.map((s: any) => (
            <div key={s.id} className="flex justify-between py-2 text-sm border-b border-slate-50 dark:border-slate-800/50 last:border-0">
              <span>{s.company_name}</span>
              <span className="font-semibold text-rose-500">{money(s.balance)}</span>
            </div>
          ))}
      </Card>
    </div>
  );
}

function FinancialReport({ data }: any) {
  const Row = ({ label, value, bold, negative, indent }: any) => (
    <div className={`flex justify-between py-2.5 ${bold ? 'font-bold text-base' : 'text-sm'} ${indent ? 'pl-6' : ''}`}>
      <span className={bold ? '' : 'text-slate-500'}>{label}</span>
      <span className={negative ? 'text-rose-500' : bold ? '' : ''}>{negative ? `(${money(Math.abs(value))})` : money(value)}</span>
    </div>
  );
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-2">Profit & Loss Statement</h3>
        <p className="text-xs text-slate-400 mb-4">{fmtDate(data.range.from)} — {fmtDate(data.range.to)}</p>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <Row label={`Revenue (${num(data.transactions)} sales, net of refunds)`} value={data.revenue} />
          <Row label="Cost of goods sold" value={-data.cogs} negative />
          <Row label="Gross profit" value={data.gross_profit} bold />
          <Row label="Operating expenses" value={-data.expense_total} negative />
          <div className={`flex justify-between py-3 font-bold text-lg ${data.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className="flex items-center gap-1.5">{data.net_profit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />} Net profit</span>
            <span>{money(data.net_profit)}</span>
          </div>
          <Row label="Profit margin" value={0} />
        </div>
        <p className="text-right -mt-8 font-semibold">{data.profit_margin.toFixed(1)}%</p>
        <p className="text-xs text-slate-400 mt-4">Tax collected (not revenue): {money(data.tax_collected)} · Discounts given: {money(data.discounts)} · Refunds: {money(data.refunds)}</p>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-4">Expenses by category</h3>
        {data.expenses.length === 0 ? <p className="text-sm text-slate-400">No expenses in this period</p> : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.expenses.map((e: any) => ({ name: e.category, amount: Number(e.amount) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b820" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => money(v)} />
                <Bar dataKey="amount" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 divide-y divide-slate-50 dark:divide-slate-800/50">
          {data.expenses.map((e: any) => (
            <div key={e.category} className="flex justify-between py-1.5 text-sm">
              <span className="capitalize text-slate-500">{e.category}</span>
              <span className="font-medium">{money(e.amount)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
