import { create } from 'zustand';

interface ConnectionState { online: boolean; setOnline: (v: boolean) => void }

export const useConnectionStore = create<ConnectionState>((set) => ({
  online: true,
  setOnline: (online) => set({ online }),
}));

window.addEventListener('offline', () => useConnectionStore.getState().setOnline(false));
window.addEventListener('online', () => useConnectionStore.getState().setOnline(true));
