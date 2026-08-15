import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, Barcode as BarcodeIcon, Minus, Plus } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Spinner, EmptyState, SearchInput } from '../components/ui';
import { money } from '../utils/format';
import { toast } from '../stores/toast';
import { useSettingsStore } from '../stores/settings';
import type { Product } from '../types';

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: value.length === 13 ? 'EAN13' : 'CODE128', height: 38, width: 1.4, fontSize: 11, margin: 4 });
    } catch {
      try { JsBarcode(ref.current, value, { format: 'CODE128', height: 38, width: 1.4, fontSize: 11, margin: 4 }); } catch {}
    }
  }, [value]);
  return <svg ref={ref} />;
}

export default function Barcodes() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<number, { p: Product; copies: number }>>(new Map());
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    setLoading(true);
    api.get('/products', { params: { search: search || undefined, limit: 30 } })
      .then(({ data }) => setProducts(data.data.filter((p: Product) => p.barcode)))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  }, [search]);

  const toggle = (p: Product) => {
    const next = new Map(selected);
    if (next.has(p.id)) next.delete(p.id);
    else next.set(p.id, { p, copies: 1 });
    setSelected(next);
  };
  const setCopies = (id: number, copies: number) => {
    const next = new Map(selected);
    const e = next.get(id);
    if (e) { e.copies = Math.max(1, Math.min(50, copies)); setSelected(next); }
  };

  const labels = Array.from(selected.values()).flatMap(({ p, copies }) => Array.from({ length: copies }, () => p));

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold">Barcode Labels</h1>
          <p className="text-sm text-slate-400">Select products and print price labels with barcodes</p>
        </div>
        <Button className="ml-auto" disabled={!labels.length} onClick={() => window.print()}>
          <Printer size={15} /> Print {labels.length ? `${labels.length} label(s)` : 'labels'}
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="no-print">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <SearchInput placeholder="Search products…" onSearch={setSearch} />
          </div>
          {loading ? <Spinner /> : products.length === 0 ? <EmptyState title="No products with barcodes" icon={<BarcodeIcon size={36} />} /> : (
            <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/70">
              {products.map((p) => {
                const sel = selected.get(p.id);
                return (
                  <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${sel ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                    onClick={() => toggle(p)}>
                    <input type="checkbox" checked={!!sel} readOnly className="accent-indigo-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.barcode}</p>
                    </div>
                    {sel && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setCopies(p.id, sel.copies - 1)} className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Minus size={11} /></button>
                        <span className="text-xs w-8 text-center font-semibold">{sel.copies}×</span>
                        <button onClick={() => setCopies(p.id, sel.copies + 1)} className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Plus size={11} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div>
          <p className="text-sm font-medium text-slate-500 mb-2 no-print">Label preview</p>
          <div id="print-area" className="bg-white rounded-xl border border-slate-200 dark:border-slate-700 p-4 min-h-[200px]">
            {labels.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-16 no-print">Select products on the left to preview labels</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {labels.map((p, i) => (
                  <div key={i} className="border border-dashed border-slate-300 rounded-lg p-2 text-center" style={{ width: 180 }}>
                    <p className="text-[11px] font-semibold text-black leading-tight truncate">{settings.business_name || 'SmartMart'}</p>
                    <p className="text-[10px] text-black truncate">{p.name}</p>
                    <BarcodeSvg value={p.barcode!} />
                    <p className="text-xs font-bold text-black">{money(p.discount_price ?? p.selling_price)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
