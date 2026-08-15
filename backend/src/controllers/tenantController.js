import { asyncHandler, ok, created } from '../utils/helpers.js';
import { provisionTenant, getTenant } from '../services/tenantService.js';

/** Public signup: creates a new isolated store (multi-tenant mode only). */
export const signup = asyncHandler(async (req, res) => {
  const { code, name, owner_name, email, password } = req.body || {};
  const tenant = await provisionTenant({ code, name, ownerName: owner_name, ownerEmail: email, password });
  created(res, {
    code: tenant.code,
    name: tenant.name,
    message: `Store "${tenant.name}" is ready! Sign in with your email and password using store code "${tenant.code}".`,
  });
});

/** Public check: does this store code exist? (used by the store-code screen) */
export const lookup = asyncHandler(async (req, res) => {
  const tenant = await getTenant(req.params.code);
  if (!tenant) return res.status(404).json({ success: false, error: 'Store not found' });
  ok(res, { code: tenant.code, name: tenant.name });
});
