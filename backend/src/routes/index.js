import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requirePermission as perm } from '../middleware/auth.js';

import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as products from '../controllers/productController.js';
import { categories, brands, units } from '../controllers/catalogController.js';
import * as inventory from '../controllers/inventoryController.js';
import * as sales from '../controllers/saleController.js';
import * as returns from '../controllers/returnController.js';
import * as customers from '../controllers/customerController.js';
import * as suppliers from '../controllers/supplierController.js';
import * as purchases from '../controllers/purchaseController.js';
import * as expenses from '../controllers/expenseController.js';
import * as reports from '../controllers/reportController.js';
import * as admin from '../controllers/adminController.js';
import * as shifts from '../controllers/shiftController.js';
import * as quotes from '../controllers/quotationController.js';
import * as misc from '../controllers/miscController.js';
import * as billing from '../controllers/billingController.js';
import * as promos from '../controllers/promotionController.js';
import * as insights from '../controllers/insightController.js';
import * as platform from '../controllers/platformController.js';
import * as tenants from '../controllers/tenantController.js';
import { upload, uploadImage } from '../controllers/uploadController.js';
import { sseHandler } from '../services/eventService.js';
import { requireFeature as feat } from '../services/subscriptionService.js';
import { env } from '../config/env.js';

const router = Router();

// ---- Machine API (X-API-Key auth, read-only) ----
const machineUser = (req, _res, next) => {
  // machine clients act as a privileged read-only principal
  req.user = { id: 0, role_name: 'super_admin', permissions: [], branch_id: 1 };
  next();
};
router.get('/v1/products', platform.apiKeyAuth, machineUser, products.bulkExport);
router.get('/v1/sales', platform.apiKeyAuth, machineUser, sales.listSales);

// ---- Auth (rate-limited) ----
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' } });

// ---- Multi-tenant store signup (public, only in SaaS mode) ----
if (env.multiTenant) {
  const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many signups from this address. Try again later.' } });
  router.post('/tenants/signup', signupLimiter, tenants.signup);
  router.get('/tenants/:code', tenants.lookup);
}

router.post('/auth/login', loginLimiter, auth.login);
router.post('/auth/pin-login', loginLimiter, platform.pinLogin);
router.get('/auth/pin-users', platform.pinUsers); // names only; used on the lock screen
router.post('/auth/refresh', auth.refresh);
router.post('/auth/forgot-password', loginLimiter, auth.forgotPassword);
router.post('/auth/reset-password', loginLimiter, auth.resetPassword);
router.get('/auth/me', authenticate, auth.me);
router.post('/auth/logout', authenticate, auth.logout);
router.post('/auth/change-password', authenticate, auth.changePassword);
router.put('/auth/profile', authenticate, auth.updateProfile);

// Everything below requires authentication
router.use(authenticate);

// ---- Billing & subscription ----
router.get('/billing', billing.getBilling); // all users need it to render the UI feature gate
router.post('/billing/subscribe', perm('manage_billing', 'manage_settings'), billing.subscribe);
router.post('/billing/cancel', perm('manage_billing', 'manage_settings'), billing.cancelSubscription);
router.post('/billing/activate-license', perm('manage_billing', 'manage_settings'), billing.activateLicense);
router.get('/billing/invoices', perm('manage_billing', 'manage_settings'), billing.listBillingInvoices);

// ---- Users / roles / permissions ----
router.get('/users', perm('manage_users'), users.listUsers);
router.post('/users', perm('manage_users'), users.createUser);
router.put('/users/:id', perm('manage_users'), users.updateUser);
router.post('/users/:id/reset-password', perm('manage_users'), users.resetPassword);
router.get('/roles', perm('manage_users', 'manage_settings'), users.listRoles);
router.post('/roles', perm('manage_settings'), users.createRole);
router.put('/roles/:id/permissions', perm('manage_settings'), users.updateRolePermissions);
router.get('/permissions', perm('manage_users', 'manage_settings'), users.listPermissions);

// ---- Products ----
router.get('/products', perm('view_products', 'create_sale'), products.listProducts);
router.get('/products/lookup', perm('create_sale', 'view_products'), products.lookupBarcode);
router.get('/products/export', perm('view_products'), products.bulkExport);
router.post('/products/import', perm('create_product'), products.bulkImport);
router.post('/products/generate-barcode', perm('create_product', 'edit_product'), products.generateBarcode);
router.get('/products/:id', perm('view_products', 'create_sale'), products.getProduct);
router.post('/products', perm('create_product'), products.createProduct);
router.put('/products/:id', perm('edit_product'), products.updateProduct);
router.delete('/products/:id', perm('delete_product'), products.deleteProduct);

// ---- Categories / brands / units ----
for (const [path, ctl, permCode] of [
  ['categories', categories, 'manage_catalog'],
  ['brands', brands, 'manage_catalog'],
  ['units', units, 'manage_catalog'],
]) {
  router.get(`/${path}`, perm('view_products', 'create_sale', permCode), ctl.list);
  router.post(`/${path}`, perm(permCode), ctl.create);
  router.put(`/${path}/:id`, perm(permCode), ctl.update);
  router.delete(`/${path}/:id`, perm(permCode), ctl.remove);
}

// ---- Inventory ----
router.get('/inventory', perm('view_inventory'), inventory.listInventory);
router.get('/inventory/summary', perm('view_inventory'), inventory.inventorySummary);
router.post('/inventory/adjust', perm('edit_inventory'), inventory.adjustStock);
router.post('/inventory/transfer', perm('edit_inventory'), inventory.transferStock);
router.get('/inventory/movements', perm('view_inventory'), inventory.listMovements);

// ---- Sales ----
router.post('/sales', perm('create_sale'), sales.createSale);
router.get('/sales', perm('create_sale', 'view_reports'), sales.listSales);
router.get('/sales/:id', perm('create_sale', 'view_reports'), sales.getSale);
router.post('/sales/:id/cancel', perm('delete_sale'), sales.cancelSale);
router.post('/sales/:id/pay-due', perm('create_sale', 'manage_customers'), sales.paySaleDue);
router.get('/sales/:id/pdf', perm('create_sale', 'view_reports'), feat('pdf_invoices'), misc.invoicePdf);
router.post('/sales/:id/email', perm('create_sale'), feat('email_receipts'), misc.emailReceipt);

// ---- Kitchen display ----
router.get('/kitchen/orders', perm('view_kitchen', 'create_sale'), feat('kitchen'), sales.kitchenOrders);
router.put('/kitchen/orders/:id', perm('view_kitchen', 'create_sale'), feat('kitchen'), sales.updateKitchenStatus);

// ---- Shifts & cash drawer ----
router.get('/shifts/current', perm('manage_shifts', 'create_sale'), feat('shifts'), shifts.currentShift);
router.post('/shifts/open', perm('manage_shifts', 'create_sale'), feat('shifts'), shifts.openShift);
router.post('/shifts/close', perm('manage_shifts', 'create_sale'), feat('shifts'), shifts.closeShift);
router.post('/shifts/cash-movement', perm('manage_shifts', 'create_sale'), feat('shifts'), shifts.cashMovement);
router.get('/shifts', perm('manage_shifts', 'view_reports'), feat('shifts'), shifts.listShifts);
router.get('/shifts/:id/report', perm('manage_shifts', 'view_reports'), feat('shifts'), shifts.shiftReport);

// ---- Held sales & quotations ----
router.get('/held-sales', perm('create_sale'), quotes.listHeld);
router.post('/held-sales', perm('create_sale'), quotes.holdSale);
router.delete('/held-sales/:id', perm('create_sale'), quotes.deleteHeld);
router.get('/quotations', perm('manage_quotations', 'create_sale'), feat('quotations'), quotes.listQuotations);
router.post('/quotations', perm('manage_quotations', 'create_sale'), feat('quotations'), quotes.createQuotation);
router.get('/quotations/:id', perm('manage_quotations', 'create_sale'), feat('quotations'), quotes.getQuotation);
router.put('/quotations/:id/status', perm('manage_quotations'), feat('quotations'), quotes.updateQuotationStatus);

// ---- Returns ----
router.get('/returns/find-invoice', perm('process_refund'), returns.findInvoiceForReturn);
router.post('/returns', perm('process_refund'), returns.createReturn);
router.get('/returns', perm('process_refund', 'view_reports'), returns.listReturns);

// ---- Customers ----
router.get('/customers', perm('manage_customers', 'create_sale'), customers.listCustomers);
router.post('/customers', perm('manage_customers', 'create_sale'), customers.createCustomer);
router.put('/customers/:id', perm('manage_customers'), customers.updateCustomer);
router.delete('/customers/:id', perm('manage_customers'), customers.deleteCustomer);
router.get('/customers/:id/history', perm('manage_customers'), customers.customerHistory);

// ---- Suppliers ----
router.get('/suppliers', perm('manage_suppliers', 'view_products'), feat('suppliers'), suppliers.listSuppliers);
router.post('/suppliers', perm('manage_suppliers'), feat('suppliers'), suppliers.createSupplier);
router.put('/suppliers/:id', perm('manage_suppliers'), feat('suppliers'), suppliers.updateSupplier);
router.delete('/suppliers/:id', perm('manage_suppliers'), feat('suppliers'), suppliers.deleteSupplier);
router.get('/suppliers/:id/history', perm('manage_suppliers'), feat('suppliers'), suppliers.supplierHistory);
router.post('/suppliers/:id/pay', perm('manage_suppliers'), feat('suppliers'), suppliers.paySupplier);

// ---- Purchases ----
router.get('/purchases', perm('manage_purchases'), feat('purchases'), purchases.listPurchases);
router.post('/purchases', perm('manage_purchases'), feat('purchases'), purchases.createPurchase);
router.post('/purchases/:id/receive', perm('manage_purchases'), feat('purchases'), purchases.receivePurchase);
router.post('/purchases/:id/pay', perm('manage_purchases'), feat('purchases'), purchases.payPurchase);
router.post('/purchase-returns', perm('manage_purchases'), feat('purchases'), purchases.createPurchaseReturn);
router.get('/purchase-returns', perm('manage_purchases'), feat('purchases'), purchases.listPurchaseReturns);
router.get('/batches/expiring', perm('view_inventory'), feat('batch_expiry'), purchases.expiringBatches);

// ---- Expenses ----
router.get('/expenses', perm('manage_expenses'), feat('expenses'), expenses.listExpenses);
router.post('/expenses', perm('manage_expenses'), feat('expenses'), expenses.createExpense);
router.put('/expenses/:id', perm('manage_expenses'), feat('expenses'), expenses.updateExpense);
router.delete('/expenses/:id', perm('manage_expenses'), feat('expenses'), expenses.deleteExpense);

// ---- Reports & dashboard ----
router.get('/reports/dashboard', perm('view_dashboard'), reports.dashboard);
router.get('/reports/sales', perm('view_reports'), feat('reports'), reports.salesReport);
router.get('/reports/products', perm('view_reports'), feat('reports'), reports.productReport);
router.get('/reports/inventory', perm('view_reports'), feat('reports'), reports.inventoryReport);
router.get('/reports/customers', perm('view_reports'), feat('reports'), reports.customerReport);
router.get('/reports/suppliers', perm('view_reports'), feat('reports'), reports.supplierReport);
router.get('/reports/financial', perm('view_reports'), feat('reports'), reports.financialReport);

// ---- Admin ----
router.get('/settings', admin.getSettings); // read-only settings are needed to render receipts everywhere
router.put('/settings', perm('manage_settings'), admin.updateSettings);
router.get('/audit-logs', perm('view_audit_logs'), feat('audit_logs'), admin.listAuditLogs);
router.get('/notifications', admin.listNotifications);
router.post('/notifications/read', admin.markNotificationsRead);
router.get('/branches', admin.listBranches);
router.post('/branches', perm('manage_settings'), admin.createBranch);
router.put('/branches/:id', perm('manage_settings'), admin.updateBranch);
router.get('/search', admin.globalSearch);

// ---- Promotions ----
router.get('/promotions', perm('create_sale', 'manage_catalog'), promos.listPromotions);
router.post('/promotions', perm('manage_catalog', 'manage_settings'), promos.createPromotion);
router.put('/promotions/:id', perm('manage_catalog', 'manage_settings'), promos.updatePromotion);
router.delete('/promotions/:id', perm('manage_catalog', 'manage_settings'), promos.deletePromotion);
router.post('/promotions/evaluate', perm('create_sale'), promos.evaluateCart);

// ---- Insights (owner intelligence) ----
router.get('/insights/kpi-trends', perm('view_dashboard'), insights.kpiTrends);
router.get('/insights/reorder', perm('view_reports', 'view_inventory'), feat('reports'), insights.reorderSuggestions);
router.get('/insights/dead-stock', perm('view_reports', 'view_inventory'), feat('reports'), insights.deadStock);
router.get('/insights/heatmap', perm('view_reports'), feat('reports'), insights.salesHeatmap);
router.get('/insights/anomalies', perm('view_reports'), feat('reports'), insights.anomalies);
router.get('/insights/digest', perm('view_reports'), feat('reports'), insights.dailyDigest);

// ---- Platform: API keys, webhooks, PIN ----
router.get('/api-keys', perm('manage_settings'), platform.listApiKeys);
router.post('/api-keys', perm('manage_settings'), platform.createApiKey);
router.post('/api-keys/:id/revoke', perm('manage_settings'), platform.revokeApiKey);
router.get('/webhooks', perm('manage_settings'), platform.listWebhooks);
router.post('/webhooks', perm('manage_settings'), platform.createWebhook);
router.delete('/webhooks/:id', perm('manage_settings'), platform.deleteWebhook);
router.post('/auth/set-pin', platform.setPin);

// ---- Uploads, events, system ----
router.post('/uploads', perm('create_product', 'edit_product'), upload.single('image'), uploadImage);
router.get('/events', sseHandler);
router.get('/system/backup', perm('manage_settings'), feat('backup'), misc.downloadBackup);
router.post('/system/purge-audit', perm('manage_settings'), misc.purgeAuditLogs);
router.get('/system/target', perm('view_dashboard'), misc.targetProgress);

export default router;
