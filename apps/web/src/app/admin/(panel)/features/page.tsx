'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleOff, Sliders } from 'lucide-react';
import { getPlanFeatures, type PlanFeature } from '@/services/admin.service';
import { cn } from '@/lib/utils';

const PLAN_COLORS: Record<string, string> = {
  STARTER: 'text-sky-400 bg-sky-500/10',
  PROFESSIONAL: 'text-violet-400 bg-violet-500/10',
  ENTERPRISE: 'text-amber-400 bg-amber-500/10',
};

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

const FEATURE_LABELS: Record<string, string> = {
  max_users: 'Maksimum Kullanıcı',
  max_products: 'Maksimum Ürün',
  multi_warehouse: 'Çoklu Depo',
  role_management: 'Rol Yönetimi',
  approvals: 'Onay Akışları',
  crm: 'CRM',
  sales: 'Satış',
  purchasing: 'Satın Alma',
  production: 'Üretim',
  service: 'Servis',
  marketplace: 'Pazaryeri',
  payroll: 'Bordro',
  hr: 'İnsan Kaynakları',
  api_access: 'API Erişimi',
  audit_log: 'Denetim Kaydı',
  custom_reporting: 'Özel Raporlama',
};

const TYPE_LABELS: Record<string, string> = {
  BOOLEAN: 'Aç/Kapat',
  LIMIT: 'Limit',
  ENUM: 'Seçenek',
};

const VALUE_LABELS: Record<string, string> = {
  true: 'Açık',
  false: 'Kapalı',
  unlimited: 'Sınırsız',
  basic: 'Temel',
  standard: 'Standart',
  full: 'Tam',
};

function formatFeatureValue(value: string): string {
  return VALUE_LABELS[value] ?? value;
}

function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ');
}

function getFeatureLabel(feature: PlanFeature): string {
  return FEATURE_LABELS[feature.key] ?? (feature.featureKey ? FEATURE_LABELS[feature.featureKey.toLowerCase()] : undefined) ?? humanizeKey(feature.key);
}

export default function AdminFeaturesPage() {
  const [planFilter, setPlanFilter] = useState('');
  const { data: features = [], isLoading } = useQuery({
    queryKey: ['admin', 'features', planFilter],
    queryFn: () => getPlanFeatures(planFilter || undefined),
  });

  const grouped = features.reduce<Record<string, PlanFeature[]>>((acc, feature) => {
    (acc[feature.plan] ??= []).push(feature);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-slate-500" />
          <h1 className="text-lg font-semibold text-white">Plan Özellikleri</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">Plan bazlı limit ve özellik tanımları.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map((plan) => (
          <button
            key={plan}
            type="button"
            onClick={() => setPlanFilter(plan)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
              planFilter === plan
                ? 'border-red-500/30 bg-red-500/15 text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-300',
            )}
          >
            {plan ? PLAN_LABELS[plan] : 'Tümü'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-600">Yükleniyor...</div>
      ) : (
        Object.entries(grouped).map(([plan, items]) => (
          <div key={plan} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-800/60 px-5 py-3">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PLAN_COLORS[plan])}>
                {PLAN_LABELS[plan] ?? plan}
              </span>
              <span className="text-[10px] text-slate-600">{items.length} özellik</span>
            </div>
            <div className="divide-y divide-slate-800/40">
              {items.map((feature) => {
                const isBoolean = feature.type === 'BOOLEAN';
                const isOn = feature.value === 'true';

                return (
                  <div key={feature.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_120px_90px_24px] sm:items-center">
                    <span className="text-sm font-medium text-slate-200">
                      {getFeatureLabel(feature)}
                    </span>
                    <span className={cn('text-sm font-medium', isBoolean ? (isOn ? 'text-emerald-300' : 'text-slate-400') : 'text-white')}>
                      {formatFeatureValue(feature.value)}
                    </span>
                    <span className="text-xs text-slate-500">{TYPE_LABELS[feature.type] ?? feature.type}</span>
                    <span className="flex sm:justify-end">
                      {feature.isEnabled ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-label="Etkin" />
                      ) : (
                        <CircleOff className="h-4 w-4 text-slate-600" aria-label="Devre dışı" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
