'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFeatureRolloutInput,
  FeatureEnvironment,
  FeatureKeyName,
  FeatureRollout,
  FeatureRolloutStage,
  PlanName,
} from '@repo/types';
import { PLAN_FEATURE_DEFINITIONS, PLAN_LABELS } from '@/lib/plans';
import { canAdmin } from '@/lib/admin/permissions';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import {
  activateFeatureRollout,
  createFeatureRollout,
  getFeatureRollouts,
  reportFeatureRolloutMetric,
  stopFeatureRollout,
} from '@/services/feature-rollout.service';
import { toast } from '@/store/ui.store';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Sparkles,
  Layers,
  Play,
  Pause,
  AlertOctagon,
  ShieldAlert,
  Send,
  Plus,
  RefreshCw,
  Clock,
  Building2,
  GitBranch,
  AlertTriangle,
  Sliders,
  CheckCircle2,
  XCircle,
  Activity,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const initialForm = (): CreateFeatureRolloutInput => ({
  plan: 'STARTER',
  featureKey: PLAN_FEATURE_DEFINITIONS[0]?.featureKey ?? 'MAX_USERS',
  environment: 'PRODUCTION',
  stage: 'PILOT',
  value: 'true',
  isEnabled: true,
  rolloutPercentage: 10,
  targetTenantIds: [],
  dependencies: [],
  conflicts: [],
  startsAt: new Date().toISOString().slice(0, 16),
  errorThresholdPct: 5,
  reason: '',
});

const split = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const knownFeatureKeys: ReadonlySet<string> = new Set(
  PLAN_FEATURE_DEFINITIONS.map((item) => item.featureKey),
);

const splitFeatureKeys = (value: string): FeatureKeyName[] =>
  split(value).filter((item): item is FeatureKeyName => knownFeatureKeys.has(item));

const STAGE_LABELS: Record<FeatureRolloutStage, { label: string; badgeColor: string }> = {
  DEVELOPMENT: { label: 'Geliştirme', badgeColor: 'bg-slate-800 text-slate-300 border-slate-700' },
  INTERNAL: { label: 'Dahili (Internal)', badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  PILOT: { label: 'Pilot Test', badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  PERCENTAGE: { label: 'Kademeli (%)', badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  GENERAL: { label: 'Genel Dağıtım', badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

const ENV_LABELS: Record<FeatureEnvironment, { label: string; badgeColor: string }> = {
  DEVELOPMENT: { label: 'Dev', badgeColor: 'bg-slate-800 text-slate-300 border-slate-700' },
  STAGING: { label: 'Staging', badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  PRODUCTION: { label: 'Production', badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

export function FeatureRolloutPanel() {
  const admin = useAdminAuthStore((state) => state.admin);
  const client = useQueryClient();
  const canUpdate = canAdmin(admin, 'feature.update');

  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<CreateFeatureRolloutInput>(initialForm);
  const [targets, setTargets] = useState('');
  const [dependencies, setDependencies] = useState('');
  const [conflicts, setConflicts] = useState('');
  const [metricInputs, setMetricInputs] = useState<Record<string, string>>({});

  // Confirm Dialogs
  const [stoppingRollout, setStoppingRollout] = useState<{ id: string; killSwitch: boolean; name: string } | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'feature-rollouts'],
    queryFn: getFeatureRollouts,
  });

  const refresh = () => client.invalidateQueries({ queryKey: ['admin', 'feature-rollouts'] });

  const create = useMutation({
    mutationFn: createFeatureRollout,
    onSuccess: async () => {
      setForm(initialForm());
      setTargets('');
      setDependencies('');
      setConflicts('');
      setIsCreating(false);
      await refresh();
      toast.success('Rollout taslağı başarıyla oluşturuldu.');
    },
    onError: () => toast.error('Rollout taslağı oluşturulamadı.'),
  });

  const activate = useMutation({
    mutationFn: activateFeatureRollout,
    onSuccess: async () => {
      await refresh();
      toast.success('Rollout aktivasyonu ikinci adminin onayına gönderildi.');
    },
    onError: () => toast.error('Aktivasyon onay isteği gönderilemedi.'),
  });

  const stop = useMutation({
    mutationFn: ({ id, killSwitch }: { id: string; killSwitch: boolean }) =>
      stopFeatureRollout(
        id,
        killSwitch
          ? 'Acil kill switch ile rollout derhal durduruldu'
          : 'Operasyon ekibi rollout dağıtımını durdurdu',
        killSwitch,
      ),
    onSuccess: async (_, { killSwitch }) => {
      setStoppingRollout(null);
      if (killSwitch) {
        toast.warning('🚨 Kill Switch tetiklendi! Rollout derhal durduruldu.');
      } else {
        toast.info('Rollout durduruldu.');
      }
      await refresh();
    },
    onError: () => toast.error('Rollout durdurulamadı.'),
  });

  const report = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      reportFeatureRolloutMetric(id, value),
    onSuccess: async () => {
      toast.success('Hata metriği başarıyla güncellendi.');
      await refresh();
    },
    onError: () => toast.error('Metrik raporlanamadı.'),
  });

  const rollouts = useMemo(() => query.data ?? [], [query.data]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.reason.trim().length < 10) {
      toast.warning('Lütfen en az 10 karakterlik bir onay gerekçesi belirtin.');
      return;
    }
    create.mutate({
      ...form,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      targetTenantIds: split(targets),
      dependencies: splitFeatureKeys(dependencies),
      conflicts: splitFeatureKeys(conflicts),
      rolloutPercentage: form.stage === 'GENERAL' ? 100 : Number(form.rolloutPercentage),
    });
  };

  return (
    <div className="space-y-6">
      {/* Panel Header & Toggle */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Kademeli Dağıtım & Rollout Yönetimi
            </h2>
            <p className="text-xs text-slate-400">
              Sürümlü, hedef tenant bazlı ve otomatik hata eşikli feature flag dağıtımları.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            loading={query.isFetching}
            leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>

          {canUpdate && (
            <Button
              variant={isCreating ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setIsCreating(!isCreating)}
              leftIcon={<Plus className={cn('h-3.5 w-3.5 transition-transform', isCreating && 'rotate-45')} />}
            >
              {isCreating ? 'Formu Kapat' : 'Yeni Rollout Başlat'}
            </Button>
          )}
        </div>
      </div>

      {/* Rollout Creator Form */}
      {isCreating && canUpdate && (
        <form
          onSubmit={handleCreateSubmit}
          className="space-y-4 rounded-2xl border border-violet-500/30 bg-slate-900/90 p-5 shadow-xl ring-1 ring-violet-500/20"
        >
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Yeni Rollout Dağıtımı Tanımla</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Plan */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Plan</label>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value as PlanName })}
              >
                <option value="STARTER">Starter</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>

            {/* Feature Key */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Özellik</label>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                value={form.featureKey}
                onChange={(e) => setForm({ ...form, featureKey: e.target.value as FeatureKeyName })}
              >
                {PLAN_FEATURE_DEFINITIONS.map((item) => (
                  <option key={item.featureKey} value={item.featureKey}>
                    {item.label} ({item.featureKey})
                  </option>
                ))}
              </select>
            </div>

            {/* Environment */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Ortam</label>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                value={form.environment}
                onChange={(e) => setForm({ ...form, environment: e.target.value as FeatureEnvironment })}
              >
                <option value="DEVELOPMENT">Development</option>
                <option value="STAGING">Staging</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </div>

            {/* Stage */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Dağıtım Aşaması</label>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as FeatureRolloutStage })}
              >
                <option value="PILOT">Pilot Test (Belirli Tenantlar)</option>
                <option value="PERCENTAGE">Kademeli Yüzdelik (%)</option>
                <option value="INTERNAL">Dahili (Internal)</option>
                <option value="GENERAL">Genel Dağıtım (%100)</option>
                <option value="DEVELOPMENT">Geliştirme</option>
              </select>
            </div>

            {/* Value */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Değer</label>
              <input
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="true, 50, basic..."
                required
              />
            </div>

            {/* Rollout % */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Dağıtım Yüzdesi: %{form.rolloutPercentage}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={form.rolloutPercentage}
                  onChange={(e) => setForm({ ...form, rolloutPercentage: Number(e.target.value) })}
                  className="w-full accent-violet-500"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.rolloutPercentage}
                  onChange={(e) => setForm({ ...form, rolloutPercentage: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-center text-slate-200"
                />
              </div>
            </div>

            {/* Error Threshold % */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Hata Eşiği: %{form.errorThresholdPct}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.errorThresholdPct}
                onChange={(e) => setForm({ ...form, errorThresholdPct: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                placeholder="Örn: 5"
              />
            </div>

            {/* Starts At */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Başlangıç Zamanı</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              />
            </div>

            {/* Targets */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Hedef Tenant ID&apos;leri (Virgülle ayırın)
              </label>
              <input
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                placeholder="tenant_123, tenant_456"
              />
            </div>

            {/* Dependencies */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Bağımlılıklar</label>
              <input
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                value={dependencies}
                onChange={(e) => setDependencies(e.target.value)}
                placeholder="MAX_USERS, STORAGE..."
              />
            </div>

            {/* Conflicts */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Çakışan Özellikler</label>
              <input
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                value={conflicts}
                onChange={(e) => setConflicts(e.target.value)}
                placeholder="Çakışan feature anahtarları"
              />
            </div>

            {/* Reason */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Değişiklik ve Onay Gerekçesi <span className="text-rose-400">* (Min 10 karakter)</span>
              </label>
              <input
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Bu rollout'un dağıtım amacı, hedef kitle ve onay gerekçesi..."
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(false)}>
              İptal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={create.isPending}
              disabled={form.reason.trim().length < 10}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Taslak Rollout Oluştur
            </Button>
          </div>
        </form>
      )}

      {/* Rollouts List */}
      {query.isError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          Rollout kayıtları alınamadı.
        </div>
      )}

      {!query.isLoading && rollouts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
          Henüz aktif veya taslak bir feature rollout kaydı bulunmuyor.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rollouts.map((item) => {
          const stageConfig = STAGE_LABELS[item.stage] ?? { label: item.stage, badgeColor: 'bg-slate-800 text-slate-300' };
          const envConfig = ENV_LABELS[item.environment] ?? { label: item.environment, badgeColor: 'bg-slate-800 text-slate-300' };
          const isOverThreshold =
            item.observedErrorRatePct !== null &&
            item.observedErrorRatePct > item.errorThresholdPct;

          return (
            <div
              key={item.id}
              className={cn(
                'flex flex-col justify-between rounded-2xl border bg-slate-900/50 p-5 shadow-sm transition-all duration-150',
                item.status === 'ACTIVE'
                  ? 'border-emerald-500/30 bg-slate-900/70'
                  : item.status === 'PENDING_APPROVAL'
                    ? 'border-amber-500/30 bg-slate-900/70'
                    : 'border-slate-800/80 bg-slate-950/40',
              )}
            >
              <div className="space-y-3">
                {/* Header: Title, Tags & Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-100 text-sm">
                        {item.featureKey}
                      </span>
                      <span className="rounded-md border border-slate-700 bg-slate-800/80 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
                        v{item.version}
                      </span>
                      <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.2 text-[10px] font-medium text-sky-400">
                        {item.plan}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-1">{item.reason}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-semibold', envConfig.badgeColor)}>
                      {envConfig.label}
                    </span>
                    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-semibold', stageConfig.badgeColor)}>
                      {stageConfig.label}
                    </span>
                  </div>
                </div>

                {/* Progress Bar & Rollout Percentage */}
                <div className="space-y-1.5 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Dağıtım İlerlemesi:</span>
                    <span className="font-semibold text-white">%{item.rolloutPercentage} Dağıtıldı</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        item.status === 'ACTIVE'
                          ? 'bg-gradient-to-r from-violet-500 to-sky-400'
                          : 'bg-slate-600',
                      )}
                      style={{ width: `${item.rolloutPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Error & Metrics Strip */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5">
                    <span className="text-[10px] text-slate-500 block">Ölçülen Hata Oranı</span>
                    <div className="flex items-center gap-1.5 font-medium mt-0.5">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          isOverThreshold ? 'text-rose-400' : 'text-emerald-400',
                        )}
                      >
                        %{item.observedErrorRatePct ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500">/ Eşik: %{item.errorThresholdPct}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5">
                    <span className="text-[10px] text-slate-500 block">Hedeflenen Tenantlar</span>
                    <span className="font-medium text-slate-200 mt-0.5 block">
                      {item.targetTenantIds.length > 0 ? `${item.targetTenantIds.length} Tenant` : 'Tüm Tenantlar'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {canUpdate && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                  <div className="flex items-center gap-2">
                    {item.status === 'DRAFT' && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={activate.isPending}
                        onClick={() => activate.mutate(item.id)}
                        leftIcon={<Send className="h-3.5 w-3.5" />}
                      >
                        Onaya Gönder
                      </Button>
                    )}

                    {item.status === 'ACTIVE' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="h-7 w-16 rounded-lg border border-slate-800 bg-slate-950 px-1.5 text-xs text-center text-slate-200 focus:border-sky-500"
                          placeholder="Hata %"
                          value={metricInputs[item.id] ?? ''}
                          onChange={(e) => setMetricInputs({ ...metricInputs, [item.id]: e.target.value })}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!metricInputs[item.id]}
                          loading={report.isPending}
                          onClick={() =>
                            report.mutate({ id: item.id, value: Number(metricInputs[item.id]) })
                          }
                        >
                          Metrik Gir
                        </Button>
                      </div>
                    )}
                  </div>

                  {item.status === 'ACTIVE' && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={stop.isPending}
                        onClick={() =>
                          setStoppingRollout({ id: item.id, killSwitch: false, name: item.featureKey })
                        }
                      >
                        Durdur
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={stop.isPending}
                        onClick={() =>
                          setStoppingRollout({ id: item.id, killSwitch: true, name: item.featureKey })
                        }
                        leftIcon={<Flame className="h-3.5 w-3.5 text-rose-200" />}
                      >
                        Kill Switch
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm Dialog for Stopping / Kill Switching */}
      <ConfirmDialog
        isOpen={Boolean(stoppingRollout)}
        onClose={() => setStoppingRollout(null)}
        onConfirm={() =>
          stoppingRollout &&
          stop.mutate({ id: stoppingRollout.id, killSwitch: stoppingRollout.killSwitch })
        }
        title={stoppingRollout?.killSwitch ? '🚨 Acil Kill Switch Tetikle' : 'Rollout Dağıtımını Durdur'}
        variant="danger"
        isLoading={stop.isPending}
        confirmLabel={stoppingRollout?.killSwitch ? 'Kill Switch Çalıştır' : 'Durdur'}
        cancelLabel="Vazgeç"
        message={
          <div>
            <p>
              <strong className="text-white">{stoppingRollout?.name}</strong> rollout dağıtımı derhal sonlandırılacaktır.
            </p>
            {stoppingRollout?.killSwitch && (
              <p className="mt-2 text-xs font-semibold text-rose-400">
                Acil durum kill switch tüm tenantlarda özelliği derhal devre dışı bırakır.
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
