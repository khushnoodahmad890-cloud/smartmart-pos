import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Loader2 } from 'lucide-react';
import { api, errMsg } from '../api/client';
import { useAuthStore } from '../stores/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset' | 'signup'>('login');
  // Multi-tenant: store code + SaaS detection (server tells us via /health)
  const [multiTenant, setMultiTenant] = useState(false);
  const [tenant, setTenant] = useState(localStorage.getItem('pos-tenant') || '');
  const [signup, setSignup] = useState({ code: '', name: '', owner_name: '', email: '', password: '' });

  React.useEffect(() => {
    api.get('/health').then(({ data }) => setMultiTenant(Boolean(data.multiTenant))).catch(() => {});
  }, []);

  const doSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      const { data } = await api.post('/tenants/signup', signup);
      localStorage.setItem('pos-tenant', data.data.code);
      setTenant(data.data.code);
      setUsername(signup.email);
      setInfo(data.data.message);
      setMode('login');
    } catch (err) { setError(errMsg(err)); }
    setLoading(false);
  };
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPw, setNewPw] = useState('');
  const [info, setInfo] = useState('');

  const forgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setInfo(data.data.message + (data.data.dev_reset_token ? ` (Demo token: ${data.data.dev_reset_token})` : ''));
      setMode('reset');
    } catch (err) { setError(errMsg(err)); }
    setLoading(false);
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token: resetToken.trim(), newPassword: newPw });
      setInfo(data.data.message);
      setMode('login');
    } catch (err) { setError(errMsg(err)); }
    setLoading(false);
  };
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (multiTenant) {
        if (!tenant.trim()) { setError('Enter your store code'); setLoading(false); return; }
        localStorage.setItem('pos-tenant', tenant.trim().toLowerCase());
      }
      const { data } = await api.post('/auth/login', { username, password });
      setAuth(data.data.token, data.data.refreshToken, data.data.user);
      navigate(data.data.user.role_name === 'cashier' ? '/pos' : '/');
    } catch (err) {
      setError(errMsg(err));
    }
    setLoading(false);
  };

  const quick = (u: string, p: string) => { setUsername(u); setPassword(p); };

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-600 rounded-2xl mb-3 shadow-lg shadow-indigo-600/30">
            <Store size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SmartMart POS</h1>
          <p className="text-slate-400 text-sm mt-1">Point of Sale · Billing · Inventory</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-7">
          <h2 className="font-semibold text-lg mb-4 text-slate-900 dark:text-white">
            {mode === 'login' ? 'Sign in to your account' : mode === 'forgot' ? 'Forgot password' : 'Reset password'}
          </h2>
          {error && <div className="mb-4 px-4 py-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 text-sm rounded-lg">{error}</div>}
          {info && <div className="mb-4 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-sm rounded-lg break-all">{info}</div>}

          {mode === 'forgot' && (
            <form onSubmit={forgot} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Account email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-60">
                {loading && <Loader2 size={16} className="animate-spin" />} Send reset instructions
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); setInfo(''); }} className="w-full text-sm text-slate-400 hover:text-indigo-500">Back to sign in</button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={reset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Reset token (from email)</label>
                <input value={resetToken} onChange={(e) => setResetToken(e.target.value)} required autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">New password (min 6)</label>
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-60">
                {loading && <Loader2 size={16} className="animate-spin" />} Reset password
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); setInfo(''); }} className="w-full text-sm text-slate-400 hover:text-indigo-500">Back to sign in</button>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={doSignup} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Store name</label>
                <input value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value, code: signup.code || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) })} required autoFocus placeholder="e.g. Al-Noor Mart"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Store code (your sign-in address)</label>
                <input value={signup.code} onChange={(e) => setSignup({ ...signup, code: e.target.value.toLowerCase() })} required placeholder="alnoor-mart"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Your name</label>
                  <input value={signup.owner_name} onChange={(e) => setSignup({ ...signup, owner_name: e.target.value })} required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                  <input type="email" value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Password (min 6)</label>
                <input type="password" value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} required minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-60">
                {loading && <Loader2 size={16} className="animate-spin" />} Create my store — free 14-day Pro trial
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-sm text-slate-400 hover:text-indigo-500">Already have a store? Sign in</button>
            </form>
          )}

          {mode === 'login' && (
          <form onSubmit={submit} className="space-y-4">
            {multiTenant && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Store code</label>
                <input value={tenant} onChange={(e) => setTenant(e.target.value.toLowerCase())} required placeholder="e.g. alnoor-mart"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Username or email</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60">
              {loading && <Loader2 size={16} className="animate-spin" />} Sign in
            </button>
            <button type="button" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
              className="w-full text-sm text-slate-400 hover:text-indigo-500">Forgot password?</button>
            {multiTenant && (
              <button type="button" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
                className="w-full text-sm font-medium text-indigo-500 hover:text-indigo-600">New here? Create your store →</button>
            )}
          </form>
          )}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400 mb-2.5 text-center">Demo accounts — click to fill</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => quick('admin', 'admin123')} className="px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                <span className="font-semibold block">Admin</span>admin123
              </button>
              <button onClick={() => quick('manager', 'manager123')} className="px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                <span className="font-semibold block">Manager</span>manager123
              </button>
              <button onClick={() => quick('cashier', 'cashier123')} className="px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                <span className="font-semibold block">Cashier</span>cashier123
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
