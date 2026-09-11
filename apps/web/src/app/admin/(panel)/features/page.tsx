'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sliders,
  Search,
  X,
  Pencil,
  CheckCircle2,
  CircleOff,
  Sparkles,
  Layers,
  Save,
  RefreshCw,
  SlidersHorizontal,
  FilterX,
  Infinity as InfinityIcon,
  ToggleLeft,
  ToggleRight,
  Gauge,
  ListFilter,
} from 'lucide-react';
import {
  getPlanFeatures,
  updatePlanFeature,
  isPendingAdminChange,
  type PlanFeature,
  type PlanFeatureType,
  type UpdatePlanFeatureInput,
} from '@/services/admin.service';
import { PLAN_FEATURE_DEFINITIONS, PLAN_LABELS } from '@/lib/plans';
import type { PlanName } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ChangePreviewDialog } from '@/components/features/admin/ChangePreviewDialog';
import { FeatureRolloutPanel } from '@/components/features/admin/feature-rollout/FeatureRolloutPanel';

const PLANS: readonly PlanName[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const PLAN_COLORS: Record<PlanName, { badge: string; border: string; bg: string }> = {
  STARTER: {
    badge: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    border: 'border-sky-500/20',
    bg: 'from-sky-500/5 to-transparent',
  },
  PROFESSIONAL: {
    badge: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    border: 'border-violet-500/20',
    bg: 'from-violet-500/5 to-transparent',
  },
  ENTERPRISE: {
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    border: 'border-amber-500/20',
    bg: 'from-amber-500/5 to-transparent',
  },
};

const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_FEATURE_DEFINITIONS.flatMap((definition) => [
    [definition.key, definition.label],
    [definition.featureKey.toLowerCase(), definition.label],
  ]),
);

const TYPE_LABELS: Record<PlanFeatureType, { label: string; icon: typeof ToggleLeft }> = {
  BOOLEAN: { label: 'Aç / Kapat', icon: ToggleRight },
  LIMIT: { label: 'Limit / Kota', icon: Gauge },
  ENUM: { label: 'Seçenek / Paket', icon: ListFilter },
};

const VALUE_LABELS: Record<string, string> = {
  true: 'Açık (Yetkili)',
  false: 'Kapalı (Kısıtlı)',
  unlimited: 'Sınırsız',
  basic: 'Temel Seviye',
  standard: 'Standart',
  full: 'Tam Erişim',
};

interface FeatureDraft {
  value: string;
  type: PlanFeatureType;
  isEnabled: boolean;
  description: string;
  featureKey: string;
}

function isPlanName(value: string): value is PlanName {
  return PLANS.some((plan) => plan === value);
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
  return (
    FEATURE_LABELS[feature.key] ??
    (feature.featureKey ? FEATURE_LABELS[feature.featureKey.toLowerCase()] : undefined) ??
    humanizeKey(feature.key)
  );
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

type FeatureChangeDraft = Omit<UpdatePlanFeatureInput, 'reason' | 'ticketId'>;

function buildUpdateInput(feature: PlanFeature, draft: FeatureDraft): FeatureChangeDraft {
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
  const canUpdateFeature = useAdminAuthStore((state) => canAdmin(state.admin, 'feature.update'));
  const queryClient = useQueryClient();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'matrix' | 'rollout'>('matrix');

  // Matrix Filter State
  const [planFilter, setPlanFilter] = useState<PlanName | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<PlanFeatureType | 'ALL'>('ALL');

  // Edit Modal State
  const [editingFeature, setEditingFeature] = useState<PlanFeature | null>(null);
  const [draft, setDraft] = useState<FeatureDraft | null>(null);
  const [pendingChange, setPendingChange] = useState<FeatureChangeDraft | null>(null);

  const { data: features = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'features', planFilter],
    queryFn: () => getPlanFeatures(planFilter === 'ALL' ? undefined : planFilter),
  });

  const updateMutation = useMutation({
    mutationFn: updatePlanFeature,
    onSuccess: async (result) => {
      setPendingChange(null);
      setEditingFeature(null);
      setDraft(null);
      if (isPendingAdminChange(result)) {
        toast.success('Plan özelliği değişikliği ikinci adminin onayına sunuldu.');
        return;
      }
      toast.success('Plan özelliği başarıyla güncellendi.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'features'] });
    },
    onError: () => {
      toast.error('Plan özelliği güncellenirken bir sorun oluştu.');
    },
  });

  // Filtered features
  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !search ||
        getFeatureLabel(feature).toLowerCase().includes(search) ||
        feature.key.toLowerCase().includes(search) ||
        (feature.description && feature.description.toLowerCase().includes(search));

      const matchesType = typeFilter === 'ALL' || feature.type === typeFilter;
      const matchesPlan = planFilter === 'ALL' || feature.plan === planFilter;

      return matchesSearch && matchesType && matchesPlan;
    });
  }, [features, searchTerm, typeFilter, planFilter]);

  // Grouped by Plan
  const groupedFeatures = useMemo(() => {
    return filteredFeatures.reduce<Record<string, PlanFeature[]>>((acc, feature) => {
      (acc[feature.plan] ??= []).push(feature);
      return acc;
    }, {});
  }, [filteredFeatures]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = features.length;
    const active = features.filter((f) => f.isEnabled).length;
    const limits = features.filter((f) => f.type === 'LIMIT').length;
    const booleans = features.filter((f) => f.type === 'BOOLEAN').length;
    const enums = features.filter((f) => f.type === 'ENUM').length;

    return { total, active, limits, booleans, enums };
  }, [features]);

  const hasActiveFilters = Boolean(searchTerm) || typeFilter !== 'ALL' || planFilter !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('ALL');
    setPlanFilter('ALL');
  };

  const handleStartEdit = (feature: PlanFeature) => {
    setEditingFeature(feature);
    setDraft(createDraft(feature));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 text-amber-400 ring-1 ring-amber-500/30">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Özellikler & Feature Flags
            </h1>
            <p className="text-xs text-slate-400">
              Abonelik plan limitlerini, özellik matrislerini ve kademeli (rollout) dağıtımları yönetin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={() => refetch()}
            loading={isFetching}
            leftIcon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* Primary Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            activeTab === 'matrix'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200',
          )}
        >
          <Layers className="h-4 w-4" />
          <span>Plan Özellikleri Matrisi</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
            {features.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rollout')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            activeTab === 'rollout'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200',
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span>Kademeli Dağıtım (Rollouts)</span>
        </button>
      </div>

      {/* Tab 1: Plan Features Matrix */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Metric 1 */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Toplam Özellik</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{metrics.total}</span>
                <span className="text-xs text-slate-400">Tanımlı Kural</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                3 farklı plan genelinde paylaşılan matris
              </div>
            </div>

            {/* Metric 2 */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Etkin Özellikler</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{metrics.active}</span>
                <span className="text-xs text-slate-400">/ {metrics.total} Aktif</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Tenantlar için kullanılabilir</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Limit & Kota Kuralları</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <Gauge className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{metrics.limits}</span>
                <span className="text-xs text-slate-400">Sayısal Kural</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Kullanıcı, depolama ve fatura limitleri
              </div>
            </div>

            {/* Metric 4 */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Aç / Kapat & Seçenekler</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                  <ToggleRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{metrics.booleans + metrics.enums}</span>
                <span className="text-xs text-slate-400">Modül Kuralı</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {metrics.booleans} Toggle · {metrics.enums} Paket Seçeneği
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {/* Search */}
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="Özellik adı, anahtar veya açıklama ile ara…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-amber-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Type Filter & Reset */}
              <div className="flex items-center gap-2">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as PlanFeatureType | 'ALL')}
                  className="h-9 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs text-slate-200 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="ALL">Tüm Kural Türleri</option>
                  <option value="BOOLEAN">Aç / Kapat (Toggle)</option>
                  <option value="LIMIT">Limit / Kota</option>
                  <option value="ENUM">Seçenek / Paket</option>
                </select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    leftIcon={<FilterX className="h-3.5 w-3.5" />}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Temizle
                  </Button>
                )}
              </div>
            </div>

            {/* Plan Filter Tabs */}
            <div className="flex items-center gap-1.5 border-t border-slate-800/80 pt-3">
              <span className="text-xs font-medium text-slate-400 mr-1.5">Plan:</span>
              {(['ALL', ...PLANS] as const).map((plan) => {
                const isSelected = planFilter === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setPlanFilter(plan)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 font-semibold'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                    )}
                  >
                    {plan === 'ALL' ? 'Tüm Planlar' : PLAN_LABELS[plan]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-3"
                >
                  <div className="h-6 w-32 rounded bg-slate-800" />
                  <div className="h-10 w-full rounded-lg bg-slate-800/50" />
                  <div className="h-10 w-full rounded-lg bg-slate-800/50" />
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredFeatures.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400">
                <Sliders className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-200">
                Filtrelere uygun plan özelliği bulunamadı
              </h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Arama kriterlerinizi veya plan filtresini değiştirerek tekrar deneyebilirsiniz.
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="mt-4 text-xs"
                  leftIcon={<FilterX className="h-3.5 w-3.5" />}
                >
                  Filtreleri Sıfırla
                </Button>
              )}
            </div>
          )}

          {/* Features Matrix Grouped by Plan */}
          {!isLoading &&
            Object.entries(groupedFeatures).map(([plan, items]) => {
              const planName = isPlanName(plan) ? plan : null;
              const planStyle = planName
                ? PLAN_COLORS[planName]
                : { badge: 'bg-slate-800 text-slate-400', border: 'border-slate-800', bg: '' };

              return (
                <div
                  key={plan}
                  className={cn(
                    'overflow-hidden rounded-2xl border bg-slate-900/50 shadow-sm backdrop-blur',
                    planStyle.border,
                  )}
                >
                  {/* Plan Card Header */}
                  <div className={cn('flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5 bg-gradient-to-r', planStyle.bg)}>
                    <div className="flex items-center gap-2.5">
                      <span className={cn('rounded-lg border px-2.5 py-1 text-xs font-bold', planStyle.badge)}>
                        {planName ? PLAN_LABELS[planName] : plan}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({items.length} tanımlı kural)
                      </span>
                    </div>
                  </div>

                  {/* Feature Rows */}
                  <div className="divide-y divide-slate-800/50">
                    {items.map((feature) => {
                      const isBoolean = feature.type === 'BOOLEAN';
                      const isOn = feature.value === 'true';
                      const TypeIcon = TYPE_LABELS[feature.type]?.icon ?? SlidersHorizontal;

                      return (
                        <div
                          key={feature.id}
                          className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"
                        >
                          {/* Left: Feature Info */}
                          <div className="space-y-1 min-w-0 max-w-xl">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-100 text-sm">
                                {getFeatureLabel(feature)}
                              </span>
                              <span className="rounded font-mono text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 border border-slate-800">
                                {feature.key}
                              </span>
                            </div>
                            {feature.description && (
                              <p className="text-xs text-slate-400 line-clamp-1">
                                {feature.description}
                              </p>
                            )}
                          </div>

                          {/* Middle: Type & Value Badges */}
                          <div className="flex items-center gap-4 shrink-0">
                            {/* Type */}
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <TypeIcon className="h-3.5 w-3.5 text-slate-500" />
                              <span className="hidden sm:inline">{TYPE_LABELS[feature.type]?.label}</span>
                            </div>

                            {/* Value */}
                            <div className="min-w-[100px] text-right">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border',
                                  isBoolean
                                    ? isOn
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                      : 'border-slate-700 bg-slate-800/80 text-slate-400'
                                    : 'border-slate-700 bg-slate-800/80 text-slate-200',
                                )}
                              >
                                {feature.value === 'unlimited' && (
                                  <InfinityIcon className="h-3.5 w-3.5 text-amber-400 mr-0.5" />
                                )}
                                {formatFeatureValue(feature.value)}
                              </span>
                            </div>

                            {/* Status */}
                            <div className="shrink-0">
                              {feature.isEnabled ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                  Etkin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                  Devre Dışı
                                </span>
                              )}
                            </div>

                            {/* Edit Action Button */}
                            {canUpdateFeature && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartEdit(feature)}
                                className="text-slate-400 hover:text-white"
                                leftIcon={<Pencil className="h-3.5 w-3.5" />}
                              >
                                Düzenle
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Tab 2: Feature Rollouts Panel */}
      {activeTab === 'rollout' && <FeatureRolloutPanel />}

      {/* Edit Feature Modal */}
      {editingFeature && draft && (
        <Modal
          isOpen={true}
          onClose={() => {
            setEditingFeature(null);
            setDraft(null);
          }}
          title="Plan Özelliğini Düzenle"
          description={`${editingFeature.plan} planı için "${getFeatureLabel(editingFeature)}" kuralını güncelleyin.`}
          size="md"
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingFeature(null);
                  setDraft(null);
                }}
                disabled={updateMutation.isPending}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={updateMutation.isPending}
                onClick={() => {
                  setPendingChange(buildUpdateInput(editingFeature, draft));
                }}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Değişiklik Önizleme & Kaydet
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Feature Identity Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{getFeatureLabel(editingFeature)}</span>
                <span className="font-mono text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {editingFeature.plan}
                </span>
              </div>
              <p className="mt-1 text-slate-400 text-[11px] font-mono">{editingFeature.key}</p>
            </div>

            {/* Value Input */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Değer <span className="text-rose-400">*</span>
              </label>

              {draft.type === 'BOOLEAN' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, value: 'true' })}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all',
                      draft.value === 'true'
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700',
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Açık (Yetkili)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, value: 'false' })}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all',
                      draft.value === 'false'
                        ? 'border-rose-500/50 bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700',
                    )}
                  >
                    <CircleOff className="h-4 w-4 text-rose-400" />
                    <span>Kapalı (Kısıtlı)</span>
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  placeholder="Örn: 10, unlimited, full..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              )}
            </div>

            {/* Type Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Kural Türü
              </label>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as PlanFeatureType })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="BOOLEAN">Aç / Kapat (Boolean)</option>
                <option value="LIMIT">Limit / Sayısal Kota</option>
                <option value="ENUM">Seçenek / Paket Türü</option>
              </select>
            </div>

            {/* Status Switch */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-200">
                  Özellik Durumu: {draft.isEnabled ? 'Etkin' : 'Devre Dışı'}
                </label>
                <p className="text-[11px] text-slate-400">
                  Devre dışı bırakıldığında bu kural tenantlar için uygulanmaz.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={draft.isEnabled}
                onClick={() => setDraft({ ...draft, isEnabled: !draft.isEnabled })}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  draft.isEnabled ? 'bg-emerald-500' : 'bg-slate-700',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                    draft.isEnabled ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Açıklama (Opsiyonel)
              </label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Özelliğin amacını ve limit detayını açıklayın..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Two-Person Approval Change Preview Dialog */}
      <ChangePreviewDialog
        input={pendingChange ? { type: 'PLAN_FEATURE_UPDATE', payload: pendingChange } : null}
        isSubmitting={updateMutation.isPending}
        onClose={() => setPendingChange(null)}
        onConfirm={(metadata) => {
          if (pendingChange) updateMutation.mutate({ ...pendingChange, ...metadata });
        }}
      />
    </div>
  );
}
