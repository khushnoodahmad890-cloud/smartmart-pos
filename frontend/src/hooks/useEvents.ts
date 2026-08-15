import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth';

/** Subscribe to server-sent events (real-time sales / kitchen / notification updates). */
export function useEvents(handlers: Record<string, (data: any) => void>) {
  const token = useAuthStore((s) => s.token);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return;
    const base = (import.meta.env.VITE_API_URL || '') + '/api';
    const es = new EventSource(`${base}/events?token=${encodeURIComponent(token)}`);
    const listeners: [string, (e: MessageEvent) => void][] = [];
    for (const event of Object.keys(handlersRef.current)) {
      const fn = (e: MessageEvent) => {
        try { handlersRef.current[event]?.(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      es.addEventListener(event, fn);
      listeners.push([event, fn]);
    }
    return () => { listeners.forEach(([ev, fn]) => es.removeEventListener(ev, fn)); es.close(); };
  }, [token]);
}
