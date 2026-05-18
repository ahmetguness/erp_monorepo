'use client';

import { usePlanFeatures, type PlanFeatures } from '@/hooks/usePlanFeatures';
import { useAuthStore } from '@/store/auth.store';
import { Lock } from 'lucide-react';
import Link from 'next/link';

type FeatureFlag = keyof Omit<PlanFeatures, 'plan' | 'isStarter' | 'isProfessional' | 'isEnterprise' | 'maxUsers' | 'maxProducts'>;

interface FeatureGateProps {
  /** Feature flag(s) — herhangi biri true ise erişim verilir */
  feature?: FeatureFlag | FeatureFlag[];
  /** Minimum plan seviyesi */
  plan?: 'PROFESSIONAL' | 'ENTERPRISE';
  children: React.ReactNode;
  /** Erişim yoksa gösterilecek fallback. Verilmezse varsayılan upgrade mesajı gösterilir. */
  fallback?: React.ReactNode;
}

const PLAN_RANK: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };

export function FeatureGate({ feature, plan, children, fallback }: FeatureGateProps) {
  const features = usePlanFeatures();
  const tenant = useAuthStore((s) => s.tenant);
  // Store henüz hydrate olmadıysa loading göster, upgrade mesajı değil
  if (tenant === null) {
    return null;
  }

  const currentPlan = features.plan ?? 'STARTER';

  // 1. Önce Feature kontrolü yap. Eğer feature belirtilmişse ve yetki varsa, plan'ı bypass et.
  if (feature) {
    const flags = Array.isArray(feature) ? feature : [feature];
    const hasAccess = flags.some((f) => Boolean(features[f]));
    if (!hasAccess) {
      return <>{fallback ?? <UpgradeMessage requiredPlan={plan ?? 'PROFESSIONAL'} />}</>;
    }
    // Feature var ve erişim varsa İZİN VER (plan kontrolünü atla)
    return <>{children}</>;
  }

  // 2. Eğer sadece plan kısıtı varsa onu kontrol et
  if (plan && (PLAN_RANK[currentPlan] ?? 0) < (PLAN_RANK[plan] ?? 0)) {
    return <>{fallback ?? <UpgradeMessage requiredPlan={plan} />}</>;
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
        Bu özellik mevcut planınızda kullanılamaz
      </h2>
      <p className="text-sm text-slate-400 text-center max-w-md mb-6">
        Bu özelliğe erişmek için en az <span className="text-amber-400 font-medium">{requiredPlan}</span> planına yükseltmeniz gerekmektedir.
      </p>
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/20 transition-all"
      >
        Planı Yükselt
      </Link>
    </div>
  );
}

