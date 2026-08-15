export interface User {
  id: number; name: string; username: string; email: string; phone?: string;
  role_id: number; role_name: string; branch_id: number | null;
  permissions: string[]; is_active: boolean; last_login?: string; created_at?: string;
  branch_name?: string;
}

export interface Product {
  id: number; name: string; sku: string; barcode: string | null;
  category_id: number | null; brand_id: number | null; unit_id: number | null; supplier_id: number | null;
  category_name?: string; brand_name?: string; unit_name?: string; supplier_name?: string;
  description?: string; image_url?: string;
  purchase_price: string; selling_price: string; discount_price: string | null; tax_rate: string;
  min_stock: number; max_stock: number; stock: number;
  is_active: boolean; created_at: string; updated_at: string;
}

export interface CartItem {
  product_id: number; name: string; sku: string; barcode: string | null;
  unit_price: number; tax_rate: number; quantity: number; discount: number;
  stock: number;
}

export interface Customer {
  id: number; code: string; name: string; phone?: string; email?: string; address?: string;
  notes?: string; outstanding_balance: string; is_active: boolean; created_at: string;
  total_purchases?: string; purchase_count?: number; last_purchase?: string;
}

export interface Supplier {
  id: number; company_name: string; contact_person?: string; phone?: string; email?: string;
  address?: string; tax_number?: string; payment_terms?: string; balance: string; notes?: string;
  is_active: boolean; purchase_count?: number; total_purchased?: string;
}

export interface SaleItem {
  id: number; product_id: number; product_name: string; sku: string; quantity: number;
  unit_price: string; unit_cost: string; discount: string; tax: string; line_total: string;
  returned_quantity: number;
}

export interface Sale {
  id: number; invoice_number: string; branch_id: number; customer_id: number | null;
  customer_name?: string; customer_phone?: string; cashier_name?: string; branch_name?: string;
  user_id: number; subtotal: string; discount: string; tax: string; total: string;
  payment_method: string; amount_paid: string; change_due: string; status: string;
  created_at: string; items?: SaleItem[];
}

export interface Meta { page: number; limit: number; total: number; total_amount?: number; unread?: number }

export interface Settings { [key: string]: string }
