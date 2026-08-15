import React, { useEffect, useState } from 'react';
import { Store, ShoppingBag } from 'lucide-react';
import { useSettingsStore } from '../stores/settings';
import { money } from '../utils/format';

interface DisplayState {
  items: { name: string; quantity: number; unit_price: number; discount: number; tax_rate: number }[];
  totals: { subtotal: number; discount: number; tax: number; total: number };
  status: 'idle' | 'cart' | 'paid';
  invoice?: string;
  change?: number;
}

/**
 * Customer-facing display (second screen).
 * Open /customer-display in a second window/monitor — it mirrors the active POS cart in real time
 * via the storage event (same browser profile), with a BroadcastChannel fallback.
 */
export default function CustomerDisplay() {
  const settings = useSettingsStore((s) => s.settings);
  const [state, setState] = useState<DisplayState>({ items: [], totals: { subtotal: 0, discount: 0, tax: 0, total: 0 }, status: 'idle' });

  useEffect(() => {
    useSettingsStore.getState().load();
    const read = () => {
      try {
        const raw = localStorage.getItem('pos-customer-display');
        if (raw) setState(JSON.parse(raw));
      } catch { /* ignore */ }
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === 'pos-customer-display') read(); };
    window.addEventListener('storage', onStorage);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('pos-customer-display');
      bc.onmessage = (e) => setState(e.data);
    } catch { /* unsupported */ }
    return () => { window.removeEventListener('storage', onStorage); bc?.close(); };
  }, []);

  const { items, totals, status } = state;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white flex flex-col">
      {/* header */}
      <header className="flex items-center gap-3 px-8 py-5 border-b border-white/10">
        {settings.business_logo
          ? <img src={settings.business_logo} alt="" className="h-10 w-10 object-contain rounded-lg bg-white/10 p-1" />
          : <div className="p-2 bg-indigo-600 rounded-xl"><Store size={22} /></div>}
        <div>
          <p className="font-bold text-lg">{settings.business_name || 'SmartMart'}</p>
          <p className="text-xs text-white/40">{settings.business_phone}</p>
        </div>
        <p className="ml-auto text-white/40 text-sm">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </header>

      {status === 'paid' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-7xl">🙏</div>
          <h1 className="text-4xl font-bold">Thank you!</h1>
          {state.invoice && <p className="text-white/50 font-mono">{state.invoice}</p>}
          {Number(state.change) > 0 && (
            <div className="mt-2 px-8 py-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-center">
              <p className="text-emerald-300 text-sm">Your change</p>
              <p className="text-4xl font-bold text-emerald-300">{money(state.change)}</p>
            </div>
          )}
          <p className="text-white/40 mt-4">{settings.receipt_footer || 'Please come again!'}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30">
          <ShoppingBag size={72} strokeWidth={1} />
          <p className="text-2xl font-light">Welcome — we're ready to serve you</p>
        </div>
      ) : (
        <div className="flex-1 flex">
          {/* items */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-white/30 border-b border-white/10">
                  <th className="pb-3">Item</th><th className="pb-3 text-center">Qty</th>
                  <th className="pb-3 text-right">Price</th><th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3.5 text-lg">{it.name}{it.discount > 0 && <span className="text-emerald-400 text-sm ml-2">−{money(it.discount)}</span>}</td>
                    <td className="py-3.5 text-center text-white/60">×{it.quantity}</td>
                    <td className="py-3.5 text-right text-white/60">{money(it.unit_price)}</td>
                    <td className="py-3.5 text-right font-semibold text-lg">
                      {money(Math.max(0, it.unit_price * it.quantity - it.discount) * (1 + (it.tax_rate || 0) / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* totals sidebar */}
          <div className="w-[340px] border-l border-white/10 p-8 flex flex-col justify-end">
            <div className="space-y-2.5 text-white/60">
              <p className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></p>
              {totals.discount > 0 && <p className="flex justify-between text-emerald-400"><span>Savings</span><span>−{money(totals.discount)}</span></p>}
              {totals.tax > 0 && <p className="flex justify-between"><span>Tax</span><span>{money(totals.tax)}</span></p>}
            </div>
            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-white/40 text-sm mb-1">Total to pay</p>
              <p className="text-5xl font-bold tracking-tight">{money(totals.total)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
