import { describe, it, expect } from 'vitest';
import { cartTotals } from './cart';
import type { CartItem } from '../types';

const item = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 1, name: 'Test', sku: 'SKU-1', barcode: null,
  unit_price: 100, tax_rate: 0, quantity: 1, discount: 0, stock: 10, ...over,
});

describe('cartTotals — billing math', () => {
  it('computes a simple subtotal', () => {
    const t = cartTotals([item({ quantity: 3 })], 0);
    expect(t.subtotal).toBe(300);
    expect(t.total).toBe(300);
    expect(t.itemCount).toBe(3);
  });

  it('applies line discounts before tax', () => {
    const t = cartTotals([item({ quantity: 2, discount: 50, tax_rate: 10 })], 0);
    // gross 200, net 150, tax 15
    expect(t.discount).toBe(50);
    expect(t.tax).toBe(15);
    expect(t.total).toBe(165);
  });

  it('adds order-level discount on top of line discounts', () => {
    const t = cartTotals([item({ quantity: 2, discount: 20 })], 30);
    expect(t.discount).toBe(50);
    expect(t.total).toBe(150);
  });

  it('caps line discount at the line amount', () => {
    const t = cartTotals([item({ quantity: 1, discount: 500 })], 0);
    expect(t.discount).toBe(100); // capped at gross
    expect(t.total).toBe(0);
  });

  it('never returns a negative total', () => {
    const t = cartTotals([item()], 10000);
    expect(t.total).toBe(0);
  });

  it('handles fractional prices without floating point drift', () => {
    const t = cartTotals([item({ unit_price: 0.1, quantity: 3 })], 0);
    expect(t.subtotal).toBe(0.3);
  });

  it('sums mixed tax rates per line', () => {
    const t = cartTotals([
      item({ unit_price: 100, tax_rate: 5 }),
      item({ product_id: 2, unit_price: 200, tax_rate: 0 }),
    ], 0);
    expect(t.tax).toBe(5);
    expect(t.total).toBe(305);
  });
});
