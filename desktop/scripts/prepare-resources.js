/**
 * Assembles everything the installer needs into desktop/resources/:
 *   resources/backend/        — backend source + production node_modules
 *   resources/frontend-dist/  — built frontend (vite build)
 * Run automatically by `npm run dist`.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BACKEND_SRC = path.join(ROOT, 'backend');
const FRONTEND_SRC = path.join(ROOT, 'frontend');
const RES = path.join(__dirname, '..', 'resources');

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('→ Cleaning resources/');
fs.rmSync(RES, { recursive: true, force: true });
fs.mkdirSync(path.join(RES, 'backend'), { recursive: true });

console.log('→ Building frontend');
run('npm run build', FRONTEND_SRC);
fs.cpSync(path.join(FRONTEND_SRC, 'dist'), path.join(RES, 'frontend-dist'), { recursive: true });

console.log('→ Copying backend source');
fs.cpSync(path.join(BACKEND_SRC, 'src'), path.join(RES, 'backend', 'src'), { recursive: true });
fs.copyFileSync(path.join(BACKEND_SRC, 'package.json'), path.join(RES, 'backend', 'package.json'));
if (fs.existsSync(path.join(BACKEND_SRC, 'package-lock.json'))) {
  fs.copyFileSync(path.join(BACKEND_SRC, 'package-lock.json'), path.join(RES, 'backend', 'package-lock.json'));
}

console.log('→ Installing backend production dependencies');
run('npm ci --omit=dev --no-audit --no-fund', path.join(RES, 'backend'));

console.log('✔ Resources ready in desktop/resources/');
