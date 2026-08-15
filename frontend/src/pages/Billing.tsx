import React, { useEffect, useState } from 'react';
import {
  CreditCard, CheckCircle2, XCircle, Crown, Zap, Store, Receipt as ReceiptIcon,
  AlertTriangle, Users, Package, Building2, Loader2, KeySquare,
} from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Badge, Spinner, Modal, ConfirmDialog, EmptyState } from '../components/ui';
import { money, fmtDateTime, fmtDate } from '../utils/format';

/** Subscription plans are priced in USD regardless of the store's trading currency. */
const usd = (n: number | string) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
import { toast } from '../stores/toast';
import { useSubscriptionStore } from '../stores/subscription';

const PLAN_ICONS: Record<string, React.ReactNode> = {
  basic: <Store size={22} />, standard: <Zap size={22} />, pro: <Crown size={22} />,
};
const PLAN_COLORS: Record<string, string> = {
  basic: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
  standard: 'text-sky-600 bg-sky-50 dark:bg-sky-950',
  pro: 'text-violet-600 bg-violet-50 dark:bg-violet-950',
};

/** Human-readable feature list per plan, in display order. */
const FEATURE_ROWS: [string, string][] = [
  ['pos', 'POS terminal & barcode checkout'],
  ['products', 'Products & catalog'],
  ['inventory', 'Inventory & stock movements'],
  ['customers', 'Customer CRM'],
  ['returns', 'Returns & refunds'],
  ['dashboard', 'Dashboard'],
  ['suppliers', 'Supplier management'],
  ['purchases', 'Purchases & purchase returns'],
  ['expenses', 'Expense tracking'],
  ['reports', 'Reports & profit/loss'],
  ['shifts', 'Shifts & cash drawer (Z-reports)'],
  ['quotations', 'Quotations'],
  ['pdf_invoices', 'PDF invoices'],
  ['loyalty', 'Loyalty points program'],
  ['price_tiers', 'Wholesale price tiers'],
  ['batch_expiry', 'Batch & expiry tracking'],
  ['kitchen', 'Kitchen display (restaurant mode)'],
  ['email_receipts', 'Email receipts'],
  ['audit_logs', 'Audit logs'],
  ['backup', 'Database backup'],
  ['multi_branch', 'Unlimited branches'],
];

export default function Billing() {
  const { subscription, plans, usage, load, loaded } = useSubscriptionStore();
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [checkout, setCheckout] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);

  const loadInvoices = () => api.get('/billing/invoices').then(({ data }) => setInvoices(data.data)).catch(() => {});
  useEffect(() => { load(); loadInvoices(); }, []);

  if (!loaded || !subscription) return <Spinner label="Loading billing…" />;

  const current = subscription.effective_plan as string;
  const isTrial = subscription.status === 'trial';
  const isCancelled = subscription.status === 'cancelled';
  const isExpired = subscription.is_expired;

  const doCancel = async () => {
    setCancelLoading(true);
    try {
      const { data } = await api.post('/billing/cancel');
      toast.success(data.data.message);
      setCancelOpen(false);
      load();
    } catch (e) { toast.error(errMsg(e)); }
    setCancelLoading(false);
  };

  const usageBar = (label: string, icon: React.ReactNode, used: number, limit: number | null) => {
    const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    const near = limit && used / limit >= 0.8;
    return (
      <div key={label}>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="flex items-center gap-1.5 text-slate-500">{icon} {label}</span>
          <span className={`font-semibold ${near ? 'text-amber-500' : ''}`}>{used} / {limit ?? '∞'}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className={`h-full rounded-full ${near ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: limit ? `${pct}%` : '4%' }} />
        </div>
      </div>
    );
  };

  const planLimits = plans[current]?.limits;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold">Billing & Subscription</h1>
        <p className="text-sm text-slate-400">Manage your plan, payment history and usage</p>
      </div>

      {/* Status banners */}
      {isTrial && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-sm">
          <Crown size={16} />
          <span>You're on a <b>free Pro trial</b> — {subscription.days_left} day(s) remaining. Choose a plan below to keep your features after the trial ends.</span>
        </div>
      )}
      {(isCancelled || isExpired) && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
          <AlertTriangle size={16} />
          <span>{isCancelled ? 'Your subscription is cancelled' : 'Your subscription has expired'} — you're limited to <b>Basic</b> features. Your data is untouched; resubscribe to unlock everything.</span>
        </div>
      )}

      {/* Current plan + usage */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Current plan</p>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${PLAN_COLORS[current]}`}>{PLAN_ICONS[current]}</div>
            <div>
              <p className="text-lg font-bold">{plans[current]?.name}
                {isTrial && <Badge color="purple">trial</Badge>}
                {isCancelled && <Badge color="red">cancelled</Badge>}
              </p>
              <p className="text-xs text-slate-400">{plans[current]?.tagline}</p>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-sm text-slate-500">
            {subscription.expires_at && !isCancelled && (
              <p>{isTrial ? 'Trial ends' : 'Renews / expires'}: <b className="text-slate-700 dark:text-slate-200">{fmtDate(subscription.expires_at)}</b></p>
            )}
            <p>Billing period: <b className="text-slate-700 dark:text-slate-200 capitalize">{subscription.period}</b></p>
          </div>
          {!isCancelled && current !== 'basic' && (
            <Button variant="secondary" className="mt-4 w-full text-rose-500 hover:!bg-rose-50 dark:hover:!bg-rose-950" onClick={() => setCancelOpen(true)}>
              Cancel subscription
            </Button>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Plan usage</p>
          <div className="space-y-4">
            {usageBar('Active users', <Users size={14} />, usage.users, planLimits?.max_users ?? null)}
            {usageBar('Products', <Package size={14} />, usage.products, planLimits?.max_products ?? null)}
            {usageBar('Branches', <Building2 size={14} />, usage.branches, planLimits?.max_branches ?? null)}
          </div>
        </Card>
      </div>

      {/* Plan cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Plans</h2>
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 text-sm">
            <button onClick={() => setPeriod('monthly')} className={`px-3.5 py-1.5 rounded-lg font-medium ${period === 'monthly' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Monthly</button>
            <button onClick={() => setPeriod('yearly')} className={`px-3.5 py-1.5 rounded-lg font-medium ${period === 'yearly' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
              Yearly <span className={period === 'yearly' ? 'text-indigo-200' : 'text-emerald-500'}>−17%</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {(['basic', 'standard', 'pro'] as const).map((key) => {
            const p = plans[key];
            if (!p) return null;
            const price = period === 'yearly' ? p.price_yearly : p.price_monthly;
            const isCurrent = current === key && !isCancelled && !isExpired && !isTrial;
            const highlight = key === 'standard';
            return (
              <Card key={key} className={`p-5 flex flex-col relative ${highlight ? 'border-indigo-400 dark:border-indigo-600 border-2' : ''}`}>
                {highlight && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide">Most popular</span>}
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`p-2 rounded-lg ${PLAN_COLORS[key]}`}>{PLAN_ICONS[key]}</div>
                  <p className="font-bold text-lg">{p.name}</p>
                </div>
                <p className="text-xs text-slate-400 mb-3 min-h-[2em]">{p.tagline}</p>
                <p className="mb-4">
                  <span className="text-3xl font-bold">{price === 0 ? 'Free' : usd(price)}</span>
                  {price > 0 && <span className="text-sm text-slate-400"> / {period === 'yearly' ? 'year' : 'month'}</span>}
                </p>
                <div className="space-y-1.5 flex-1 mb-4">
                  {FEATURE_ROWS.map(([code, label]) => {
                    const has = p.features.includes(code) || (code === 'multi_branch' && key === 'pro');
                    return (
                      <div key={code} className={`flex items-start gap-2 text-[13px] ${has ? '' : 'text-slate-300 dark:text-slate-600'}`}>
                        {has ? <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                        {label}
                      </div>
                    );
                  })}
                  <div className="pt-1.5 text-[13px] text-slate-500">
                    <p>Up to <b>{p.limits.max_users ?? 'unlimited'}</b> users · <b>{p.limits.max_products ?? 'unlimited'}</b> products · <b>{p.limits.max_branches ?? 'unlimited'}</b> branch(es)</p>
                  </div>
                </div>
                {isCurrent ? (
                  <Button variant="secondary" disabled className="w-full">Current plan</Button>
                ) : (
                  <Button variant={highlight ? 'primary' : 'secondary'} className="w-full" onClick={() => setCheckout(key)}>
                    {price === 0 ? 'Switch to Basic' : (plans[current]?.rank ?? 0) > p.rank && !isTrial ? `Downgrade to ${p.name}` : `Choose ${p.name}`}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Offline license activation (desktop edition) */}
      <LicenseCard onActivated={() => { load(); loadInvoices(); }} />

      {/* Payment history */}
      <Card>
        <p className="px-4 py-3 text-sm font-semibold border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <ReceiptIcon size={15} /> Payment history
        </p>
        {invoices.length === 0 ? (
          <EmptyState title="No payments yet" subtitle="Subscription payments will appear here" icon={<CreditCard size={36} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Period</th><th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 hidden md:table-cell">Card</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Paid by</th><th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3 capitalize">{inv.plan}</td>
                    <td className="px-4 py-3 hidden sm:table-cell capitalize text-slate-500">{inv.period}</td>
                    <td className="px-4 py-3 text-right font-semibold">{Number(inv.amount) === 0 ? '—' : usd(inv.amount)}</td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-slate-500">{inv.card_last4 ? `•••• ${inv.card_last4}` : '—'}</td>
                    <td className="px-4 py-3"><Badge color="green">{inv.status}</Badge></td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{inv.paid_by}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDateTime(inv.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {checkout && (
        <CheckoutModal
          planKey={checkout} plan={plans[checkout]} period={period}
          onClose={() => setCheckout(null)}
          onDone={() => { setCheckout(null); load(); loadInvoices(); }}
        />
      )}
      <ConfirmDialog
        open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={doCancel} loading={cancelLoading}
        danger title="Cancel subscription?" confirmLabel="Cancel subscription"
        message="Paid features will be locked immediately and you'll be limited to the Basic plan. All your data (sales, products, reports) is kept safe and returns the moment you resubscribe." />
    </div>
  );
}

function LicenseCard({ onActivated }: { onActivated: () => void }) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const activate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/billing/activate-license', { key });
      setResult(data.data.license);
      toast.success(data.data.message);
      setKey('');
      onActivated();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"><KeySquare size={20} /></div>
        <div className="flex-1 min-w-[240px]">
          <p className="font-semibold">Have a license key?</p>
          <p className="text-sm text-slate-400">
            Desktop edition licenses activate your plan offline — no card or internet required.
            Keys look like <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">SMPOS-…</code>
          </p>
          {result && (
            <p className="text-sm text-emerald-600 mt-1.5 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Licensed to <b>{result.customer}</b> — {result.plan} plan, valid until {result.expires}
            </p>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input placeholder="SMPOS-…" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono !text-xs flex-1 sm:w-80" />
          <Button onClick={activate} loading={loading} disabled={!key.trim()}>Activate</Button>
        </div>
      </div>
    </Card>
  );
}

function CheckoutModal({ planKey, plan, period, onClose, onDone }: {
  planKey: string; plan: any; period: 'monthly' | 'yearly'; onClose: () => void; onDone: () => void;
}) {
  const price = period === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCard = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const pay = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/billing/subscribe', {
        plan: planKey, period,
        card: price > 0 ? { number, expiry, cvc } : undefined,
      });
      toast.success(data.data.message);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Subscribe — ${plan.name} (${period})`}>
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 mb-4">
        <div>
          <p className="font-semibold">{plan.name} plan</p>
          <p className="text-xs text-slate-400 capitalize">Billed {period}</p>
        </div>
        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{price === 0 ? 'Free' : usd(price)}</p>
      </div>

      {price > 0 ? (
        <div className="space-y-3">
          <div className="relative">
            <Input label="Card number" placeholder="4242 4242 4242 4242" value={number}
              onChange={(e) => setNumber(formatCard(e.target.value))} className="font-mono pr-10" />
            <CreditCard size={16} className="absolute right-3 bottom-2.5 text-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Expiry (MM/YY)" placeholder="12/28" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} className="font-mono" />
            <Input label="CVC" placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} className="font-mono" />
          </div>
          <p className="text-[11px] text-slate-400">
            Demo payment processor — use <b className="font-mono">4242 4242 4242 4242</b> (success) or <b className="font-mono">…0002</b> (decline). No real charge is made. Swap in Stripe or a local gateway for production.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">The Basic plan is free — no payment details needed. Paid features will be locked immediately.</p>
      )}

      <Button className="w-full mt-5 !py-3" onClick={pay} loading={loading}>
        {loading ? 'Processing…' : price === 0 ? 'Switch to Basic' : `Pay ${usd(price)} & activate`}
      </Button>
    </Modal>
  );
}
