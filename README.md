# SmartMart POS — Point of Sale, Billing & Inventory Management System

A **full-stack, production-ready POS and business management platform** for retail stores, supermarkets, pharmacies, electronics shops, clothing stores, and wholesalers.

Built with **React + Vite + TypeScript + Tailwind CSS** on the frontend and **Node.js + Express + PostgreSQL** on the backend.

---

## ✨ Features

### Point of Sale
- Barcode-first checkout: USB/keyboard scanner + **camera scanning** (phone/tablet via html5-qrcode)
- Product grid with category filters, live search, stock badges
- Cart with quantity controls, line & order discounts (**amount or percentage**)
- **Split payments** — any mix of cash / card / bank / mobile / customer credit / loyalty points
- **Credit sales** — unpaid balance tracked on the customer account, received later against the invoice
- **Hold / recall (park) sales** — server-side, recallable from any terminal (F7)
- **Loyalty program** — earn points per amount paid, redeem as payment; configurable rates
- **Price tiers** — wholesale customers automatically get wholesale prices
- **Tax modes** — exclusive (added on top) or inclusive (extracted from price)
- Thermal receipt (80mm/58mm), print, **server-generated A4 PDF invoice**, **email receipt** (SMTP)
- Keyboard shortcuts (F1 help, F2 search, F4 customer, F6 discount, F7 hold, F8 pay, F9 complete)
- **True offline queue** — completed sales queue in localStorage when offline and auto-sync on reconnect
- **Kitchen mode** (restaurant) — kitchen orders flow to a live Kitchen Display via SSE

### Shifts & Cash Drawer
- Open shift with float, cash in/out with reasons, live expected-cash tracking
- Close shift with counted cash → **Z-report** (expected vs counted, over/short, takings by method)
- Shift history with printable Z-reports; sales auto-attach to the cashier's open shift

### Inventory
- Real-time stock per branch, low-stock and out-of-stock dashboards
- Stock adjustments (add / remove / damage / reconcile) — reason required, fully audited
- Branch-to-branch stock transfers
- Complete movement history (previous stock → new stock, type, user, reason, reference)
- Negative stock blocked by default (admin-configurable)

### Sales, Billing & Returns
- Unique sequential invoice numbers (`INV-2026-000001`)
- Full sales history with search/filter/date range, CSV export
- Sale cancellation (reverses inventory, preserves the financial record)
- Partial & full returns against invoices with proportional refunds (incl. tax & discounts)
- All sale operations run inside **database transactions** — no partial writes

### Purchasing & Partners
- Purchase orders with **full or partial receiving**, supplier balances, partial payments
- **Purchase returns** — return goods to suppliers (stock down, supplier balance down)
- **Weighted-average costing** — COGS uses a rolling average cost updated on every receipt
- **Batch & expiry tracking** — capture batch no. + expiry when receiving; FEFO depletion on sale; expiring-stock report
- Supplier management with history & direct payments
- Customer CRM with purchase history, returns, credit balances, loyalty points, price tiers
- **Quotations** — create quotes, print, convert to sales through the POS

### SaaS Subscription & Billing
- **Three plans**: Basic (free) / Standard / Pro — monthly or yearly (17% off), 14-day Pro trial on fresh installs
- **Server-enforced feature gating** — premium routes return HTTP 402 with the required plan; UI shows lock icons + upgrade screens
- **Plan limits** — max users / products / branches enforced at creation time with friendly upgrade messages
- Billing page: plan comparison cards, usage meters, simulated card checkout (4242… succeeds, …0002 declines), payment history, cancel/resubscribe
- Cancelling or expiring **never blocks data** — features lock, everything returns on resubscribe
- Swap the simulated processor with Stripe/local gateway in `billingController.js` for production

### Premium Experience
- **Onboarding wizard** — first-run setup: business info → logo upload → currency/tax → first product
- **Scan sounds** — WebAudio beep/buzz feedback on barcode scans and sale completion (toggleable)
- **Command palette** (`Ctrl/Cmd+K`) — jump to any page, product, invoice or customer instantly
- **KPI trend strip** — today vs yesterday deltas with 7-day sparklines on the dashboard
- **Customer display** — `/customer-display` on a second monitor mirrors the cart live, shows change due & thank-you screen
- **WhatsApp receipts** — one-click share of a formatted receipt to the customer's number
- **Cashier PIN switching** — 4–6 digit PIN keypad for instant user switching at the terminal
- **Business logo** — rendered in sidebar, receipts (toggleable), invoices and customer display
- **PWA** — installable app with manifest + service worker (app-shell caching; API never cached)

### Competitor-beating Retail Features
- **Promotions engine** — % off product, % off category, Buy-X-Get-Y-free; date-bound; auto-applied at POS with toast feedback
- **Scale/weight barcodes** — EAN-13 `PP IIIII WWWWW C` labels resolve to product + weight, price computed per kg (prefix configurable)
- **Receipt customization** — toggle logo & tax breakdown, custom footer, 58/80mm widths

### Owner Intelligence (Insights page)
- **Daily digest** — revenue, profit, net, best sellers, refunds, expenses, drawer results, per-cashier breakdown, any date
- **Anomaly flags** — refund spikes vs 30-day average, outlier discounting per cashier, drawer over/short alerts
- **Reorder suggestions** — 30-day sales velocity vs stock: days-of-cover left, suggested quantity, estimated cost, supplier
- **Dead stock** — capital tied up in products unsold for 60+ days
- **Busiest-hours heatmap** — weekday × hour sales intensity for staffing decisions

### Integrations
- **API keys** — hashed at rest, shown once; machine endpoints `GET /api/v1/products`, `GET /api/v1/sales` via `X-API-Key`
- **Webhooks** — POST to your URL on `sale.created` (and more), with last-status tracking

### Multi-Tenant SaaS Mode
- Set `MULTI_TENANT=true` (+ `CONTROL_DATABASE_URL`) — one server hosts unlimited stores
- **Database-per-tenant isolation**: each store gets its own PostgreSQL database, provisioned automatically at signup (schema + roles + owner account + 14-day Pro trial)
- Public self-serve signup on the login screen ("Create your store"); requests route via the `X-Tenant` store-code header through AsyncLocalStorage — zero controller changes
- Per-store subscriptions, invoice numbering, feature gates and limits — fully independent
- Single-tenant/desktop mode is entirely unaffected (default)

### Marketing Kit (`website/`)
- `index.html` — production-ready landing page: 4 languages (English / اردو / العربية / Español) with RTL support, pricing, FAQ, lead-capture form that opens WhatsApp pre-filled with the lead
- `brochure.html` — print-ready A4 sales brochure, one page per language; open → Ctrl+P → Save as PDF
- App UI language switcher upgraded to the same 4 languages (web & desktop)

### Security & Platform
- **Refresh-token rotation** — short-lived access tokens auto-renewed; disabling a user revokes their sessions
- **Forgot / reset password** flow (emails via SMTP; on-screen token in dev/demo mode)
- **Product image uploads** (multipart, served by the API)
- **Real-time updates** via Server-Sent Events (sales, notifications, kitchen orders)
- **Database backup** download (pg_dump) + audit-log retention purge from Settings
- Daily sales target with dashboard progress bar
- English/Urdu UI language toggle · CSV **and Excel (.xlsx)** product import
- Route-level code splitting · Vitest unit tests for billing math (`npm test` in frontend)
- **Docker Compose** one-command deployment (`docker compose up`) — db + api + nginx web

### Finance & Reports
- Expenses by category (rent, salaries, utilities, …)
- True Profit & Loss: Revenue − COGS = Gross Profit − Expenses = Net Profit
- Reports: sales, products (best/worst/most profitable), inventory valuation, customers, suppliers, financial
- CSV export & print for every report; Recharts dashboards with date-range filtering

### Administration
- Role-based access control: Super Admin / Manager / Cashier + custom roles
- 20 granular permissions editable per role from the UI
- User management: create, disable, reset passwords, login activity
- Full audit log (login, sales, refunds, inventory changes, settings changes, IP, timestamp)
- Notification center (low stock, out of stock, large refunds, purchases)
- Multi-branch architecture with per-branch inventory, sales and performance
- Business settings: name, currency, tax, receipt footer, barcode format, negative-stock policy
- Dark / light mode (remembered), fully responsive (desktop / tablet / mobile)

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS 4, Zustand, React Router, Axios, Recharts, Lucide, JsBarcode |
| Backend | Node.js 20, Express, JWT, bcryptjs, express-rate-limit |
| Database | PostgreSQL (normalized, 24 tables, indexed, FK constraints, transactions) |

## 📁 Project Structure

```
pos-system/
├── backend/
│   ├── src/
│   │   ├── config/          # env loading & validation
│   │   ├── controllers/     # auth, products, sales, returns, purchases, reports, admin…
│   │   ├── db/              # pool, schema.sql, migrate, seed
│   │   ├── middleware/      # auth (JWT + permissions), validation, error handler
│   │   ├── routes/          # REST route definitions with per-route permissions
│   │   ├── services/        # inventory, audit, document numbering
│   │   └── utils/           # helpers, error classes
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api/             # axios client with auth + offline interceptors
    │   ├── components/      # reusable UI kit (modals, tables, toasts…) + Receipt
    │   ├── layouts/         # app shell: sidebar, topbar, notifications, global search
    │   ├── pages/           # Dashboard, POS, Sales, Returns, Products, Inventory…
    │   ├── stores/          # zustand: auth, cart, theme, settings, toasts, connection
    │   ├── types/           # shared TypeScript types
    │   └── utils/           # formatting, CSV export
    └── .env.example
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 13+

### 1. Database
```bash
createuser pos_user --pwprompt
createdb pos_db -O pos_user
```

### 2. Backend
```bash
cd backend
cp .env.example .env        # edit DATABASE_URL and JWT_SECRET
npm install
npm run migrate             # creates all tables & indexes
npm run seed                # demo data + demo accounts
npm run dev                 # http://localhost:4000
```

Environment variables (`backend/.env`):

| Variable | Description |
|---|---|
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long random secret for signing tokens |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `12h` |
| `CORS_ORIGIN` | Allowed origin(s), comma-separated, or `*` for dev |
| `SEED_ADMIN_PASSWORD` etc. | Optional: override demo account passwords at seed time |

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000 (proxies /api → :4000)
```

For production builds set `VITE_API_URL` to your deployed API origin.

### Demo accounts (created by the seed script — change in production)

| Role | Username | Password |
|---|---|---|
| Super Admin | `admin` | `admin123` |
| Manager | `manager` | `manager123` |
| Cashier | `cashier` | `cashier123` |

---

## 🔌 API Overview

All endpoints are under `/api`, return `{ success, data, meta? }`, and require `Authorization: Bearer <token>` (except login/health). Authorization is enforced per-route by permission codes.

```
POST /api/auth/login               GET  /api/auth/me
GET  /api/products                 GET  /api/products/lookup?code=BARCODE
POST /api/products                 POST /api/products/import
GET  /api/categories|brands|units  CRUD
GET  /api/inventory                POST /api/inventory/adjust|transfer
GET  /api/inventory/movements
POST /api/sales                    GET  /api/sales, /api/sales/:id
POST /api/sales/:id/cancel
GET  /api/returns/find-invoice     POST /api/returns
GET  /api/customers|suppliers      CRUD + /:id/history
POST /api/purchases                POST /api/purchases/:id/receive|pay
GET  /api/expenses                 CRUD
GET  /api/reports/dashboard|sales|products|inventory|customers|suppliers|financial
GET  /api/settings                 PUT  /api/settings
GET  /api/audit-logs               GET  /api/notifications
GET  /api/branches                 GET  /api/search?q=
```

---

## 🔒 Security & Data Integrity

- Passwords hashed with bcrypt (10 rounds); hashes never returned by the API
- JWT auth + per-route permission middleware; super admin bypass, cashiers restricted
- Parameterized SQL everywhere (no string interpolation of user input)
- Login rate limiting (30 attempts / 15 min) + global API rate limit
- Sales/returns/purchases run in DB transactions with row locking (`FOR UPDATE`)
- Stock cannot go negative unless explicitly enabled in settings
- Financial records are never deleted — cancellations & returns are compensating entries
- Products soft-delete; invoice numbers unique via an atomic counters table
- Production error messages never leak internals

## ☁️ Deployment

**Frontend (Vercel):** root `frontend/`, build `npm run build`, output `dist/`, env `VITE_API_URL=https://your-api.example.com`. Add a SPA rewrite: all routes → `/index.html`.

**Backend (Railway / Render / Fly):** root `backend/`, start `npm start`, run `npm run migrate && npm run seed` once. Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN=https://your-frontend.vercel.app`, `NODE_ENV=production`. SSL for hosted Postgres is enabled automatically in production.

**Database:** any hosted PostgreSQL (Railway, Neon, Supabase, RDS).

## 📸 Screenshots

*(add screenshots of the Dashboard, POS terminal, receipt, inventory and reports here)*

## License

Provided as a custom business software project. All rights reserved to the purchasing business.
