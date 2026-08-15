import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '../types';

interface CartState {
  items: CartItem[];
  customerId: number | null;
  customerName: string;
  orderDiscount: number;
  addProduct: (p: Product) => { ok: boolean; message?: string };
  setQuantity: (productId: number, qty: number) => void;
  setLineDiscount: (productId: number, discount: number) => void;
  remove: (productId: number) => void;
  setCustomer: (id: number | null, name: string) => void;
  setOrderDiscount: (d: number) => void;
  clear: () => void;
}

/** Cart is persisted to localStorage so an active transaction survives page refreshes / network drops. */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerId: null,
      customerName: 'Walk-in Customer',
      orderDiscount: 0,
      addProduct: (p) => {
        const items = [...get().items];
        const idx = items.findIndex((i) => i.product_id === p.id);
        const price = Number(p.discount_price ?? p.selling_price);
        if (idx >= 0) {
          if (items[idx].quantity + 1 > p.stock) {
            return { ok: false, message: `Only ${p.stock} in stock for "${p.name}"` };
          }
          items[idx] = { ...items[idx], quantity: items[idx].quantity + 1, stock: p.stock };
        } else {
          if (p.stock <= 0) return { ok: false, message: `"${p.name}" is out of stock` };
          items.push({
            product_id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
            unit_price: price, tax_rate: Number(p.tax_rate), quantity: 1, discount: 0, stock: p.stock,
          });
        }
        set({ items });
        return { ok: true };
      },
      setQuantity: (productId, qty) => set({
        items: get().items.map((i) => i.product_id === productId ? { ...i, quantity: Math.max(1, Math.min(qty, i.stock)) } : i),
      }),
      setLineDiscount: (productId, discount) => set({
        items: get().items.map((i) => i.product_id === productId ? { ...i, discount: Math.max(0, discount) } : i),
      }),
      remove: (productId) => set({ items: get().items.filter((i) => i.product_id !== productId) }),
      setCustomer: (customerId, customerName) => set({ customerId, customerName }),
      setOrderDiscount: (orderDiscount) => set({ orderDiscount: Math.max(0, orderDiscount) }),
      clear: () => set({ items: [], customerId: null, customerName: 'Walk-in Customer', orderDiscount: 0 }),
    }),
    { name: 'pos-cart' }
  )
);

export function cartTotals(items: CartItem[], orderDiscount: number) {
  let subtotal = 0, tax = 0, lineDiscounts = 0;
  for (const i of items) {
    const gross = i.unit_price * i.quantity;
    const net = Math.max(0, gross - i.discount);
    subtotal += gross;
    lineDiscounts += Math.min(i.discount, gross);
    tax += net * (i.tax_rate / 100);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const discount = r2(lineDiscounts + orderDiscount);
  return {
    subtotal: r2(subtotal), tax: r2(tax), discount,
    total: Math.max(0, r2(subtotal - discount + tax)),
    itemCount: items.reduce((a, i) => a + i.quantity, 0),
  };
}
