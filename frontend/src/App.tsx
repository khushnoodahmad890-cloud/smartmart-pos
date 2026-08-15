import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import { useSubscriptionStore } from './stores/subscription';
import { ToastContainer, Spinner } from './components/ui';
import UpgradeGate from './components/UpgradeGate';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import POS from './pages/POS'; // POS is loaded eagerly — cashiers need it instantly

// Route-level code splitting keeps the initial bundle small
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SalesHistory = lazy(() => import('./pages/SalesHistory'));
const Returns = lazy(() => import('./pages/Returns'));
const Products = lazy(() => import('./pages/Products'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Barcodes = lazy(() => import('./pages/Barcodes'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Customers = lazy(() => import('./pages/Customers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Reports = lazy(() => import('./pages/Reports'));
const UsersPage = lazy(() => import('./pages/Users'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Quotations = lazy(() => import('./pages/Quotations'));
const Kitchen = lazy(() => import('./pages/Kitchen'));
const Billing = lazy(() => import('./pages/Billing'));
const Insights = lazy(() => import('./pages/Insights'));
const Promotions = lazy(() => import('./pages/Promotions'));
const CustomerDisplay = lazy(() => import('./pages/CustomerDisplay'));

function Protected({ children, perms }: { children: React.ReactNode; perms?: string[] }) {
  const { token, can } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (perms && !can(...perms)) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Access denied</p>
        <p className="text-sm text-slate-400 mt-1">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadSubscription = useSubscriptionStore((s) => s.load);

  useEffect(() => { if (token) { loadSettings(); loadSubscription(); } }, [token]);

  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/customer-display" element={<CustomerDisplay />} />
          <Route element={<Protected><AppLayout /></Protected>}>
            <Route path="/" element={<Protected perms={['view_dashboard']}><Dashboard /></Protected>} />
            <Route path="/pos" element={<Protected perms={['create_sale']}><POS /></Protected>} />
            <Route path="/shifts" element={<Protected perms={['manage_shifts', 'create_sale']}><UpgradeGate feature="shifts"><Shifts /></UpgradeGate></Protected>} />
            <Route path="/sales" element={<Protected perms={['create_sale', 'view_reports']}><SalesHistory /></Protected>} />
            <Route path="/quotations" element={<Protected perms={['manage_quotations', 'create_sale']}><UpgradeGate feature="quotations"><Quotations /></UpgradeGate></Protected>} />
            <Route path="/returns" element={<Protected perms={['process_refund']}><Returns /></Protected>} />
            <Route path="/kitchen" element={<Protected perms={['view_kitchen', 'create_sale']}><UpgradeGate feature="kitchen"><Kitchen /></UpgradeGate></Protected>} />
            <Route path="/products" element={<Protected perms={['view_products']}><Products /></Protected>} />
            <Route path="/categories" element={<Protected perms={['manage_catalog']}><Catalog /></Protected>} />
            <Route path="/barcodes" element={<Protected perms={['view_products']}><Barcodes /></Protected>} />
            <Route path="/inventory" element={<Protected perms={['view_inventory']}><Inventory /></Protected>} />
            <Route path="/customers" element={<Protected perms={['manage_customers']}><Customers /></Protected>} />
            <Route path="/suppliers" element={<Protected perms={['manage_suppliers']}><UpgradeGate feature="suppliers"><Suppliers /></UpgradeGate></Protected>} />
            <Route path="/purchases" element={<Protected perms={['manage_purchases']}><UpgradeGate feature="purchases"><Purchases /></UpgradeGate></Protected>} />
            <Route path="/expenses" element={<Protected perms={['manage_expenses']}><UpgradeGate feature="expenses"><Expenses /></UpgradeGate></Protected>} />
            <Route path="/reports" element={<Protected perms={['view_reports']}><UpgradeGate feature="reports"><Reports /></UpgradeGate></Protected>} />
            <Route path="/insights" element={<Protected perms={['view_reports']}><UpgradeGate feature="reports"><Insights /></UpgradeGate></Protected>} />
            <Route path="/promotions" element={<Protected perms={['manage_catalog', 'manage_settings']}><Promotions /></Protected>} />
            <Route path="/users" element={<Protected perms={['manage_users']}><UsersPage /></Protected>} />
            <Route path="/audit-logs" element={<Protected perms={['view_audit_logs']}><UpgradeGate feature="audit_logs"><AuditLogs /></UpgradeGate></Protected>} />
            <Route path="/settings" element={<Protected perms={['manage_settings']}><SettingsPage /></Protected>} />
            <Route path="/billing" element={<Protected perms={['manage_billing', 'manage_settings']}><Billing /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  );
}
