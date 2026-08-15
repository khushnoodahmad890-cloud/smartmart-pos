import { create } from 'zustand';
import { api } from '../api/client';
import type { Settings } from '../types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  set: (s: Settings) => void;
  currency: () => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loaded: false,
  load: async () => {
    try {
      const { data } = await api.get('/settings');
      set({ settings: data.data, loaded: true });
    } catch { /* keep defaults */ }
  },
  set: (settings) => set({ settings }),
  currency: () => get().settings.currency_symbol || '$',
}));
