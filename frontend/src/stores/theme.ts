import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState { dark: boolean; toggle: () => void }

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set((s) => {
        const dark = !s.dark;
        document.documentElement.classList.toggle('dark', dark);
        return { dark };
      }),
    }),
    {
      name: 'pos-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.dark) document.documentElement.classList.add('dark');
      },
    }
  )
);
