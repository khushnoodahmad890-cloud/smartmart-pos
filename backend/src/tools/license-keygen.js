/**
 * Vendor tool: generate offline license keys.
 *
 *   node src/tools/license-keygen.js --plan pro --months 12 --customer "Al-Noor Mart"
 *   node src/tools/license-keygen.js --plan standard --forever --customer "Demo"
 *
 * Uses LICENSE_PRIVATE_KEY env var if set, otherwise the built-in demo key.
 * NEVER ship your production private key inside the app.
 */
import { signLicense } from '../services/licenseService.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const plan = get('--plan') || 'pro';
const customer = get('--customer') || 'Unnamed customer';
const months = Number(get('--months') || 12);
const forever = args.includes('--forever');

if (!['basic', 'standard', 'pro'].includes(plan)) {
  console.error('Plan must be basic, standard or pro');
  process.exit(1);
}

let expires = 'never';
if (!forever) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  expires = d.toISOString().slice(0, 10);
}

const key = signLicense({ plan, expires, customer }, process.env.LICENSE_PRIVATE_KEY || undefined);
console.log('\nLicense key generated:');
console.log(`  Customer: ${customer}`);
console.log(`  Plan:     ${plan}`);
console.log(`  Expires:  ${expires}`);
console.log('\n' + key + '\n');
