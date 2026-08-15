import { query } from '../db/pool.js';

export async function audit({ userId, action, entity, entityId, description, ip }, client) {
  const q = client || { query: (t, p) => query(t, p) };
  try {
    await q.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, description, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId || null, action, entity || null, entityId != null ? String(entityId) : null, description || null, ip || null]
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}

export async function notify({ type, title, message }, client) {
  const q = client || { query: (t, p) => query(t, p) };
  try {
    await q.query(`INSERT INTO notifications (type, title, message) VALUES ($1,$2,$3)`, [type, title, message || null]);
  } catch (e) {
    console.error('notification failed:', e.message);
  }
}
