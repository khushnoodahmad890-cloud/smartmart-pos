import { create } from 'zustand';
import { api } from '../api/client';

export interface Plan {
  name: string;
  rank: number;
  price_monthly: number;
  price_yearly: number;
  tagline: string;
  features: string[];
  limits: { max_users: number | null; max_products: number | null; max_branches: number | null };
}

interface SubscriptionState {
  loaded: boolean;
  subscription: any;
  plans: Record<string, Plan>;
  usage: { users: number; products: number; branches: number };
  features: string[];
  load: () => Promise<void>;
  hasFeature: (f: string) => boolean;
  requiredPlan: (f: string) => string;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  loaded: false,
  subscription: null,
  plans: {},
  usage: { users: 0, products: 0, branches: 0 },
  features: [],
  load: async () => {
    try {
      const { data } = await api.get('/billing');
      set({
        loaded: true,
        subscription: data.data.subscription,
        plans: data.data.plans,
        usage: data.data.usage,
        features: data.data.features,
      });
    } catch { /* keep previous state */ }
  },
  hasFeature: (f) => {
    const s = get();
    if (!s.loaded) return true; // avoid flashing locks before the first load
    return s.features.includes(f);
  },
  requiredPlan: (f) => {
    const plans = get().plans;
    for (const key of ['basic', 'standard', 'pro']) {
      if (plans[key]?.features.includes(f)) return key;
    }
    return 'pro';
  },
}));
