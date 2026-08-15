import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Barcode, Search, Plus, Minus, Trash2, User, CreditCard, Banknote, Smartphone,
  Landmark, Percent, Keyboard, PackageX, AlertTriangle, ShoppingCart, Printer, Download,
  CheckCircle2, X, PauseCircle, PlayCircle, Camera, Star, Wallet, Mail, UtensilsCrossed, CloudOff,
  MessageCircle, UserRound, MonitorSmartphone,
} from 'lucide-react';
import { api, errMsg } from '../api/client';
import { sounds } from '../utils/sounds';
import { broadcastDisplay } from '../utils/customerDisplay';
import { useCartStore, cartTotals } from '../stores/cart';
import { useOfflineQueue } from '../stores/offlineQueue';
import { useConnectionStore } from '../stores/connection';
import { useSettingsStore } from '../stores/settings';
import { useSubscriptionStore } from '../stores/subscription';
import { toast } from '../stores/toast';
import { Button, Modal, Input, Badge, EmptyState, Select } from '../components/ui';
import { money } from '../utils/format';
import Receipt from '../components/Receipt';
import type { Product, Sale, Customer } from '../types';

const PAY_METHODS = [
  { v: 'cash', l: 'Cash', icon: <Banknote size={18} /> },
  { v: 'card', l: 'Card', icon: <CreditCard size={18} /> },
  { v: 'bank_transfer', l: 'Bank', icon: <Landmark size={18} /> },
  { v: 'mobile', l: 'Mobile', icon: <Smartphone size={18} /> },
];

export default function POS() {
  const cart = useCartStore();
  const totals = cartTotals(cart.items, cart.orderDiscount);
  const online = useConnectionStore((s) => s.online);
  const offlineQueue = useOfflineQueue();
  const settings = useSettingsStore((s) => s.settings);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [customerModal, setCustomerModal] = useState(false);
  const [discountModal, setDiscountModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [holdModal, setHoldModal] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pinSwitchOpen, setPinSwitchOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [orderType, setOrderType] = useState<'counter' | 'kitchen'>('counter');

  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync any queued offline sales when connection returns
  useEffect(() => { if (online) offlineQueue.sync(); }, [online]);

  // Mirror cart to the customer display (second screen)
  useEffect(() => {
    broadcastDisplay({ items: cart.items, totals, status: cart.items.length ? 'cart' : 'idle' });
  }, [cart.items, cart.orderDiscount]);

  // Auto-apply active promotions as line discounts whenever quantities change
  const promoTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!cart.items.length) return;
    clearTimeout(promoTimer.current);
    promoTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/promotions/evaluate', {
          items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
        });
        for (const d of data.data as { product_id: number; discount: number; promo_name: string }[]) {
          const line = cart.items.find((i) => i.product_id === d.product_id);
          if (line && Math.abs(line.discount - d.discount) > 0.005) {
            cart.setLineDiscount(d.product_id, d.discount);
            toast.info(`${d.promo_name} applied — saved ${money(d.discount)}`);
          }
        }
      } catch { /* promos are best-effort */ }
    }, 400);
  }, [cart.items.map((i) => `${i.product_id}:${i.quantity}`).join(',')]);

  const loadProducts = useCallback((q: string, cat: number | null) => {
    setLoadingProducts(true);
    api.get('/products', { params: { search: q || undefined, category_id: cat || undefined, status: 'active', limit: 60 } })
      .then(({ data }) => setProducts(data.data))
      .catch((e) => { if (online) toast.error(errMsg(e)); })
      .finally(() => setLoadingProducts(false));
  }, [online]);

  const refreshHeld = useCallback(() => {
    api.get('/held-sales').then(({ data }) => setHeldCount(data.data.length)).catch(() => {});
  }, []);

  useEffect(() => {
    loadProducts('', null);
    refreshHeld();
    api.get('/categories').then(({ data }) => setCategories(data.data.filter((c: any) => c.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadProducts(search, activeCategory), 250);
  }, [search, activeCategory]);

  const handleScan = async (code: string) => {
    if (!code.trim()) return;
    try {
      const { data } = await api.get('/products/lookup', { params: { code: code.trim() } });
      const p: Product & { weight_info?: any } = data.data;
      // Weight-embedded barcode: add as a priced line for the scanned weight
      if (p.weight_info) {
        const res = cart.addProduct({ ...p, name: `${p.name} (${p.weight_info.kg} kg)`, selling_price: String(p.weight_info.computed_price), discount_price: null } as Product);
        if (!res.ok) { sounds.scanError(); toast.warning(res.message!); }
        else { sounds.scanOk(); toast.info(`${p.name}: ${p.weight_info.kg} kg @ ${money(p.weight_info.price_per_kg)}/kg = ${money(p.weight_info.computed_price)}`); }
        return;
      }
      const res = cart.addProduct(p);
      if (!res.ok) { sounds.scanError(); toast.warning(res.message!); }
      else {
        sounds.scanOk();
        if (p.stock > 0 && p.stock <= p.min_stock) toast.warning(`Low stock: ${p.name} (${p.stock} left)`);
      }
    } catch (e: any) {
      sounds.scanError();
      const code_ = e?.response?.data?.code;
      if (code_ === 'BARCODE_NOT_FOUND') toast.error(`Unknown barcode: ${code}`);
      else toast.error(errMsg(e));
    }
  };

  useEffect(() => {
    const iv = setInterval(() => {
      const anyModal = customerModal || discountModal || payModal || helpModal || holdModal || cameraOpen || !!receipt;
      const active = document.activeElement;
      const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
      if (!anyModal && !isTyping) barcodeRef.current?.focus();
    }, 800);
    return () => clearInterval(iv);
  }, [customerModal, discountModal, payModal, helpModal, holdModal, cameraOpen, receipt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F4') { e.preventDefault(); setCustomerModal(true); }
      else if (e.key === 'F6') { e.preventDefault(); setDiscountModal(true); }
      else if (e.key === 'F7') { e.preventDefault(); setHoldModal(true); }
      else if (e.key === 'F8' || e.key === 'F9') { e.preventDefault(); if (cart.items.length) setPayModal(true); }
      else if (e.key === 'F1') { e.preventDefault(); setHelpModal(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart.items.length]);

  const addToCart = (p: Product) => {
    const res = cart.addProduct(p);
    if (!res.ok) toast.warning(res.message!);
  };

  const holdCurrent = async (label: string) => {
    try {
      await api.post('/held-sales', {
        label, cart: cart.items, customer_id: cart.customerId, customer_name: cart.customerName,
      });
      cart.clear();
      refreshHeld();
      toast.success('Sale parked — recall it any time');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const kitchenEnabled = settings.kitchen_mode === 'true' && useSubscriptionStore.getState().hasFeature('kitchen');

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* LEFT */}
      <div className="flex-1 flex flex-col min-w-0 p-3 lg:p-4 gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Barcode size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
            <input
              ref={barcodeRef} autoFocus
              placeholder="Scan barcode or type SKU + Enter…"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-sm font-mono focus:outline-none focus:border-indigo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleScan((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          </div>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products (F2)…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPinSwitchOpen(true)} title="Switch cashier (PIN)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 text-sm hover:border-indigo-400">
              <UserRound size={16} />
            </button>
            <button onClick={() => window.open('/customer-display', '_blank', 'popup=no')} title="Open customer display (second screen)"
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 text-sm hover:border-indigo-400">
              <MonitorSmartphone size={16} />
            </button>
            <button onClick={() => setCameraOpen(true)} title="Scan with camera"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 text-sm hover:border-indigo-400">
              <Camera size={16} />
            </button>
            <button onClick={() => setHoldModal(true)} title="Held sales (F7)"
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 text-sm hover:border-indigo-400">
              <PauseCircle size={16} />
              {heldCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{heldCount}</span>}
            </button>
            <button onClick={() => setHelpModal(true)} title="Keyboard shortcuts (F1)"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 text-sm hover:border-indigo-400">
              <Keyboard size={16} />
            </button>
          </div>
        </div>

        {!online && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
            <CloudOff size={15} /> Offline mode — sales will be queued locally and synced automatically.
            {offlineQueue.queue.length > 0 && <b>{offlineQueue.queue.length} sale(s) queued</b>}
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setActiveCategory(null)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!activeCategory ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(c.id === activeCategory ? null : c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${activeCategory === c.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loadingProducts && products.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <EmptyState title="No products found" subtitle="Try a different search or category" icon={<PackageX size={40} />} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {products.map((p) => {
                const out = p.stock <= 0;
                const low = !out && p.stock <= p.min_stock;
                return (
                  <button key={p.id} onClick={() => addToCart(p)} disabled={out}
                    className={`text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:border-indigo-400 hover:shadow-md transition-all ${out ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}`}>
                    <div className="h-14 rounded-lg bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/50 flex items-center justify-center text-indigo-300 dark:text-slate-600 mb-2 text-lg font-bold overflow-hidden">
                      {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : p.name.charAt(0)}
                    </div>
                    <p className="text-[13px] font-medium leading-tight line-clamp-2 min-h-[2.1em]">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.sku}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{money(p.discount_price ?? p.selling_price)}</span>
                      {out ? <Badge color="red">out</Badge> : low ? <Badge color="amber">low · {p.stock}</Badge> : <span className="text-[10px] text-slate-400">{p.stock} in stock</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: cart */}
      <div className="w-full lg:w-[400px] xl:w-[430px] bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col max-h-[60vh] lg:max-h-none">
        <button onClick={() => setCustomerModal(true)}
          className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left">
          <div className="p-2 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-500"><User size={16} /></div>
          <div className="flex-1">
            <p className="text-sm font-medium">{cart.customerName}</p>
            <p className="text-[11px] text-slate-400">Change customer (F4)</p>
          </div>
          {kitchenEnabled && (
            <button onClick={(e) => { e.stopPropagation(); setOrderType(orderType === 'counter' ? 'kitchen' : 'counter'); }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${orderType === 'kitchen' ? 'bg-orange-50 dark:bg-orange-950 border-orange-300 text-orange-600' : 'border-slate-200 dark:border-slate-700 text-slate-400'}`}>
              <UtensilsCrossed size={12} /> {orderType === 'kitchen' ? 'Kitchen order' : 'Counter'}
            </button>
          )}
        </button>

        <div className="flex-1 overflow-y-auto">
          {cart.items.length === 0 ? (
            <EmptyState title="Cart is empty" subtitle="Scan a barcode or tap a product to begin" icon={<ShoppingCart size={36} />} />
          ) : cart.items.map((item) => (
            <div key={item.product_id} className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/70 flex gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-[11px] text-slate-400">{money(item.unit_price)} each{item.discount > 0 && <span className="text-rose-400"> · −{money(item.discount)}</span>}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button onClick={() => item.quantity > 1 ? cart.setQuantity(item.product_id, item.quantity - 1) : cart.remove(item.product_id)}
                    className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><Minus size={13} /></button>
                  <input type="number" min={1} max={item.stock} value={item.quantity}
                    onChange={(e) => cart.setQuantity(item.product_id, Number(e.target.value) || 1)}
                    className="w-12 h-7 text-center text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent" />
                  <button onClick={() => {
                    if (item.quantity + 1 > item.stock) { toast.warning(`Only ${item.stock} in stock`); return; }
                    cart.setQuantity(item.product_id, item.quantity + 1);
                  }} className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><Plus size={13} /></button>
                  <LineDiscountButton item={item} onSet={(d) => cart.setLineDiscount(item.product_id, d)} />
                </div>
              </div>
              <div className="flex flex-col items-end justify-between">
                <button onClick={() => cart.remove(item.product_id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={15} /></button>
                <p className="text-sm font-bold">{money(Math.max(0, item.unit_price * item.quantity - item.discount) * (1 + item.tax_rate / 100))}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
          <div className="flex justify-between text-sm text-slate-500"><span>Subtotal ({totals.itemCount} items)</span><span>{money(totals.subtotal)}</span></div>
          <div className="flex justify-between text-sm text-slate-500">
            <button onClick={() => setDiscountModal(true)} className="flex items-center gap-1 text-indigo-500 hover:underline"><Percent size={13} /> Discount (F6)</button>
            <span className="text-rose-500">−{money(totals.discount)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500"><span>Tax</span><span>{money(totals.tax)}</span></div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="font-semibold">Grand Total</span>
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{money(totals.total)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button variant="secondary" disabled={!cart.items.length} onClick={() => cart.clear()}>Clear</Button>
            <Button variant="secondary" disabled={!cart.items.length} onClick={() => setHoldModal(true)} title="Park this sale (F7)">
              <PauseCircle size={15} /> Hold
            </Button>
            <Button variant="success" disabled={!cart.items.length} onClick={() => setPayModal(true)} className="!py-3">
              Pay (F8)
            </Button>
          </div>
        </div>
      </div>

      <CustomerModal open={customerModal} onClose={() => setCustomerModal(false)} />
      <DiscountModal open={discountModal} onClose={() => setDiscountModal(false)} subtotal={totals.subtotal} />
      <PaymentModal open={payModal} onClose={() => setPayModal(false)} total={totals.total} orderType={orderType}
        onComplete={(sale) => { setPayModal(false); cart.clear(); if (sale) setReceipt(sale); }} />
      <HelpModal open={helpModal} onClose={() => setHelpModal(false)} />
      <HoldModal open={holdModal} onClose={() => { setHoldModal(false); refreshHeld(); }} onHold={holdCurrent} hasCart={cart.items.length > 0} />
      {cameraOpen && <CameraScanner onClose={() => setCameraOpen(false)} onScan={(code) => { setCameraOpen(false); handleScan(code); }} />}
      {pinSwitchOpen && <PinSwitchModal onClose={() => setPinSwitchOpen(false)} />}
      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

// ---------- cashier PIN switching ----------
function PinSwitchModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [myPin, setMyPin] = useState('');
  const [tab, setTab] = useState<'switch' | 'setpin'>('switch');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/pin-users').then(({ data }) => setUsers(data.data)).catch(() => {});
  }, []);

  const doSwitch = async () => {
    if (!selected || pin.length < 4) return;
    setLoading(true);
    try {
      const { data } = await api.post('/auth/pin-login', { user_id: selected.id, pin });
      const { useAuthStore } = await import('../stores/auth');
      const cur = useAuthStore.getState();
      cur.setAuth(data.data.token, cur.refreshToken || '', data.data.user);
      toast.success(`Switched to ${data.data.user.name}`);
      onClose();
    } catch (e) { toast.error(errMsg(e)); setPin(''); }
    setLoading(false);
  };

  const savePin = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/set-pin', { pin: myPin });
      toast.success(data.data.message);
      setTab('switch'); setMyPin('');
      api.get('/auth/pin-users').then(({ data }) => setUsers(data.data)).catch(() => {});
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  const Keypad = ({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) => (
    <div className="grid grid-cols-3 gap-2 max-w-[220px] mx-auto">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button key={n} onClick={() => value.length < 6 && onChange(value + n)}
          className="h-13 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950 text-lg font-bold transition-colors">{n}</button>
      ))}
      <button onClick={() => onChange(value.slice(0, -1))} className="py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm">⌫</button>
      <button onClick={() => value.length < 6 && onChange(value + '0')} className="py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-lg font-bold">0</button>
      <button onClick={onSubmit} disabled={value.length < 4} className="py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40">OK</button>
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Switch cashier">
      <div className="flex gap-1 mb-4 border-b border-slate-100 dark:border-slate-800">
        {(['switch', 'setpin'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400'}`}>
            {t === 'switch' ? 'Switch user' : 'Set my PIN'}
          </button>
        ))}
      </div>

      {tab === 'setpin' ? (
        <div className="text-center">
          <p className="text-sm text-slate-500 mb-3">Set a 4–6 digit PIN for quick switching at this terminal.</p>
          <p className="text-2xl font-mono tracking-[0.4em] h-9 mb-3">{'•'.repeat(myPin.length) || <span className="text-slate-300 text-base tracking-normal">enter PIN</span>}</p>
          <Keypad value={myPin} onChange={setMyPin} onSubmit={savePin} />
        </div>
      ) : !selected ? (
        <div className="grid grid-cols-2 gap-2">
          {users.length === 0 && <p className="col-span-2 text-sm text-slate-400 text-center py-6">No users have a PIN yet. Use the "Set my PIN" tab first.</p>}
          {users.map((u) => (
            <button key={u.id} onClick={() => setSelected(u)}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-left">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">{u.name.charAt(0)}</div>
              <div><p className="text-sm font-medium">{u.name}</p><p className="text-[11px] text-slate-400 capitalize">{u.role_name.replace('_', ' ')}</p></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-slate-500 mb-1">Enter PIN for</p>
          <p className="font-semibold mb-3">{selected.name}</p>
          <p className="text-2xl font-mono tracking-[0.4em] h-9 mb-3">{'•'.repeat(pin.length) || <span className="text-slate-300 text-base tracking-normal">····</span>}</p>
          <Keypad value={pin} onChange={setPin} onSubmit={doSwitch} />
          <button onClick={() => { setSelected(null); setPin(''); }} className="text-xs text-slate-400 mt-3 hover:text-indigo-500">← choose another user</button>
        </div>
      )}
      {loading && <p className="text-center text-xs text-slate-400 mt-2">Please wait…</p>}
    </Modal>
  );
}

// ---------- camera barcode scanner ----------
function CameraScanner({ onClose, onScan }: { onClose: () => void; onScan: (code: string) => void }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let scanner: any = null;
    let stopped = false;
    // Lazy-load the scanner library so it isn't in the main bundle
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return;
      scanner = new Html5Qrcode('camera-scanner');
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (text: string) => { if (!stopped) { stopped = true; scanner.stop().catch(() => {}); onScan(text); } },
        () => {}
      ).catch((e: any) => setError(e?.message || 'Camera unavailable. Check permissions or use a USB scanner.'));
    });
    return () => { stopped = true; scanner?.stop().catch(() => {}); };
  }, []);
  return (
    <Modal open onClose={onClose} title="Scan with camera">
      <div id="camera-scanner" className="rounded-xl overflow-hidden bg-black min-h-[240px]" />
      {error && <p className="text-sm text-rose-500 mt-3">{error}</p>}
      <p className="text-xs text-slate-400 mt-3">Point the camera at a barcode or QR code. Works on phones and tablets.</p>
    </Modal>
  );
}

// ---------- hold / recall ----------
function HoldModal({ open, onClose, onHold, hasCart }: { open: boolean; onClose: () => void; onHold: (label: string) => void; hasCart: boolean }) {
  const cart = useCartStore();
  const [held, setHeld] = useState<any[]>([]);
  const [label, setLabel] = useState('');

  const load = () => api.get('/held-sales').then(({ data }) => setHeld(data.data)).catch(() => {});
  useEffect(() => { if (open) { load(); setLabel(''); } }, [open]);

  const recall = async (h: any) => {
    if (cart.items.length && !window.confirm('Recalling will replace the current cart. Continue?')) return;
    useCartStore.setState({
      items: h.cart, customerId: h.customer_id, customerName: h.customer_name || 'Walk-in Customer', orderDiscount: 0,
    });
    try { await api.delete(`/held-sales/${h.id}`); } catch {}
    toast.success(`Recalled "${h.label}"`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Hold / recall sales">
      {hasCart && (
        <div className="mb-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium mb-2">Park the current sale</p>
          <div className="flex gap-2">
            <Input placeholder='Label, e.g. "Customer in blue shirt"' value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
            <Button onClick={() => { onHold(label || `Hold ${new Date().toLocaleTimeString()}`); onClose(); }}><PauseCircle size={15} /> Hold</Button>
          </div>
        </div>
      )}
      <p className="text-sm font-medium mb-2">Parked sales</p>
      {held.length === 0 ? <p className="text-sm text-slate-400">No parked sales</p> : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {held.map((h) => (
            <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{h.label}</p>
                <p className="text-xs text-slate-400">{h.cart.length} item(s) · {h.customer_name || 'Walk-in'} · {new Date(h.created_at).toLocaleTimeString()}</p>
              </div>
              <Button variant="secondary" onClick={() => recall(h)} className="!px-2.5 !py-1.5 text-xs"><PlayCircle size={13} /> Recall</Button>
              <button onClick={async () => { await api.delete(`/held-sales/${h.id}`); load(); }} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------- line discount ----------
function LineDiscountButton({ item, onSet }: { item: any; onSet: (d: number) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [isPct, setIsPct] = useState(false);
  const max = item.unit_price * item.quantity;
  const compute = () => {
    const n = Number(val) || 0;
    return Math.min(isPct ? (max * n) / 100 : n, max);
  };
  return (
    <>
      <button onClick={() => { setVal(''); setOpen(true); }}
        className={`h-7 px-2 rounded-lg border text-[11px] flex items-center gap-1 ${item.discount > 0 ? 'border-rose-300 text-rose-500' : 'border-slate-200 dark:border-slate-700 text-slate-400'} hover:border-rose-400`}>
        <Percent size={11} />{item.discount > 0 ? money(item.discount) : 'Disc'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Discount — ${item.name}`}>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setIsPct(false)} className={`flex-1 py-1.5 rounded-lg text-sm border ${!isPct ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-slate-200 dark:border-slate-700'}`}>Amount</button>
          <button onClick={() => setIsPct(true)} className={`flex-1 py-1.5 rounded-lg text-sm border ${isPct ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-slate-200 dark:border-slate-700'}`}>Percent %</button>
        </div>
        <Input label={isPct ? 'Discount % (0–100)' : `Discount amount (max ${money(max)})`} type="number" min={0} step="0.01"
          value={val} onChange={(e) => setVal(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { onSet(compute()); setOpen(false); } }} />
        {val && <p className="text-xs text-slate-400 mt-1.5">Discount: {money(compute())}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => { onSet(0); setOpen(false); }}>Remove discount</Button>
          <Button onClick={() => { onSet(compute()); setOpen(false); }}>Apply</Button>
        </div>
      </Modal>
    </>
  );
}

// ---------- customer picker ----------
function CustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCartStore();
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.get('/customers', { params: { search: q || undefined, limit: 8 } })
        .then(({ data }) => setCustomers(data.data)).catch(() => {});
    }, 250);
  }, [q, open]);

  const createCustomer = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await api.post('/customers', { name: newName.trim(), phone: newPhone || undefined });
      cart.setCustomer(data.data.id, data.data.name);
      toast.success('Customer added');
      setCreating(false); setNewName(''); setNewPhone(''); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Select customer">
      {!creating ? (
        <>
          <Input placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            <button onClick={() => { cart.setCustomer(null, 'Walk-in Customer'); onClose(); }}
              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
              <p className="text-sm font-medium">Walk-in Customer</p>
              <p className="text-xs text-slate-400">No account — default</p>
            </button>
            {customers.map((c: any) => (
              <button key={c.id} onClick={() => { cart.setCustomer(c.id, c.name); onClose(); }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{c.name}</p>
                  <div className="flex items-center gap-1.5">
                    {c.price_tier === 'wholesale' && <Badge color="purple">wholesale</Badge>}
                    {Number(c.loyalty_points) > 0 && <span className="text-[11px] text-amber-500 flex items-center gap-0.5"><Star size={11} /> {c.loyalty_points}</span>}
                  </div>
                </div>
                <p className="text-xs text-slate-400">{c.phone || c.code}{Number(c.outstanding_balance) > 0 && <span className="text-rose-400 ml-2">owes {money(c.outstanding_balance)}</span>}</p>
              </button>
            ))}
          </div>
          <Button variant="secondary" className="w-full mt-3" onClick={() => setCreating(true)}><Plus size={15} /> New customer</Button>
        </>
      ) : (
        <div className="space-y-3">
          <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Input label="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Back</Button>
            <Button onClick={createCustomer}>Create & select</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- order discount (amount or %) ----------
function DiscountModal({ open, onClose, subtotal }: { open: boolean; onClose: () => void; subtotal: number }) {
  const cart = useCartStore();
  const [val, setVal] = useState('');
  const [isPct, setIsPct] = useState(false);
  useEffect(() => { if (open) { setVal(''); setIsPct(false); } }, [open]);
  const compute = () => {
    const n = Number(val) || 0;
    return Math.min(isPct ? (subtotal * n) / 100 : n, subtotal);
  };
  const apply = () => { cart.setOrderDiscount(compute()); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title="Order discount">
      <div className="flex gap-2 mb-3">
        <button onClick={() => setIsPct(false)} className={`flex-1 py-1.5 rounded-lg text-sm border ${!isPct ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-slate-200 dark:border-slate-700'}`}>Amount</button>
        <button onClick={() => setIsPct(true)} className={`flex-1 py-1.5 rounded-lg text-sm border ${isPct ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-slate-200 dark:border-slate-700'}`}>Percent %</button>
      </div>
      <Input label={isPct ? 'Discount % on the whole order' : 'Discount amount on the whole order'} type="number" min={0} step="0.01" value={val}
        onChange={(e) => setVal(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && apply()} />
      {val && <p className="text-xs text-slate-400 mt-1.5">Discount: {money(compute())}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={() => { cart.setOrderDiscount(0); onClose(); }}>Remove</Button>
        <Button onClick={apply}>Apply discount</Button>
      </div>
    </Modal>
  );
}

// ---------- split/credit/points payment ----------
interface PayLine { method: string; amount: string }

function PaymentModal({ open, onClose, total, orderType, onComplete }: {
  open: boolean; onClose: () => void; total: number; orderType: string; onComplete: (sale: Sale | null) => void;
}) {
  const cart = useCartStore();
  const online = useConnectionStore((s) => s.online);
  const offlineQueue = useOfflineQueue();
  const [lines, setLines] = useState<PayLine[]>([{ method: 'cash', amount: '' }]);
  const [loading, setLoading] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setLines([{ method: 'cash', amount: String(total) }]);
      if (cart.customerId) {
        api.get('/customers', { params: { search: '', limit: 100 } })
          .then(({ data }) => setCustomerInfo(data.data.find((c: any) => c.id === cart.customerId) || null))
          .catch(() => {});
      } else setCustomerInfo(null);
    }
  }, [open, total]);

  const paid = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const cashPaid = lines.filter((l) => l.method === 'cash').reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const nonCash = paid - cashPaid;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);
  const changeValid = change <= cashPaid + 0.009;

  const setLine = (i: number, patch: Partial<PayLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { method: 'card', amount: String(remaining) }]);

  const complete = async () => {
    if (remaining > 0.009) { toast.error(`Payments are short by ${money(remaining)}. Add a payment line or use credit.`); return; }
    if (!changeValid) { toast.error('Change can only be given from cash payments'); return; }
    const hasCreditOrPoints = lines.some((l) => (l.method === 'credit' || l.method === 'points') && Number(l.amount) > 0);
    if (hasCreditOrPoints && !cart.customerId) { toast.error('Credit and points payments require a registered customer (F4)'); return; }

    const quotationId = sessionStorage.getItem('pos-quotation-id');
    const payload = {
      items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount })),
      customer_id: cart.customerId,
      discount: cart.orderDiscount,
      order_type: orderType,
      quotation_id: quotationId ? Number(quotationId) : undefined,
      payments: lines.filter((l) => Number(l.amount) > 0).map((l) => ({ method: l.method, amount: Number(l.amount) })),
    };

    if (!online) {
      if (hasCreditOrPoints) { toast.error('Credit/points sales are not available offline'); return; }
      offlineQueue.enqueue(payload);
      toast.info('Sale queued offline — it will sync when the connection returns. No receipt number yet.');
      onComplete(null);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/sales', payload);
      sessionStorage.removeItem('pos-quotation-id');
      sounds.saleComplete();
      broadcastDisplay({ items: [], totals: { subtotal: 0, discount: 0, tax: 0, total: 0 }, status: 'paid', invoice: data.data.invoice_number, change: Number(data.data.change_due) });
      setTimeout(() => broadcastDisplay({ items: [], totals: { subtotal: 0, discount: 0, tax: 0, total: 0 }, status: 'idle' }), 12000);
      toast.success(`Sale ${data.data.invoice_number} completed`);
      onComplete(data.data);
    } catch (e: any) {
      if (!e.response) {
        offlineQueue.enqueue(payload);
        toast.info('Connection lost — sale queued locally and will sync automatically.');
        onComplete(null);
      } else toast.error(errMsg(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F9') { e.preventDefault(); complete(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const quickAmounts = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000]
    .filter((v, i, a) => a.indexOf(v) === i);

  const methodsFor = () => {
    const base = [...PAY_METHODS];
    if (customerInfo) {
      base.push({ v: 'credit', l: 'Credit', icon: <Wallet size={18} /> });
      if (Number(customerInfo.loyalty_points) > 0 && useSubscriptionStore.getState().hasFeature('loyalty')) {
        base.push({ v: 'points', l: `Points (${customerInfo.loyalty_points})`, icon: <Star size={18} /> });
      }
    }
    return base;
  };

  return (
    <Modal open={open} onClose={onClose} title="Payment">
      <div className="text-center mb-4">
        <p className="text-sm text-slate-400">Amount due</p>
        <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{money(total)}</p>
        {customerInfo && <p className="text-xs text-slate-400 mt-1">{customerInfo.name}{Number(customerInfo.loyalty_points) > 0 && <span className="text-amber-500"> · ⭐ {customerInfo.loyalty_points} pts</span>}</p>}
      </div>

      <div className="space-y-2 mb-3">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Select value={line.method} onChange={(e) => setLine(i, { method: e.target.value })} className="!w-36">
              {methodsFor().map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </Select>
            <Input type="number" min={0} step="0.01" value={line.amount} placeholder="Amount"
              onChange={(e) => setLine(i, { amount: e.target.value })} className="flex-1"
              autoFocus={i === 0} onKeyDown={(e) => e.key === 'Enter' && complete()} />
            {lines.length > 1 && (
              <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
        <button onClick={addLine} className="text-xs text-indigo-500 hover:underline flex items-center gap-1"><Plus size={12} /> Split payment — add another method</button>
      </div>

      {lines.length === 1 && lines[0].method === 'cash' && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {quickAmounts.map((a) => (
            <button key={a} onClick={() => setLines([{ method: 'cash', amount: String(a) }])}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 font-mono">{money(a)}</button>
          ))}
        </div>
      )}

      <div className="space-y-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Tendered</span><span className="font-semibold">{money(paid)}</span></div>
        {remaining > 0 ? (
          <div className="flex justify-between text-rose-500"><span>Remaining</span><span className="font-semibold">{money(remaining)}</span></div>
        ) : (
          <div className="flex justify-between text-emerald-600"><span>Change due</span><span className="font-bold">{money(change)}</span></div>
        )}
        {!changeValid && <p className="text-xs text-rose-500">Overpayment must be on the cash line to give change.</p>}
      </div>

      <Button variant="success" className="w-full mt-4 !py-3 text-base" onClick={complete} loading={loading}>
        <CheckCircle2 size={18} /> Complete Sale (F9)
      </Button>
    </Modal>
  );
}

// ---------- receipt modal ----------
export function ReceiptModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const printFallback = () => {
    const el = document.getElementById('print-area');
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) { window.print(); return; }
    w.document.write(`<html><head><title>${sale.invoice_number}</title>
      <style>body{font-family:'Courier New',monospace;font-size:12px;margin:0;padding:16px} table{width:100%;border-collapse:collapse} th,td{padding:1px 2px} hr{border:none;border-top:1px dashed #000}</style>
      </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const downloadPdf = async () => {
    try {
      const { api } = await import('../api/client');
      const res = await api.get(`/sales/${sale.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${sale.invoice_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { printFallback(); }
  };

  const sendEmail = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/sales/${sale.id}/email`, { email: email || undefined });
      toast.success(data.data.message);
      setEmailOpen(false);
    } catch (e) { toast.error(errMsg(e)); }
    setSending(false);
  };

  const shareWhatsApp = () => {
    const { settings } = useSettingsStore.getState();
    const sym = settings.currency_symbol || '$';
    const lines = [
      `🧾 *${settings.business_name || 'SmartMart'}*`,
      `Invoice: ${sale.invoice_number}`,
      `${new Date(sale.created_at).toLocaleString('en-GB')}`,
      '——————————',
      ...(sale.items || []).map((it) => `${it.product_name} ×${it.quantity} — ${sym}${Number(it.line_total).toFixed(2)}`),
      '——————————',
      `*Total: ${sym}${Number(sale.total).toFixed(2)}*`,
      Number(sale.change_due) > 0 ? `Change: ${sym}${Number(sale.change_due).toFixed(2)}` : '',
      settings.receipt_footer || 'Thank you for shopping with us!',
    ].filter(Boolean).join('\n');
    const phone = (sale as any).customer_phone ? String((sale as any).customer_phone).replace(/[^\d]/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 no-print" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <h3 className="font-semibold">Sale completed</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4 bg-slate-50 dark:bg-slate-950">
          <div id="print-area" className="bg-white rounded-lg shadow-sm py-2">
            <Receipt sale={sale} />
          </div>
        </div>
        {emailOpen && (
          <div className="px-4 pb-2 no-print flex gap-2">
            <Input placeholder={(sale as any).customer_email || 'customer@email.com'} value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
            <Button onClick={sendEmail} loading={sending}>Send</Button>
          </div>
        )}
        <div className="grid grid-cols-4 gap-2 p-4 border-t border-slate-200 dark:border-slate-700 no-print">
          <Button variant="secondary" onClick={downloadPdf}><Download size={15} /> PDF</Button>
          <Button variant="secondary" onClick={() => setEmailOpen(!emailOpen)}><Mail size={15} /> Email</Button>
          <Button variant="secondary" onClick={shareWhatsApp} className="!text-emerald-600" title="Share receipt on WhatsApp"><MessageCircle size={15} /> WhatsApp</Button>
          <Button onClick={() => window.print()}><Printer size={15} /> Print</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- shortcuts help ----------
function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shortcuts = [
    ['F1', 'Show this help panel'], ['F2', 'Focus product search'], ['F4', 'Select customer'],
    ['F6', 'Order discount'], ['F7', 'Hold / recall sales'], ['F8', 'Open payment'],
    ['F9', 'Complete sale (in payment)'], ['Enter', 'Confirm / scan barcode'], ['Esc', 'Close dialog'],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-2">
        {shortcuts.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{d}</span>
            <kbd className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold">{k}</kbd>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4 flex items-start gap-1.5">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        USB/keyboard barcode scanners work automatically — the barcode field stays focused whenever you're not typing elsewhere. Use the camera button for phone/tablet scanning.
      </p>
    </Modal>
  );
}
