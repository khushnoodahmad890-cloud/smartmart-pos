import { create } from 'zustand';

export interface Toast { id: number; type: 'success' | 'error' | 'info' | 'warning'; message: string }

interface ToastState {
  toasts: Toast[];
  push: (type: Toast['type'], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (type, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, type, message }] });
    setTimeout(() => get().dismiss(id), type === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
  warning: (m: string) => useToastStore.getState().push('warning', m),
};
