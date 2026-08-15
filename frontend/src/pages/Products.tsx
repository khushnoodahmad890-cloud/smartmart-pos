import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Package, Download, Upload, Wand2, Power } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { Card, Button, Input, Select, Textarea, Badge, Spinner, EmptyState, Pagination, Modal, ConfirmDialog, SearchInput } from '../components/ui';
import { money, downloadCSV } from '../utils/format';
import { toast } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import type { Product, Meta } from '../types';

export default function Products() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') || '');
  const [categoryId, setCategoryId] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [editing, setEditing] = useState<Product | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const can = useAuthStore((s) => s.can);

  const load = () => {
    setLoading(true);
    api.get('/products', { params: { search: search || undefined, category_id: categoryId || undefined, stock: stockFilter || undefined, status: statusFilter || undefined, sort, dir, page, limit: 20 } })
      .then(({ data }) => { setRows(data.data); setMeta(data.meta); })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, categoryId, stockFilter, statusFilter, sort, dir, page]);
  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data.data)).catch(() => {});
    api.get('/brands').then(({ data }) => setBrands(data.data)).catch(() => {});
    api.get('/units').then(({ data }) => setUnits(data.data)).catch(() => {});
    if (can('manage_suppliers')) api.get('/suppliers', { params: { limit: 100 } }).then(({ data }) => setSuppliers(data.data)).catch(() => {});
  }, []);

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/products/${deleting.id}`);
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null); load();
    } catch (e) { toast.error(errMsg(e)); }
    setDeleteLoading(false);
  };

  const toggleActive = async (p: Product) => {
    try {
      await api.put(`/products/${p.id}`, { is_active: !p.is_active });
      toast.success(`"${p.name}" ${p.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const exportAll = async () => {
    try {
      const { data } = await api.get('/products/export');
      downloadCSV('products.csv',
        ['Name', 'SKU', 'Barcode', 'Category', 'Brand', 'Purchase Price', 'Selling Price', 'Tax %', 'Stock', 'Min Stock', 'Status'],
        data.data.map((p: any) => [p.name, p.sku, p.barcode || '', p.category_name || '', p.brand_name || '', p.purchase_price, p.selling_price, p.tax_rate, p.stock, p.min_stock, p.is_active ? 'active' : 'inactive']));
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="text-sm text-slate-400">{meta.total.toLocaleString()} products in catalog</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={exportAll}><Download size={15} /> Export</Button>
          {can('create_product') && <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</Button>}
          {can('create_product') && <Button onClick={() => setEditing('new')}><Plus size={15} /> Add product</Button>}
        </div>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
          <SearchInput placeholder="Name, SKU or barcode…" onSearch={(v) => { setSearch(v); setPage(1); }} />
          <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={stockFilter} onChange={(e) => { setStockFilter(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All stock levels</option><option value="low">Low stock</option><option value="out">Out of stock</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="!w-auto">
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </Select>
          <Select value={`${sort}:${dir}`} onChange={(e) => { const [s, d] = e.target.value.split(':'); setSort(s); setDir(d as any); }} className="!w-auto">
            <option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option>
            <option value="price:asc">Price low–high</option><option value="price:desc">Price high–low</option>
            <option value="stock:asc">Stock low–high</option><option value="created:desc">Newest first</option>
          </Select>
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="No products found" icon={<Package size={40} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Product</th><th className="px-4 py-3 hidden md:table-cell">Barcode</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Category</th>
                  <th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-center">Stock</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                {rows.map((p) => {
                  const out = p.stock <= 0, low = !out && p.stock <= p.min_stock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-slate-500">{p.barcode || '—'}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{p.category_name || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{money(p.purchase_price)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{money(p.selling_price)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold">{p.stock}</span>
                        {out && <Badge color="red">out</Badge>}{low && <Badge color="amber">low</Badge>}
                      </td>
                      <td className="px-4 py-3"><Badge color={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'active' : 'inactive'}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {can('edit_product') && <>
                            <button onClick={() => toggleActive(p)} title={p.is_active ? 'Deactivate' : 'Activate'} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><Power size={15} /></button>
                            <button onClick={() => setEditing(p)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil size={15} /></button>
                          </>}
                          {can('delete_product') && <button onClick={() => setDeleting(p)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-400"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
      </Card>

      {editing && (
        <ProductForm product={editing === 'new' ? null : editing}
          categories={categories} brands={brands} units={units} suppliers={suppliers}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={deleteLoading}
        danger title="Delete product?" confirmLabel="Delete"
        message={`"${deleting?.name}" will be removed from the catalog (soft-deleted — sales history is preserved).`} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />
    </div>
  );
}

function ProductForm({ product, categories, brands, units, suppliers, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({
    name: product?.name || '', sku: product?.sku || '', barcode: product?.barcode || '',
    category_id: product?.category_id || '', brand_id: product?.brand_id || '', unit_id: product?.unit_id || '',
    supplier_id: product?.supplier_id || '', description: product?.description || '', image_url: product?.image_url || '',
    purchase_price: product?.purchase_price || '', selling_price: product?.selling_price || '',
    discount_price: product?.discount_price || '', wholesale_price: (product as any)?.wholesale_price || '',
    tax_rate: product?.tax_rate || '0',
    min_stock: product?.min_stock ?? 5, max_stock: product?.max_stock ?? 1000, opening_stock: '',
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const uploadImg = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      set('image_url', data.data.url);
      toast.success('Image uploaded');
    } catch (e) { toast.error(errMsg(e)); }
    setUploading(false);
  };

  const genBarcode = async () => {
    try { const { data } = await api.post('/products/generate-barcode'); set('barcode', data.data.barcode); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      ...f,
      category_id: f.category_id || null, brand_id: f.brand_id || null,
      unit_id: f.unit_id || null, supplier_id: f.supplier_id || null,
      purchase_price: Number(f.purchase_price || 0), selling_price: Number(f.selling_price),
      discount_price: f.discount_price ? Number(f.discount_price) : null,
      wholesale_price: f.wholesale_price ? Number(f.wholesale_price) : null,
      tax_rate: Number(f.tax_rate || 0), min_stock: Number(f.min_stock), max_stock: Number(f.max_stock),
      opening_stock: f.opening_stock ? Number(f.opening_stock) : 0,
    };
    try {
      if (product) await api.put(`/products/${product.id}`, payload);
      else await api.post('/products', payload);
      toast.success(product ? 'Product updated' : 'Product created');
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={product ? `Edit — ${product.name}` : 'Add product'} wide>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <Input label="Product name *" value={f.name} onChange={(e) => set('name', e.target.value)} required className="sm:col-span-2" />
        <Input label="SKU (auto-generated if empty)" value={f.sku} onChange={(e) => set('sku', e.target.value)} />
        <div className="flex gap-2 items-end">
          <div className="flex-1"><Input label="Barcode" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} /></div>
          <Button type="button" variant="secondary" onClick={genBarcode} title="Generate EAN-13 barcode"><Wand2 size={15} /></Button>
        </div>
        <Select label="Category" value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>
          <option value="">— none —</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Brand" value={f.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
          <option value="">— none —</option>{brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select label="Unit" value={f.unit_id} onChange={(e) => set('unit_id', e.target.value)}>
          <option value="">— none —</option>{units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.short_name})</option>)}
        </Select>
        <Select label="Supplier" value={f.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
          <option value="">— none —</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
        </Select>
        <Input label="Purchase price (cost) *" type="number" min={0} step="0.01" value={f.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} required />
        <Input label="Selling price *" type="number" min={0} step="0.01" value={f.selling_price} onChange={(e) => set('selling_price', e.target.value)} required />
        <Input label="Discount price (optional)" type="number" min={0} step="0.01" value={f.discount_price} onChange={(e) => set('discount_price', e.target.value)} />
        <Input label="Wholesale price (for wholesale-tier customers)" type="number" min={0} step="0.01" value={f.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} />
        <Input label="Tax rate %" type="number" min={0} max={100} step="0.01" value={f.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} />
        <Input label="Minimum stock (reorder level)" type="number" min={0} value={f.min_stock} onChange={(e) => set('min_stock', e.target.value)} />
        <Input label="Maximum stock" type="number" min={0} value={f.max_stock} onChange={(e) => set('max_stock', e.target.value)} />
        {!product && <Input label="Opening stock" type="number" min={0} value={f.opening_stock} onChange={(e) => set('opening_stock', e.target.value)} />}
        <div className="flex gap-2 items-end">
          <div className="flex-1"><Input label="Product image" value={f.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="URL or upload →" /></div>
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImg(e.target.files[0])} />
          <Button type="button" variant="secondary" loading={uploading} onClick={() => imgRef.current?.click()}><Upload size={15} /></Button>
          {f.image_url && <img src={f.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />}
        </div>
        <Textarea label="Description" value={f.description} onChange={(e) => set('description', e.target.value)} className="sm:col-span-2" />
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{product ? 'Save changes' : 'Create product'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      let text: string;
      if (/\.xlsx?$/i.test(file.name)) {
        // Parse Excel via SheetJS, convert to CSV, then reuse the CSV path
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer());
        text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      } else {
        text = await file.text();
      }
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const idx = (n: string) => header.indexOf(n);
      const parse = (line: string) => {
        // simple CSV parser with quote support
        const out: string[] = []; let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"') inQ = !inQ;
          else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
          else cur += ch;
        }
        out.push(cur);
        return out;
      };
      const products = lines.slice(1).map((l) => {
        const c = parse(l);
        return {
          name: c[idx('name')], sku: idx('sku') >= 0 ? c[idx('sku')] : '',
          barcode: idx('barcode') >= 0 ? c[idx('barcode')] : '',
          purchase_price: idx('purchase_price') >= 0 ? c[idx('purchase_price')] : 0,
          selling_price: c[idx('selling_price')],
          tax_rate: idx('tax_rate') >= 0 ? c[idx('tax_rate')] : 0,
          min_stock: idx('min_stock') >= 0 ? c[idx('min_stock')] : 5,
          opening_stock: idx('opening_stock') >= 0 ? c[idx('opening_stock')] : 0,
        };
      }).filter((p) => p.name && p.selling_price !== undefined);
      const { data } = await api.post('/products/import', { products });
      toast.success(`Imported ${data.data.imported} products${data.data.errors.length ? ` (${data.data.errors.length} rows skipped)` : ''}`);
      if (data.data.errors.length) console.warn('Import errors:', data.data.errors);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Bulk import products (CSV / Excel)">
      <p className="text-sm text-slate-500 mb-3">
        Upload a CSV file with a header row. Required columns: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">name</code>, <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">selling_price</code>.
        Optional: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">sku, barcode, purchase_price, tax_rate, min_stock, opening_stock</code>.
      </p>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <Button className="w-full" loading={loading} onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose CSV or Excel file</Button>
    </Modal>
  );
}
