import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import { toast } from './toast';

export interface QueuedSale {
  localId: string;
  payload: any;
  queuedAt: string;
}

interface OfflineQueueState {
  queue: QueuedSale[];
  syncing: boolean;
  enqueue: (payload: any) => QueuedSale;
  sync: () => Promise<void>;
}

/**
 * Offline sale queue: when the network is down, completed sales are stored locally
 * and synced (in order) when the connection returns. Invoice numbers are assigned
 * by the server at sync time to keep them globally unique.
 */
export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncing: false,
      enqueue: (payload) => {
        const item: QueuedSale = {
          localId: `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          payload,
          queuedAt: new Date().toISOString(),
        };
        set({ queue: [...get().queue, item] });
        return item;
      },
      sync: async () => {
        const { queue, syncing } = get();
        if (syncing || !queue.length) return;
        set({ syncing: true });
        let synced = 0;
        const remaining = [...queue];
        for (const item of queue) {
          try {
            await api.post('/sales', { ...item.payload, notes: `${item.payload.notes || ''} [offline sale ${item.queuedAt}]`.trim() });
            remaining.shift();
            synced++;
            set({ queue: [...remaining] });
          } catch (e: any) {
            if (!e.response) break; // still offline — stop, keep the rest
            // Server rejected (e.g. stock changed): drop it but tell the user
            remaining.shift();
            set({ queue: [...remaining] });
            toast.error(`Queued sale could not be synced: ${e.response.data?.error || 'rejected'}`);
          }
        }
        set({ syncing: false });
        if (synced > 0) toast.success(`${synced} offline sale(s) synced to the server`);
      },
    }),
    { name: 'pos-offline-queue' }
  )
);
