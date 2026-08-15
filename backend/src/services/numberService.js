/** Sequential, unique document numbers backed by a counters table (safe under concurrency). */
export async function nextNumber(client, counterName, prefix) {
  const { rows } = await client.query(
    `INSERT INTO counters (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    [counterName]
  );
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(rows[0].value).padStart(6, '0')}`;
}
