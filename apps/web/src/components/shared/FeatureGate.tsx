'use client';

import { usePlanFeatures, type FeatureFlag } from '@/hooks/usePlanFeatures';
import { useAuthStore } from '@/store/auth.store';
import { type PlanName } from '@/lib/plans';
import { getAccessLockReasons, type AccessLockReason } from '@/lib/access-lock';
import { Lock } from 'lucide-react';
import Link from 'next/link';

interface FeatureGateProps {
  feature?: FeatureFlag | FeatureFlag[];
  plan?: PlanName;
  module?: string;
  limitReached?: boolean;
  limitLabel?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, plan, module, limitReached, limitLabel, children, fallback }: FeatureGateProps) {
  const features = usePlanFeatures();
  const tenant = useAuthStore((s) => s.tenant);

  if (tenant === null) {
    return null;
  }

  const currentPlan = features.plan ?? 'STARTER';
  const flags = feature ? (Array.isArray(feature) ? feature : [feature]) : [];
  const featureAllowed = flags.length > 0 ? flags.some((flag) => Boolean(features[flag])) : undefined;
  const resolvedFeatureAllowsAccess = features.hasResolvedFeatures && featureAllowed === true;
  const reasons = getAccessLockReasons({
    currentPlan,
    requiredPlan: resolvedFeatureAllowsAccess ? undefined : plan,
    requiredModule: resolvedFeatureAllowsAccess ? undefined : module,
    tenantModules: tenant.modules,
    featureAllowed,
    featureLabel: flags.join(', '),
    limitReached,
    limitLabel,
  });

  if (reasons.length > 0) {
    return <>{fallback ?? <UpgradeMessage requiredPlan={plan ?? 'PROFESSIONAL'} reasons={reasons} />}</>;
  }

  return <>{children}</>;
}

function UpgradeMessage({ requiredPlan, reasons }: { requiredPlan: string; reasons: readonly AccessLockReason[] }) {
  const featureLabel = reasons.find((reason) => reason.code === 'feature')?.description ?? reasons[0]?.label ?? 'Kilitli ozellik';

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5">
        <Lock className="w-6 h-6 text-amber-400" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        Bu ozellik mevcut planinizda kullanilamaz
      </h2>
      <p className="text-sm text-slate-400 text-center max-w-md mb-6">
        Bu ozellige erisim su an kilitli. Gereken plan: <span className="text-amber-400 font-medium">{requiredPlan}</span>.
      </p>
      <div className="mb-6 w-full max-w-md space-y-2">
        {reasons.map((reason) => (
          <div key={reason.code} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-left">
            <p className="text-xs font-semibold text-amber-300">{reason.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{reason.description}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/dashboard/upgrade-preview?feature=${encodeURIComponent(featureLabel)}&plan=${requiredPlan}&reason=${encodeURIComponent(reasons.map((reason) => reason.code).join(','))}`}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/20 transition-all"
      >
        Planı Yükselt
      </Link>
    </div>
  );
}
