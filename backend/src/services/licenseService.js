/**
 * Offline license keys for the desktop edition.
 *
 * Format:  SMPOS-<base64url payload>-<base64url ed25519 signature>
 * Payload: { plan, expires ('YYYY-MM-DD' or 'never'), customer }
 *
 * The application ships with ONLY the vendor PUBLIC key — keys can be verified
 * fully offline but cannot be forged. The vendor generates keys with:
 *   node src/tools/license-keygen.js --plan pro --months 12 --customer "Store Name"
 * (set LICENSE_PUBLIC_KEY env var to your own key pair for production; the
 *  built-in default pair is for demo/evaluation.)
 */
import crypto from 'crypto';

// Demo/eval key pair. For production generate your own:
//   node -e "const{generateKeyPairSync}=require('crypto');const{publicKey,privateKey}=generateKeyPairSync('ed25519');console.log(publicKey.export({type:'spki',format:'pem'}));console.log(privateKey.export({type:'pkcs8',format:'pem'}))"
export const DEMO_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAbqMbBVHmcghkEFECXXWlw899P0+6Lpz7iMbVueR8h4M=
-----END PUBLIC KEY-----`;

// Demo private key — ONLY for local key generation in evaluation builds.
export const DEMO_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJP6jDN+bTeANUpmdkqswWSiBqXKVjr4E91zaDC7q1eA
-----END PRIVATE KEY-----`;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

function publicKey() {
  return crypto.createPublicKey(process.env.LICENSE_PUBLIC_KEY || DEMO_PUBLIC_KEY_PEM);
}

export function signLicense({ plan, expires, customer }, privateKeyPem) {
  const payload = JSON.stringify({ plan, expires, customer });
  const key = crypto.createPrivateKey(privateKeyPem || DEMO_PRIVATE_KEY_PEM);
  const sig = crypto.sign(null, Buffer.from(payload), key);
  return `SMPOS-${b64u(payload)}-${b64u(sig)}`;
}

/** Verify a key string. Returns { valid, plan, expires, customer, reason }. */
export function verifyLicense(keyString) {
  try {
    const trimmed = String(keyString || '').trim().replace(/\s+/g, '');
    if (!trimmed.startsWith('SMPOS-')) return { valid: false, reason: 'Invalid key format' };
    const body = trimmed.slice(6);
    // Ed25519 signatures are exactly 64 bytes = 86 base64url chars; the separator '-' precedes them.
    const SIG_LEN = 86;
    if (body.length < SIG_LEN + 2 || body[body.length - SIG_LEN - 1] !== '-') {
      return { valid: false, reason: 'Invalid key format' };
    }
    const payloadB64 = body.slice(0, body.length - SIG_LEN - 1);
    const sigB64 = body.slice(-SIG_LEN);
    if (!/^[A-Za-z0-9_-]+$/.test(payloadB64) || !/^[A-Za-z0-9_-]+$/.test(sigB64)) {
      return { valid: false, reason: 'Invalid key format' };
    }
    const payloadBuf = fromB64u(payloadB64);
    const sig = fromB64u(sigB64);
    const okSig = crypto.verify(null, payloadBuf, publicKey(), sig);
    if (!okSig) return { valid: false, reason: 'Signature check failed — this key was not issued for this software' };
    const payload = JSON.parse(payloadBuf.toString());
    if (!['basic', 'standard', 'pro'].includes(payload.plan)) return { valid: false, reason: 'Unknown plan in key' };
    if (payload.expires !== 'never' && new Date(payload.expires) < new Date()) {
      return { valid: false, reason: `This license expired on ${payload.expires}` };
    }
    return { valid: true, ...payload };
  } catch {
    return { valid: false, reason: 'Could not read this key' };
  }
}
