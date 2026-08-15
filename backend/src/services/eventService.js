/** Server-Sent Events hub: pushes real-time updates (sales, notifications, kitchen) to connected clients. */
const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: {"ok":true}\n\n`);
  const client = { res, userId: req.user?.id, role: req.user?.role_name };
  clients.add(client);
  const ping = setInterval(() => res.write(`: ping\n\n`), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try { c.res.write(payload); } catch { clients.delete(c); }
  }
}
