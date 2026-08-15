import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { useConnectionStore } from '../stores/connection';

const baseURL = (import.meta.env.VITE_API_URL || '') + '/api';

export const api = axios.create({ baseURL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Multi-tenant SaaS mode: attach the selected store code
  const tenant = localStorage.getItem('pos-tenant');
  if (tenant) config.headers['X-Tenant'] = tenant;
  return config;
});

let refreshing: Promise<boolean> | null = null;

/** Try to exchange the refresh token for a new access token. */
async function tryRefresh(): Promise<boolean> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) return false;
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    setTokens(data.data.token, data.data.refreshToken);
    return true;
  } catch {
    logout();
    return false;
  }
}

api.interceptors.response.use(
  (res) => {
    useConnectionStore.getState().setOnline(true);
    return res;
  },
  async (error) => {
    if (!error.response) {
      useConnectionStore.getState().setOnline(false);
      error.friendlyMessage = 'Cannot reach the server. Check your connection — your cart is saved locally.';
      return Promise.reject(error);
    }
    useConnectionStore.getState().setOnline(true);

    const original = error.config;
    // Auto-refresh expired access tokens once per request
    if (error.response.status === 401 && useAuthStore.getState().token && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true;
      refreshing = refreshing || tryRefresh();
      const okRefresh = await refreshing;
      refreshing = null;
      if (okRefresh) {
        original.headers.Authorization = `Bearer ${useAuthStore.getState().token}`;
        return api(original);
      }
    }
    if (error.response.status === 402) {
      error.friendlyMessage = error.response.data?.error || 'This feature requires a higher subscription plan.';
      error.upgradeRequired = true;
    } else {
      error.friendlyMessage = error.response.data?.error || 'Something went wrong. Please try again.';
    }
    return Promise.reject(error);
  }
);

export function errMsg(e: any): string {
  return e?.friendlyMessage || e?.response?.data?.error || e?.message || 'Something went wrong';
}
