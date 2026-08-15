/** Broadcast the active cart to the customer-facing display (second window/monitor). */
let bc: BroadcastChannel | null = null;
try { bc = new BroadcastChannel('pos-customer-display'); } catch { /* unsupported */ }

export function broadcastDisplay(state: any) {
  try {
    localStorage.setItem('pos-customer-display', JSON.stringify(state));
    bc?.postMessage(state);
  } catch { /* ignore */ }
}
