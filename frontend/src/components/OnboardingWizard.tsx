import React, { useRef, useState } from 'react';
import { Store, Upload, Coins, PackagePlus, CheckCircle2, ChevronRight, ChevronLeft, PartyPopper } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { useSettingsStore } from '../stores/settings';
import { Button, Input, Select } from './ui';
import { toast } from '../stores/toast';

const STEPS = ['Business', 'Branding', 'Currency & Tax', 'First product', 'Done'];

/** First-run wizard: shown until onboarding_done=true. Pre-filled from existing settings. */
export default function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const { settings, set: setStore } = useSettingsStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, string>>({
    business_name: settings.business_name || '', business_phone: settings.business_phone || '',
    business_address: settings.business_address || '', business_email: settings.business_email || '',
    business_logo: settings.business_logo || '',
    currency: settings.currency || 'USD', currency_symbol: settings.currency_symbol || '$',
    tax_rate: settings.tax_rate || '0', tax_mode: settings.tax_mode || 'exclusive',
    receipt_footer: settings.receipt_footer || 'Thank you for shopping with us!',
  });
  const [product, setProduct] = useState({ name: '', selling_price: '', purchase_price: '', opening_stock: '' });
  const [productAdded, setProductAdded] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      set('business_logo', data.data.url);
      toast.success('Logo uploaded');
    } catch (e) { toast.error(errMsg(e)); }
    setUploading(false);
  };

  const saveSettings = async (patch: Record<string, string>) => {
    const { data } = await api.put('/settings', patch);
    setStore(data.data);
  };

  const next = async () => {
    setSaving(true);
    try {
      if (step === 0) await saveSettings({ business_name: f.business_name, business_phone: f.business_phone, business_address: f.business_address, business_email: f.business_email });
      if (step === 1) await saveSettings({ business_logo: f.business_logo, receipt_footer: f.receipt_footer });
      if (step === 2) await saveSettings({ currency: f.currency, currency_symbol: f.currency_symbol, tax_rate: f.tax_rate, tax_mode: f.tax_mode });
      if (step === 3 && product.name && product.selling_price && !productAdded) {
        await api.post('/products', {
          name: product.name, selling_price: Number(product.selling_price),
          purchase_price: Number(product.purchase_price || 0), opening_stock: Number(product.opening_stock || 0),
        });
        setProductAdded(true);
        toast.success(`"${product.name}" added to your catalog`);
      }
      if (step === STEPS.length - 2) {
        await saveSettings({ onboarding_done: 'true' });
      }
      setStep((s) => s + 1);
    } catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };

  const skip = async () => {
    try { await saveSettings({ onboarding_done: 'true' }); } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* progress */}
        <div className="flex gap-1 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>

        <div className="p-6 sm:p-8 min-h-[380px]">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-500"><Store size={24} /></div>
                <div>
                  <h2 className="text-lg font-bold">Welcome! Let's set up your business</h2>
                  <p className="text-sm text-slate-400">Takes about a minute — you can change everything later in Settings.</p>
                </div>
              </div>
              <Input label="Business name *" value={f.business_name} onChange={(e) => set('business_name', e.target.value)} autoFocus placeholder="e.g. SmartMart Superstore" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" value={f.business_phone} onChange={(e) => set('business_phone', e.target.value)} />
                <Input label="Email" value={f.business_email} onChange={(e) => set('business_email', e.target.value)} />
              </div>
              <Input label="Address (printed on receipts)" value={f.business_address} onChange={(e) => set('business_address', e.target.value)} />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-violet-50 dark:bg-violet-950 text-violet-500"><Upload size={24} /></div>
                <div>
                  <h2 className="text-lg font-bold">Your branding</h2>
                  <p className="text-sm text-slate-400">Your logo appears on the sidebar, receipts and invoices.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-800">
                  {f.business_logo ? <img src={f.business_logo} alt="logo" className="w-full h-full object-contain" /> : <Store size={26} className="text-slate-300" />}
                </div>
                <div>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                  <Button variant="secondary" loading={uploading} onClick={() => logoRef.current?.click()}><Upload size={15} /> Upload logo</Button>
                  <p className="text-xs text-slate-400 mt-1.5">PNG or JPG, up to 3 MB. Optional.</p>
                </div>
              </div>
              <Input label="Receipt footer message" value={f.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-500"><Coins size={24} /></div>
                <div>
                  <h2 className="text-lg font-bold">Currency & tax</h2>
                  <p className="text-sm text-slate-400">How prices and taxes work in your store.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Currency code" value={f.currency} onChange={(e) => set('currency', e.target.value)} placeholder="USD" />
                <Input label="Currency symbol" value={f.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)} placeholder="$" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Default tax rate %" type="number" min={0} max={100} value={f.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} />
                <Select label="Tax mode" value={f.tax_mode} onChange={(e) => set('tax_mode', e.target.value)}>
                  <option value="exclusive">Exclusive — tax added on top</option>
                  <option value="inclusive">Inclusive — tax inside prices</option>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-500"><PackagePlus size={24} /></div>
                <div>
                  <h2 className="text-lg font-bold">Add your first product</h2>
                  <p className="text-sm text-slate-400">Or skip this — you can bulk-import from Excel later.</p>
                </div>
              </div>
              {productAdded ? (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 text-sm">
                  <CheckCircle2 size={17} /> "{product.name}" is in your catalog!
                </div>
              ) : (
                <>
                  <Input label="Product name" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="e.g. Coca Cola 500ml" />
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="Selling price" type="number" min={0} value={product.selling_price} onChange={(e) => setProduct({ ...product, selling_price: e.target.value })} />
                    <Input label="Cost price" type="number" min={0} value={product.purchase_price} onChange={(e) => setProduct({ ...product, purchase_price: e.target.value })} />
                    <Input label="Stock" type="number" min={0} value={product.opening_stock} onChange={(e) => setProduct({ ...product, opening_stock: e.target.value })} />
                  </div>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center py-8">
              <div className="p-4 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white mb-4 animate-bounce"><PartyPopper size={32} /></div>
              <h2 className="text-xl font-bold">You're all set! 🎉</h2>
              <p className="text-sm text-slate-400 mt-2 max-w-sm">
                {f.business_name || 'Your store'} is ready to sell. Open the POS terminal to make your first sale, or explore the dashboard.
              </p>
              <div className="flex gap-2 mt-6">
                <Button variant="secondary" onClick={onClose}>Explore dashboard</Button>
                <Button onClick={() => { onClose(); window.location.href = '/pos'; }}>Open POS terminal</Button>
              </div>
            </div>
          )}
        </div>

        {step < 4 && (
          <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-t border-slate-100 dark:border-slate-800">
            <button onClick={skip} className="text-sm text-slate-400 hover:text-slate-600">Skip setup</button>
            <div className="flex gap-2">
              {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}><ChevronLeft size={15} /> Back</Button>}
              <Button onClick={next} loading={saving} disabled={step === 0 && !f.business_name.trim()}>
                {step === 3 && !product.name ? 'Skip & finish' : step === 3 ? (productAdded ? 'Finish' : 'Add & finish') : 'Continue'} <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
