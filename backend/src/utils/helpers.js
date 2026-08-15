export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const ok = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });
export const created = (res, data) => res.status(201).json({ success: true, data });

export function parsePagination(req, defaults = { limit: 20 }) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || String(defaults.limit), 10) || defaults.limit));
  return { page, limit, offset: (page - 1) * limit };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Resolve a date range from query params: period=today|yesterday|week|month|year or from/to */
export function dateRange(req) {
  const { period, from, to } = req.query;
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  if (from && to) return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };

  switch (period) {
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'week': {
      const w = new Date(now); w.setDate(w.getDate() - w.getDay());
      return { from: startOfDay(w), to: endOfDay(now) };
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(m), to: endOfDay(now) };
    }
    case 'year': {
      const y = new Date(now.getFullYear(), 0, 1);
      return { from: startOfDay(y), to: endOfDay(now) };
    }
    case 'all':
      return { from: new Date(0), to: endOfDay(now) };
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}
