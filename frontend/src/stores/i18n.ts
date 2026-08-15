import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'en' | 'ur' | 'ar' | 'es';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'اردو' },
  { code: 'ar', label: 'العربية' },
  { code: 'es', label: 'Español' },
];

const DICT: Record<string, Record<Lang, string>> = {
  dashboard: { en: 'Dashboard', ur: 'ڈیش بورڈ', ar: 'لوحة التحكم', es: 'Panel' },
  pos: { en: 'POS Terminal', ur: 'پی او ایس ٹرمینل', ar: 'نقطة البيع', es: 'Terminal POS' },
  sales: { en: 'Sales History', ur: 'فروخت کی تاریخ', ar: 'سجل المبيعات', es: 'Historial de ventas' },
  returns: { en: 'Returns & Refunds', ur: 'واپسی اور ریفنڈ', ar: 'المرتجعات', es: 'Devoluciones' },
  quotations: { en: 'Quotations', ur: 'کوٹیشنز', ar: 'عروض الأسعار', es: 'Cotizaciones' },
  shifts: { en: 'Shifts & Cash', ur: 'شفٹ اور کیش', ar: 'الورديات والنقدية', es: 'Turnos y caja' },
  kitchen: { en: 'Kitchen Display', ur: 'کچن ڈسپلے', ar: 'شاشة المطبخ', es: 'Pantalla cocina' },
  products: { en: 'Products', ur: 'مصنوعات', ar: 'المنتجات', es: 'Productos' },
  promotions: { en: 'Promotions', ur: 'پروموشنز', ar: 'العروض', es: 'Promociones' },
  categories: { en: 'Categories & Brands', ur: 'زمرے اور برانڈز', ar: 'الفئات والعلامات', es: 'Categorías y marcas' },
  barcodes: { en: 'Barcode Labels', ur: 'بارکوڈ لیبل', ar: 'ملصقات الباركود', es: 'Etiquetas' },
  inventory: { en: 'Inventory', ur: 'انوینٹری', ar: 'المخزون', es: 'Inventario' },
  customers: { en: 'Customers', ur: 'گاہک', ar: 'العملاء', es: 'Clientes' },
  suppliers: { en: 'Suppliers', ur: 'سپلائرز', ar: 'الموردون', es: 'Proveedores' },
  purchases: { en: 'Purchases', ur: 'خریداری', ar: 'المشتريات', es: 'Compras' },
  expenses: { en: 'Expenses', ur: 'اخراجات', ar: 'المصروفات', es: 'Gastos' },
  reports: { en: 'Reports', ur: 'رپورٹس', ar: 'التقارير', es: 'Reportes' },
  insights: { en: 'Insights', ur: 'انسائٹس', ar: 'التحليلات', es: 'Análisis' },
  users: { en: 'Users & Roles', ur: 'صارفین اور کردار', ar: 'المستخدمون والأدوار', es: 'Usuarios y roles' },
  audit: { en: 'Audit Logs', ur: 'آڈٹ لاگز', ar: 'سجلات التدقيق', es: 'Auditoría' },
  billing: { en: 'Billing & Plans', ur: 'بلنگ اور پلانز', ar: 'الفوترة والخطط', es: 'Facturación' },
  settings: { en: 'Settings', ur: 'ترتیبات', ar: 'الإعدادات', es: 'Ajustes' },
  main: { en: 'Main', ur: 'مرکزی', ar: 'الرئيسية', es: 'Principal' },
  catalog: { en: 'Catalog', ur: 'کیٹلاگ', ar: 'الكتالوج', es: 'Catálogo' },
  partners: { en: 'Partners', ur: 'شراکت دار', ar: 'الشركاء', es: 'Socios' },
  finance: { en: 'Finance', ur: 'مالیات', ar: 'المالية', es: 'Finanzas' },
  administration: { en: 'Administration', ur: 'انتظامیہ', ar: 'الإدارة', es: 'Administración' },
  total: { en: 'Total', ur: 'کل', ar: 'الإجمالي', es: 'Total' },
  pay: { en: 'Pay', ur: 'ادائیگی', ar: 'ادفع', es: 'Pagar' },
  cash: { en: 'Cash', ur: 'نقد', ar: 'نقدي', es: 'Efectivo' },
  card: { en: 'Card', ur: 'کارڈ', ar: 'بطاقة', es: 'Tarjeta' },
  search: { en: 'Search', ur: 'تلاش', ar: 'بحث', es: 'Buscar' },
  connected: { en: 'Connected', ur: 'منسلک', ar: 'متصل', es: 'Conectado' },
  offline: { en: 'Offline — cart is saved locally', ur: 'آف لائن — کارٹ محفوظ ہے', ar: 'غير متصل — السلة محفوظة محلياً', es: 'Sin conexión — carrito guardado' },
};

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      lang: 'en',
      setLang: (lang) => set({ lang }),
      t: (key) => DICT[key]?.[get().lang] || DICT[key]?.en || key,
    }),
    { name: 'pos-lang' }
  )
);
