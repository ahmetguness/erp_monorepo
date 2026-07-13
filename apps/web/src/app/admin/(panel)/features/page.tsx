'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleOff, Pencil, RotateCcw, Save, Sliders } from 'lucide-react';
import {
  getPlanFeatures,
  updatePlanFeature,
  type PlanFeature,
  type PlanFeatureType,
  type UpdatePlanFeatureInput,
} from '@/services/admin.service';
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
  max_users: 'Maksimum Kullanici',
  max_products: 'Maksimum Urun',
  multi_warehouse: 'Coklu Depo',
  role_management: 'Rol Yonetimi',
  approvals: 'Onay Akislari',
  crm: 'CRM',
  sales: 'Satis',
  purchasing: 'Satin Alma',
  production: 'Uretim',
  service: 'Servis',
  marketplace: 'Pazaryeri',
  payroll: 'Bordro',
  hr: 'Insan Kaynaklari',
  api_access: 'API Erisimi',
  audit_log: 'Denetim Kaydi',
  custom_reporting: 'Ozel Raporlama',
  document_center: 'Dokuman Merkezi',
  smart_notifications: 'Akilli Bildirimler',
  workflow_center: 'Is Akisi Merkezi',
  mail_center: 'Mail Merkezi',
  bulk_operations: 'Toplu Islemler',
  cashflow_forecast: 'Nakit Akisi Tahmini',
  bank_reconciliation: 'Banka Mutabakati',
  lot_serial_tracking: 'Lot/Seri Takibi',
};

const TYPE_LABELS: Record<PlanFeatureType, string> = {
  BOOLEAN: 'Ac/Kapat',
  LIMIT: 'Limit',
  ENUM: 'Secenek',
};

const VALUE_LABELS: Record<string, string> = {
  true: 'Acik',
  false: 'Kapali',
  unlimited: 'Sinirsiz',
  basic: 'Temel',
  standard: 'Standart',
  full: 'Tam',
};

interface FeatureDraft {
  value: string;
  type: PlanFeatureType;
  isEnabled: boolean;
  description: string;
  featureKey: string;
}

function formatFeatureValue(value: string): string {
  return VALUE_LABELS[value] ?? value;
}

function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getFeatureLabel(feature: PlanFeature): string {
  return FEATURE_LABELS[feature.key] ?? (feature.featureKey ? FEATURE_LABELS[feature.featureKey.toLowerCase()] : undefined) ?? humanizeKey(feature.key);
}

function createDraft(feature: PlanFeature): FeatureDraft {
  return {
    value: feature.value,
    type: feature.type,
    isEnabled: feature.isEnabled,
    description: feature.description ?? '',
    featureKey: feature.featureKey ?? '',
  };
}

function buildUpdateInput(feature: PlanFeature, draft: FeatureDraft): UpdatePlanFeatureInput {
  return {
    plan: feature.plan,
    key: feature.key,
    value: draft.value,
    type: draft.type,
    isEnabled: draft.isEnabled,
    description: draft.description.trim() || null,
    featureKey: draft.featureKey || null,
  };
}

export default function AdminFeaturesPage() {
  const [planFilter, setPlanFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FeatureDraft | null>(null);
  const queryClient = useQueryClient();

  const { data: features = [], isLoading } = useQuery({
    queryKey: ['admin', 'features', planFilter],
    queryFn: () => getPlanFeatures(planFilter || undefined),
  });

  const updateMutation = useMutation({
    mutationFn: updatePlanFeature,
    onSuccess: async () => {
      setEditingId(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'features'] });
    },
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
          <h1 className="text-lg font-semibold text-white">Plan Ozellikleri</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">Plan bazli limit ve ozellik tanimlari.</p>
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
            {plan ? PLAN_LABELS[plan] : 'Tumu'}
          </button>
        ))}
      </div>

      {updateMutation.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Plan ozelligi guncellenemedi.
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-600">Yukleniyor...</div>
      ) : (
        Object.entries(grouped).map(([plan, items]) => (
          <div key={plan} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-800/60 px-5 py-3">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PLAN_COLORS[plan])}>
                {PLAN_LABELS[plan] ?? plan}
              </span>
              <span className="text-[10px] text-slate-600">{items.length} ozellik</span>
            </div>
            <div className="divide-y divide-slate-800/40">
              {items.map((feature) => {
                const isBoolean = feature.type === 'BOOLEAN';
                const isOn = feature.value === 'true';
                const activeDraft = editingId === feature.id ? draft : null;

                return (
                  <div key={feature.id} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_120px_90px_96px] sm:items-center">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-200">{getFeatureLabel(feature)}</span>
                      {feature.description && !activeDraft && (
                        <span className="mt-1 block truncate text-xs text-slate-600">{feature.description}</span>
                      )}
                    </div>

                    {activeDraft ? (
                      <>
                        {activeDraft.type === 'BOOLEAN' ? (
                          <select
                            value={activeDraft.value}
                            onChange={(event) => setDraft({ ...activeDraft, value: event.target.value })}
                            className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-white"
                          >
                            <option value="true">Acik</option>
                            <option value="false">Kapali</option>
                          </select>
                        ) : (
                          <input
                            value={activeDraft.value}
                            onChange={(event) => setDraft({ ...activeDraft, value: event.target.value })}
                            className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-white"
                          />
                        )}
                        <select
                          value={activeDraft.type}
                          onChange={(event) => setDraft({ ...activeDraft, type: event.target.value as PlanFeatureType })}
                          className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
                        >
                          <option value="BOOLEAN">Ac/Kapat</option>
                          <option value="LIMIT">Limit</option>
                          <option value="ENUM">Secenek</option>
                        </select>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDraft({ ...activeDraft, isEnabled: !activeDraft.isEnabled })}
                            className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md border', activeDraft.isEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-500')}
                            title={activeDraft.isEnabled ? 'Etkin' : 'Devre disi'}
                          >
                            {activeDraft.isEnabled ? <CheckCircle2 className="h-4 w-4" /> : <CircleOff className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate(buildUpdateInput(feature, activeDraft))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 disabled:opacity-50"
                            title="Kaydet"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setDraft(null); }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-400"
                            title="Vazgec"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={cn('text-sm font-medium', isBoolean ? (isOn ? 'text-emerald-300' : 'text-slate-400') : 'text-white')}>
                          {formatFeatureValue(feature.value)}
                        </span>
                        <span className="text-xs text-slate-500">{TYPE_LABELS[feature.type]}</span>
                        <span className="flex items-center justify-end gap-2">
                          {feature.isEnabled ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-label="Etkin" />
                          ) : (
                            <CircleOff className="h-4 w-4 text-slate-600" aria-label="Devre disi" />
                          )}
                          <button
                            type="button"
                            onClick={() => { setEditingId(feature.id); setDraft(createDraft(feature)); }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                            title="Duzenle"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </span>
                      </>
                    )}
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
