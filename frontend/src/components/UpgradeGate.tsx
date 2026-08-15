import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Crown, Zap } from 'lucide-react';
import { useSubscriptionStore } from '../stores/subscription';
import { useAuthStore } from '../stores/auth';
import { Button } from './ui';

/**
 * Wrap a page in a subscription feature gate.
 * If the current plan lacks the feature, shows a friendly upgrade screen instead of the page.
 * (The backend enforces the same gate with HTTP 402 — this is purely UX.)
 */
export default function UpgradeGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { loaded, hasFeature, requiredPlan, plans } = useSubscriptionStore();
  const canBilling = useAuthStore((s) => s.can('manage_billing', 'manage_settings'));
  const navigate = useNavigate();

  if (!loaded || hasFeature(feature)) return <>{children}</>;

  const planKey = requiredPlan(feature);
  const plan = plans[planKey];

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-500 mb-4">
        {planKey === 'pro' ? <Crown size={32} /> : <Zap size={32} />}
      </div>
      <h2 className="text-lg font-bold flex items-center gap-2"><Lock size={16} /> This feature needs the {plan?.name} plan</h2>
      <p className="text-sm text-slate-400 mt-2 max-w-md">
        Your current plan doesn't include this section. Upgrade to <b>{plan?.name}</b> to unlock it instantly — your existing data is already here waiting.
      </p>
      {canBilling ? (
        <Button className="mt-5" onClick={() => navigate('/billing')}>
          View plans & upgrade
        </Button>
      ) : (
        <p className="text-xs text-slate-400 mt-5">Ask your administrator to upgrade the subscription.</p>
      )}
    </div>
  );
}
