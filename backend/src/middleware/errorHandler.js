import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code });
  }
  // PostgreSQL unique violation
  if (err && err.code === '23505') {
    const detail = err.constraint || '';
    let msg = 'A record with this value already exists.';
    if (detail.includes('barcode')) msg = 'This barcode is already assigned to another product.';
    else if (detail.includes('sku')) msg = 'This SKU is already in use.';
    else if (detail.includes('email')) msg = 'This email is already registered.';
    else if (detail.includes('username')) msg = 'This username is already taken.';
    return res.status(409).json({ success: false, error: msg });
  }
  // FK violation
  if (err && err.code === '23503') {
    return res.status(409).json({ success: false, error: 'This record is referenced by other data and cannot be modified this way.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: env.isProd ? 'An internal server error occurred. Please try again.' : (err.message || 'Internal server error'),
  });
}
