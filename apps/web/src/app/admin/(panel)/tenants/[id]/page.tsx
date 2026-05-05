'use client';

import { use, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, Package, Receipt, ShoppingCart, Truck, CreditCard, Warehouse, Layers, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getTenantById, getTenantMetrics, updateTenant, updateTenantPlan, updateTenantStatus } from '@/services/admin.service';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const PLANS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
const STATUSES = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'] as const;
const MODULE_OPTIONS = [
  { key: 'accounting', label: 'Muhasebe' },
  { key: 'inventory', label: 'Stok' },
  { key: 'crm', label: 'CRM' },
  { key: 'sales', label: 'Satış' },
  { key: 'purchasing', label: 'Satın Alma' },
  { key: 'warehouse', label: 'Depo' },
  { key: 'production', label: 'Üretim' },
  { key: 'service', label: 'Servis' },
  { key: 'hr', label: 'İnsan Kaynakları' },
  { key: 'payroll', label: 'Bordro' },
  { key: 'marketplace', label: 'Pazaryeri' },
  { key: 'reporting', label: 'Raporlama' },
  { key: 'contacts', label: 'Cari Hesaplar' },
  { key: 'invoicing', label: 'Faturalama' },
  { key: 'approvals', label: 'Onaylar' },
] as const;

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  MODULE_OPTIONS.map((module) => [module.key, module.label]),
);

const STATUS_VARIANT: Record<string, BadgeVariant> = { TRIAL: 'warning', ACTIVE: 'success', SUSPENDED: 'danger', CANCELLED: 'neutral' };
const PLAN_COLOR: Record<string, string> = { STARTER: 'text-sky-400 bg-sky-500/10 border-sky-500/30', PROFESSIONAL: 'text-violet-400 bg-violet-500/10 border-violet-500/30', ENTERPRISE: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };

function toDateInput(value: string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export default function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [settings, setSettings] = useState({
    maxUsers: '',
    modules: [] as string[],
    notes: '',
    isCustomPricing: false,
    trialEndsAt: '',
    subscriptionStart: '',
    subscriptionEnd: '',
  });
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const { data: tenant, isLoading } = useQuery({ queryKey: ['admin', 'tenant', id], queryFn: () => getTenantById(id) });
  const { data: metrics } = useQuery({ queryKey: ['admin', 'tenant-metrics', id], queryFn: () => getTenantMetrics(id) });

  const changePlan = useMutation({
    mutationFn: (plan: string) => updateTenantPlan(id, plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenant', id] }),
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) => updateTenantStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenant', id] }),
  });

  const saveSettings = useMutation({
    mutationFn: () => updateTenant(id, {
      maxUsers: settings.maxUsers ? Number(settings.maxUsers) : null,
      modules: settings.modules,
      notes: settings.notes,
      isCustomPricing: settings.isCustomPricing,
      trialEndsAt: settings.trialEndsAt || null,
      subscriptionStart: settings.subscriptionStart || null,
      subscriptionEnd: settings.subscriptionEnd || null,
    }),
    onSuccess: () => {
      setSettingsError(null);
      qc.invalidateQueries({ queryKey: ['admin', 'tenant', id] });
    },
    onError: (error: { response?: { data?: { error?: { message?: string } } } }) => {
      setSettingsError(error.response?.data?.error?.message ?? 'Tenant ayarları kaydedilemedi.');
    },
  });

  useEffect(() => {
    if (!tenant) return;
    setSettings({
      maxUsers: tenant.maxUsers?.toString() ?? '',
      modules: tenant.modules ?? [],
      notes: tenant.notes ?? '',
      isCustomPricing: tenant.isCustomPricing,
      trialEndsAt: toDateInput(tenant.trialEndsAt),
      subscriptionStart: toDateInput(tenant.subscriptionStart),
      subscriptionEnd: toDateInput(tenant.subscriptionEnd),
    });
  }, [tenant]);

  const toggleModule = (module: string) => {
    setSettings((current) => ({
      ...current,
      modules: current.modules.includes(module)
        ? current.modules.filter((item) => item !== module)
        : [...current.modules, module],
    }));
  };

  if (isLoading || !tenant) return <div className="text-slate-500 text-sm">Yükleniyor…</div>;

  const m = metrics?.counts;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-white">{tenant.companyName}</h1>
          <p className="text-xs text-slate-500">{tenant.slug} · {tenant.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'}>{tenant.status}</Badge>
          <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', PLAN_COLOR[tenant.plan])}>{tenant.plan}</span>
        </div>
      </div>

      {/* Plan & Status controls */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 mb-3">Plan Değiştir</p>
          <div className="flex gap-2">
            {PLANS.map((p) => (
              <button key={p} onClick={() => changePlan.mutate(p)} disabled={tenant.plan === p}
                className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                  tenant.plan === p ? PLAN_COLOR[p] : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300')}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 mb-3">Durum Değiştir</p>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => changeStatus.mutate(s)} disabled={tenant.status === s}
                className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                  tenant.status === s ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300')}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics */}
      {m && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Veri Kullanımı</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Kullanıcı', value: m.users, icon: <Users className="w-3.5 h-3.5 text-sky-400" /> },
              { label: 'Ürün', value: m.products, icon: <Package className="w-3.5 h-3.5 text-emerald-400" /> },
              { label: 'Cari', value: m.contacts, icon: <Users className="w-3.5 h-3.5 text-violet-400" /> },
              { label: 'Fatura', value: m.invoices, icon: <Receipt className="w-3.5 h-3.5 text-amber-400" /> },
              { label: 'Satış Sip.', value: m.salesOrders, icon: <ShoppingCart className="w-3.5 h-3.5 text-sky-400" /> },
              { label: 'Satın Alma', value: m.purchaseOrders, icon: <Truck className="w-3.5 h-3.5 text-violet-400" /> },
              { label: 'Ödeme', value: m.payments, icon: <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> },
              { label: 'Depo', value: m.warehouses, icon: <Warehouse className="w-3.5 h-3.5 text-amber-400" /> },
              { label: 'Stok Kaydı', value: m.stockLevels, icon: <Layers className="w-3.5 h-3.5 text-pink-400" /> },
              { label: 'Yevmiye', value: m.journalEntries, icon: <BookOpen className="w-3.5 h-3.5 text-sky-400" /> },
            ].map((item) => (
              <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-slate-800">{item.icon}</div>
                <div>
                  <p className="text-sm font-bold text-white">{item.value}</p>
                  <p className="text-[10px] text-slate-500">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      <form onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-400">Tenant Ayarları</p>
          <button type="submit" disabled={saveSettings.isPending}
            className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
            {saveSettings.isPending ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
          </button>
        </div>

        {settingsError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{settingsError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <input type="number" min={1} value={settings.maxUsers} onChange={(e) => setSettings({ ...settings, maxUsers: e.target.value })} placeholder="Max kullanıcı" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
            <input type="checkbox" checked={settings.isCustomPricing} onChange={(e) => setSettings({ ...settings, isCustomPricing: e.target.checked })} className="accent-red-500" />
            Özel fiyat
          </label>
          <input type="date" value={settings.trialEndsAt} onChange={(e) => setSettings({ ...settings, trialEndsAt: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
          <input type="date" value={settings.subscriptionEnd} onChange={(e) => setSettings({ ...settings, subscriptionEnd: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input type="date" value={settings.subscriptionStart} onChange={(e) => setSettings({ ...settings, subscriptionStart: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
          <textarea value={settings.notes} onChange={(e) => setSettings({ ...settings, notes: e.target.value })} placeholder="Notlar" rows={2} className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
        </div>

        <div className="flex flex-wrap gap-2">
          {MODULE_OPTIONS.map((module) => (
            <button key={module.key} type="button" onClick={() => toggleModule(module.key)}
              className={cn('px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors',
                settings.modules.includes(module.key) ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-slate-800 text-slate-500 hover:text-slate-300')}>
              {module.label}
            </button>
          ))}
        </div>
      </form>

      {/* Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-400 mb-3">Detaylar</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500 text-xs">Şehir</span><p className="text-slate-200">{tenant.city ?? '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Sektör</span><p className="text-slate-200">{tenant.sector ?? '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Max Kullanıcı</span><p className="text-slate-200">{tenant.maxUsers ?? 'Sınırsız'}</p></div>
          <div><span className="text-slate-500 text-xs">Özel Fiyat</span><p className="text-slate-200">{tenant.isCustomPricing ? 'Evet' : 'Hayır'}</p></div>
          <div><span className="text-slate-500 text-xs">Mod�ller</span><p className="text-slate-200">{tenant.modules.map((module) => MODULE_LABELS[module] ?? module).join(', ') || '�'}</p></div>
          <div><span className="text-slate-500 text-xs">Notlar</span><p className="text-slate-200">{tenant.notes ?? '—'}</p></div>
        </div>
      </div>

      {/* Feature Overrides */}
      {tenant.featureOverrides.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 mb-3">Feature Override'lar</p>
          <div className="space-y-2">
            {tenant.featureOverrides.map((o) => (
              <div key={o.id} className="flex items-center gap-3 text-sm bg-slate-800/30 rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-violet-400">{o.featureKey}</span>
                <span className="text-slate-300">{o.value}</span>
                <Badge variant={o.isEnabled ? 'success' : 'neutral'}>{o.isEnabled ? 'Aktif' : 'Pasif'}</Badge>
                {o.reason && <span className="text-xs text-slate-500 ml-auto">{o.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
