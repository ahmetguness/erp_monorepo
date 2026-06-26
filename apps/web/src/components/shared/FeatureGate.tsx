'use client';

import { usePlanFeatures, type FeatureFlag } from '@/hooks/usePlanFeatures';
import { useAuthStore } from '@/store/auth.store';
import { PLAN_RANK, type PlanName } from '@/lib/plans';
import { Lock } from 'lucide-react';
import Link from 'next/link';

interface FeatureGateProps {
  feature?: FeatureFlag | FeatureFlag[];
  plan?: Extract<PlanName, 'PROFESSIONAL' | 'ENTERPRISE'>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, plan, children, fallback }: FeatureGateProps) {
  const features = usePlanFeatures();
  const tenant = useAuthStore((s) => s.tenant);

  if (tenant === null) {
    return null;
  }

  const currentPlan = features.plan ?? 'STARTER';

  if (plan && (PLAN_RANK[currentPlan] ?? 0) < (PLAN_RANK[plan] ?? 0)) {
    return <>{fallback ?? <UpgradeMessage requiredPlan={plan} />}</>;
  }

  if (feature) {
    const flags = Array.isArray(feature) ? feature : [feature];
    const hasAccess = flags.some((f) => Boolean(features[f]));
    if (!hasAccess) {
      return <>{fallback ?? <UpgradeMessage requiredPlan={plan ?? 'PROFESSIONAL'} />}</>;
    }
  }

  return <>{children}</>;
}

function UpgradeMessage({ requiredPlan }: { requiredPlan: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5">
        <Lock className="w-6 h-6 text-amber-400" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        Bu ozellik mevcut planinizda kullanilamaz
      </h2>
      <p className="text-sm text-slate-400 text-center max-w-md mb-6">
        Bu ozellige erismek icin en az <span className="text-amber-400 font-medium">{requiredPlan}</span> planina yukseltmeniz gerekmektedir.
      </p>
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/20 transition-all"
      >
        Plani Yukselt
      </Link>
    </div>
  );
}
