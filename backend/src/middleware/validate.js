import { badRequest } from '../utils/errors.js';

/**
 * Tiny declarative validator.
 * rules: { field: { required, type: 'string'|'number'|'int'|'boolean'|'array'|'email', min, max, maxLen, enum } }
 */
export function validateBody(rules) {
  return (req, _res, next) => {
    const body = req.body || {};
    for (const [field, rule] of Object.entries(rules)) {
      let val = body[field];
      const isEmpty = val === undefined || val === null || val === '';
      if (rule.required && isEmpty) return next(badRequest(`${rule.label || field} is required`));
      if (isEmpty) continue;

      switch (rule.type) {
        case 'number':
        case 'int': {
          const n = Number(val);
          if (Number.isNaN(n)) return next(badRequest(`${rule.label || field} must be a number`));
          if (rule.type === 'int' && !Number.isInteger(n)) return next(badRequest(`${rule.label || field} must be a whole number`));
          if (rule.min !== undefined && n < rule.min) return next(badRequest(`${rule.label || field} must be at least ${rule.min}`));
          if (rule.max !== undefined && n > rule.max) return next(badRequest(`${rule.label || field} must be at most ${rule.max}`));
          body[field] = n;
          break;
        }
        case 'boolean':
          if (typeof val !== 'boolean') return next(badRequest(`${rule.label || field} must be true or false`));
          break;
        case 'array':
          if (!Array.isArray(val)) return next(badRequest(`${rule.label || field} must be a list`));
          if (rule.minItems && val.length < rule.minItems) return next(badRequest(`${rule.label || field} must contain at least ${rule.minItems} item(s)`));
          break;
        case 'email':
          if (typeof val !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return next(badRequest(`${rule.label || field} must be a valid email`));
          break;
        default: {
          if (typeof val !== 'string') return next(badRequest(`${rule.label || field} must be text`));
          val = val.trim();
          if (rule.maxLen && val.length > rule.maxLen) return next(badRequest(`${rule.label || field} is too long`));
          body[field] = val;
        }
      }
      if (rule.enum && !rule.enum.includes(body[field])) {
        return next(badRequest(`${rule.label || field} must be one of: ${rule.enum.join(', ')}`));
      }
    }
    next();
  };
}
