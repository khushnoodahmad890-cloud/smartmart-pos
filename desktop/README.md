# SmartMart POS — Desktop Edition

Ship the entire platform as a **downloadable, installable desktop app**: one installer, no separate database or server setup for the customer. Everything (embedded PostgreSQL, the API, the app) runs locally on their PC. Subscriptions, billing, feature gating and every other feature work exactly as in the web edition — plus **offline license keys** for selling without recurring card payments.

## How it works

```
SmartMart-POS-Setup.exe
└── Electron shell (main.js)
    ├── embedded PostgreSQL  → %APPDATA%/smartmart-pos-desktop/pgdata
    ├── Express backend      → http://127.0.0.1:47800 (API + built frontend)
    └── App window           → loads the local URL; customer display opens as a 2nd window
```

First launch: initializes the database cluster, runs migrations, creates the
`admin / admin123` account (change immediately), starts a **14-day Pro trial**, and shows the
onboarding wizard. All data stays on the machine under the user-data folder
(`Help → Open data folder`). Per-install secrets (JWT secret, DB password) are generated
randomly on first run.

## Building installers

```bash
cd desktop
npm install               # electron, electron-builder, embedded-postgres

npm run dist:win          # → dist/SmartMart POS Setup 1.0.0.exe   (NSIS)
npm run dist:linux        # → dist/SmartMart POS-1.0.0.AppImage
npm run dist              # current platform
```

> Build on the target OS (or use a Windows VM/CI for .exe). `prepare-resources`
> automatically builds the frontend and packages the backend with production deps.
> Note: `embedded-postgres` downloads platform-specific PostgreSQL binaries at install
> time — run `npm install` on (or targeting) the OS you're building for.

Icons: put `icon.ico` / `icon.png` / `icon.icns` in `desktop/build/` (512×512 recommended).

## Licensing (selling the software)

Two ways customers can pay, both built in:

1. **Card subscription** (web-style) — the simulated processor in `billingController.js`; swap in Stripe/local gateway.
2. **Offline license keys** (typical for desktop sales):

```bash
# You (the vendor) generate keys — customers activate them in Billing → "Have a license key?"
cd backend
npm run keygen -- --plan pro --months 12 --customer "Al-Noor Mart"
npm run keygen -- --plan standard --forever --customer "Some Store"
```

Keys are **Ed25519-signed**: verified fully offline, cannot be forged or edited
(any tampering fails the signature check). Expired keys are rejected; expiry drops
the install back to Basic features (data is never touched).

**For production:** generate your own key pair and keep the private key OFF customer machines:

```bash
node -e "const{generateKeyPairSync}=require('crypto');const{publicKey,privateKey}=generateKeyPairSync('ed25519');console.log(publicKey.export({type:'spki',format:'pem'}));console.log(privateKey.export({type:'pkcs8',format:'pem'}))"
# Put the PUBLIC key in the app:   LICENSE_PUBLIC_KEY env (or replace DEMO_PUBLIC_KEY_PEM)
# Keep the PRIVATE key with you:   LICENSE_PRIVATE_KEY env when running keygen
```

## Dev / test without Electron

The exact desktop runtime can be tested headlessly:

```bash
cd backend
DATABASE_URL=... JWT_SECRET=... PORT=47800 NODE_ENV=production \
  FRONTEND_DIST=../frontend/dist npm start
# → one server: app + API on http://127.0.0.1:47800
npm run migrate && npm run bootstrap   # fresh-install path (no demo data)
```

## Web vs Desktop editions

| | Web (SaaS) | Desktop |
|---|---|---|
| Install | none (browser) | one installer |
| Database | hosted PostgreSQL | embedded, auto-managed |
| First data | `npm run seed` (demo) | `bootstrap` (clean + wizard) |
| Billing | card checkout | card **or** offline license keys |
| Updates | deploy | ship new installer (electron-updater ready) |
| LAN use | n/a | other tills/phones on the LAN can browse to `http://<pc-ip>:47800` |
