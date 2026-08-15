import React, { useEffect, useState } from 'react';
import {
  Sparkles, AlertTriangle, PackageSearch, Skull, CalendarDays, Flame, RefreshCw, Info,
} from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Spinner, Badge, Button, Input, EmptyState } from '../components/ui';
import { money, num, fmtDate } from '../utils/format';
import { toast } from '../stores/toast';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Insights() {
  const [digest, setDigest] = useState<any>(null);
  const [anoms, setAnoms] = useState<any[]>([]);
  const [reorder, setReorder] = useState<any[]>([]);
  const [dead, setDead] = useState<any>(null);
  const [heat, setHeat] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [digestDate, setDigestDate] = useState('');

  const load = (date?: string) => {
    setLoading(true);
    Promise.all([
      api.get('/insights/digest', { params: date ? { date } : {} }),
      api.get('/insights/anomalies'),
      api.get('/insights/reorder'),
      api.get('/insights/dead-stock'),
      api.get('/insights/heatmap'),
    ]).then(([d, a, r, ds, h]) => {
      setDigest(d.data.data); setAnoms(a.data.data); setReorder(r.data.data);
      setDead(ds.data.data); setHeat(h.data.data);
    }).catch((e) => toast.error(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  if (loading && !digest) return <Spinner label="Crunching your business data…" />;

  const heatMax = Math.max(1, ...heat.map((h) => h.sales));
  const heatCell = (dow: number, hour: number) => heat.find((h) => h.dow === dow && h.hour === hour);
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 – 22:00

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Sparkles size={20} className="text-violet-500" /> Business Insights</h1>
          <p className="text-sm text-slate-400">Automatic intelligence: digest, alerts, reorder advice & trends</p>
        </div>
        <Button variant="secondary" className="ml-auto" onClick={() => load(digestDate || undefined)}><RefreshCw size={14} /> Refresh</Button>
      </div>

      {/* Anomaly flags */}
      {anoms.length > 0 && (
        <div className="space-y-2">
          {anoms.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm ${a.level === 'warning' ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300' : 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300'}`}>
              {a.level === 'warning' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
              <div><p className="font-semibold">{a.title}</p><p className="text-xs opacity-80">{a.detail}</p></div>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Daily digest */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><CalendarDays size={16} className="text-indigo-500" /> Daily digest</h3>
            <Input type="date" value={digestDate} onChange={(e) => { setDigestDate(e.target.value); load(e.target.value); }} className="!w-auto !py-1.5" />
          </div>
          {digest && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
                  <p className="text-xs text-indigo-400">Revenue</p>
                  <p className="font-bold">{money(digest.sales.revenue)}</p>
                  <p className="text-[10px] text-slate-400">{num(digest.sales.count)} sales</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                  <p className="text-xs text-emerald-500">Gross profit</p>
                  <p className="font-bold">{money(digest.sales.gross_profit)}</p>
                </div>
                <div className={`text-center p-3 rounded-xl ${digest.net >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'}`}>
                  <p className={`text-xs ${digest.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Net (after exp/refunds)</p>
                  <p className="font-bold">{money(digest.net)}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {digest.best.length > 0 && (
                  <p className="flex items-start gap-2"><Flame size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    Best sellers: {digest.best.map((b: any) => `${b.product_name} (${b.units})`).join(', ')}</p>
                )}
                <p className="text-slate-500">Refunds: <b className="text-slate-700 dark:text-slate-200">{money(digest.refunds.total)}</b> ({digest.refunds.count}) · Expenses: <b className="text-slate-700 dark:text-slate-200">{money(digest.expenses)}</b> · Discounts given: <b className="text-slate-700 dark:text-slate-200">{money(digest.sales.discounts)}</b></p>
                {digest.low_stock_count > 0 && <p className="text-amber-600 dark:text-amber-400">⚠ {digest.low_stock_count} product(s) at or below minimum stock</p>}
                {digest.shifts.length > 0 && (
                  <p className="text-slate-500">Drawer results: {digest.shifts.map((s: any) => `${s.name} ${Number(s.over_short) === 0 ? '✓ balanced' : (Number(s.over_short) > 0 ? `over ${money(s.over_short)}` : `short ${money(Math.abs(s.over_short))}`)}`).join(' · ')}</p>
                )}
                {digest.by_cashier.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                    {digest.by_cashier.map((c: any) => (
                      <div key={c.name} className="flex justify-between py-1"><span className="text-slate-500">{c.name}</span><span className="font-medium">{money(c.revenue)} <span className="text-xs text-slate-400">({c.sales})</span></span></div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Busiest hours heatmap */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Flame size={16} className="text-orange-500" /> Busiest hours (last 30 days)</h3>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th></th>
                  {hours.map((h) => <th key={h} className="text-[9px] text-slate-400 font-normal px-0.5">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                  <tr key={dow}>
                    <td className="text-[10px] text-slate-400 pr-1.5">{DOW[dow]}</td>
                    {hours.map((h) => {
                      const c = heatCell(dow, h);
                      const intensity = c ? c.sales / heatMax : 0;
                      return (
                        <td key={h} title={c ? `${DOW[dow]} ${h}:00 — ${c.sales} sales, ${money(c.revenue)}` : ''}
                          className="w-5 h-5 rounded"
                          style={{ backgroundColor: intensity ? `rgba(99,102,241,${0.15 + intensity * 0.85})` : 'rgba(148,163,184,0.12)' }} />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">Darker = more sales. Use this for staffing and shift planning.</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Reorder suggestions */}
        <Card>
          <p className="px-4 py-3 text-sm font-semibold border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <PackageSearch size={15} className="text-indigo-500" /> Reorder suggestions <span className="text-xs text-slate-400 font-normal">(30-day sales velocity)</span>
          </p>
          {reorder.length === 0 ? <EmptyState title="Nothing needs reordering" subtitle="All fast-moving products have 2+ weeks of stock cover" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-center">Stock</th>
                    <th className="px-4 py-2.5 text-center">Days left</th><th className="px-4 py-2.5 text-center">Order</th>
                    <th className="px-4 py-2.5 text-right hidden sm:table-cell">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                  {reorder.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[11px] text-slate-400">{Number(r.units_per_day)} /day{r.supplier_name ? ` · ${r.supplier_name}` : ''}</p>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold">{r.stock}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.days_left == null ? '—' : Number(r.days_left) <= 3 ? <Badge color="red">{r.days_left}d</Badge> : Number(r.days_left) <= 7 ? <Badge color="amber">{r.days_left}d</Badge> : <span className="text-slate-500">{r.days_left}d</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center font-bold text-indigo-600">{num(r.suggested_order)}</td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell text-slate-500">{money(r.estimated_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Dead stock */}
        <Card>
          <p className="px-4 py-3 text-sm font-semibold border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Skull size={15} className="text-slate-400" /> Dead stock <span className="text-xs text-slate-400 font-normal">(no sales in 60+ days)</span>
            {dead && dead.rows.length > 0 && <span className="ml-auto text-xs text-rose-500 font-semibold">{money(dead.tied_capital_total)} tied up</span>}
          </p>
          {!dead || dead.rows.length === 0 ? <EmptyState title="No dead stock 🎉" subtitle="Everything in your inventory has sold recently" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-center">Stock</th>
                    <th className="px-4 py-2.5 text-right">Capital tied</th><th className="px-4 py-2.5 hidden sm:table-cell">Last sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                  {dead.rows.map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-center">{r.stock}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-rose-500">{money(r.tied_capital)}</td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-slate-500">{r.last_sold ? fmtDate(r.last_sold) : 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
