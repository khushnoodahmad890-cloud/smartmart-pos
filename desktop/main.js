/**
 * SmartMart POS — Desktop shell.
 *
 * Boot sequence:
 *   1. Start (or initialize) an embedded PostgreSQL cluster in the user's data dir
 *   2. Run migrations + first-run bootstrap (creates the admin account)
 *   3. Start the bundled Express backend (serves API + built frontend)
 *   4. Open the app window at http://127.0.0.1:<port>
 *
 * All data lives under app.getPath('userData'):  pgdata/, uploads/, config.json
 */
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');

let pg = null;          // embedded-postgres instance
let backendProc = null; // forked backend
let mainWindow = null;
let splash = null;

const isDev = !app.isPackaged;
const RES = isDev ? path.join(__dirname, 'resources') : process.resourcesPath;
const BACKEND_DIR = path.join(RES, 'backend');
const FRONTEND_DIST = path.join(RES, 'frontend-dist');

function userDataPath(...p) { return path.join(app.getPath('userData'), ...p); }

/** Persistent per-install config (ports + generated secrets). */
function loadConfig() {
  const file = userDataPath('config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  let changed = false;
  if (!cfg.jwtSecret) { cfg.jwtSecret = crypto.randomBytes(48).toString('hex'); changed = true; }
  if (!cfg.dbPassword) { cfg.dbPassword = crypto.randomBytes(24).toString('hex'); changed = true; }
  if (!cfg.appPort) { cfg.appPort = 47800; changed = true; }
  if (!cfg.dbPort) { cfg.dbPort = 47832; changed = true; }
  if (changed) {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  }
  return cfg;
}

function waitForPort(port, host, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tryOnce = () => {
      const sock = net.connect(port, host);
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`Timeout waiting for port ${port}`));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function setSplashStatus(text) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(
      `document.getElementById('status').textContent = ${JSON.stringify(text)};`
    ).catch(() => {});
  }
}

async function startDatabase(cfg) {
  setSplashStatus('Starting database…');

  const embeddedPostgres = await import('embedded-postgres');
  const EmbeddedPostgres = embeddedPostgres.default || embeddedPostgres;
  const dataDir = userDataPath('pgdata');
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'pos_user',
    password: cfg.dbPassword,
    port: cfg.dbPort,
    persistent: true,
  });

  if (firstRun) {
    setSplashStatus('Preparing database (first run)…');
    await pg.initialise();
  }
  await pg.start();
  if (firstRun) await pg.createDatabase('pos_db');
}

function runBackendScript(script, env) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(BACKEND_DIR, script), [], {
      cwd: BACKEND_DIR, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    child.on('exit', (code) => code === 0 ? resolve(out) : reject(new Error(`${script} exited ${code}\n${out.slice(-800)}`)));
  });
}

async function startBackend(cfg) {
  const env = {
    NODE_ENV: 'production',
    PORT: String(cfg.appPort),
    DATABASE_URL: `postgresql://pos_user:${cfg.dbPassword}@127.0.0.1:${cfg.dbPort}/pos_db`,
    JWT_SECRET: cfg.jwtSecret,
    CORS_ORIGIN: `http://127.0.0.1:${cfg.appPort}`,
    FRONTEND_DIST,
    UPLOAD_DIR: userDataPath('uploads'),
  };

  setSplashStatus('Preparing your data…');
  await runBackendScript('src/db/migrate.js', env);
  await runBackendScript('src/db/bootstrap.js', env);

  setSplashStatus('Starting application…');
  backendProc = fork(path.join(BACKEND_DIR, 'src/index.js'), [], {
    cwd: BACKEND_DIR, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backendProc.stdout?.on('data', (d) => console.log('[api]', String(d).trim()));
  backendProc.stderr?.on('data', (d) => console.error('[api]', String(d).trim()));
  await waitForPort(cfg.appPort, '127.0.0.1');
}

function createSplash() {
  splash = new BrowserWindow({
    width: 420, height: 300, frame: false, resizable: false,
    alwaysOnTop: true, show: true,
    webPreferences: { contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

function createWindow(cfg) {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    show: false,
    backgroundColor: '#0f172a',
    title: 'SmartMart POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (WhatsApp share etc.) in the system browser,
  // but allow the customer display to open as a real second window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${cfg.appPort}`)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#0f172a' },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Exit SmartMart POS' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'togglefullscreen' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'Developer Tools' },
    ]},
    { label: 'Help', submenu: [
      { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
    ]},
  ]));

  mainWindow.loadURL(`http://127.0.0.1:${cfg.appPort}`);
  mainWindow.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) splash.destroy();
    mainWindow.show();
  });
}

async function boot() {
  const cfg = loadConfig();
  createSplash();
  try {
    await startDatabase(cfg);
    await startBackend(cfg);
    createWindow(cfg);
  } catch (err) {
    console.error(err);
    dialog.showErrorBox('SmartMart POS could not start',
      `${err.message}\n\nIf this keeps happening, use Help → Open data folder and send us the logs.`);
    app.quit();
  }
}

async function shutdown() {
  try { backendProc?.kill(); } catch {}
  try { if (pg) await pg.stop(); } catch {}
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(boot);
}

app.on('window-all-closed', async () => {
  await shutdown();
  app.quit();
});
app.on('before-quit', shutdown);
