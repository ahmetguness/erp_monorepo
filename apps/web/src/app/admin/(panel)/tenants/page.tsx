'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  Layers3,
  Plus,
  Search,
  X,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  FilterX,
  TrendingUp,
  Zap,
  Activity,
  Users,
  Package,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  createTenant,
  getTenantProvisioningJobs,
  getTenants,
  previewTenant,
  retryTenantProvisioning,
  type CreateTenantInput,
} from '@/services/admin.service';
import type {
  ModuleKey,
  TenantProvisioningInput,
  TenantProvisioningJob,
  TenantProvisioningPreview,
} from '@repo/types';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { DatePicker } from '@/components/ui/DatePicker';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';
import { extractAdminError, toastAdminError } from '@/lib/admin/errors';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  TRIAL: { label: 'Deneme', variant: 'warning' },
  ACTIVE: { label: 'Aktif', variant: 'success' },
  SUSPENDED: { label: 'Askıda', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
  ARCHIVED: { label: 'Arşivlendi', variant: 'neutral' },
  DELETION_SCHEDULED: { label: 'Silme Planlandı', variant: 'danger' },
  DELETED: { label: 'Silindi', variant: 'danger' },
};

const PLAN_MAP: Record<string, { label: string; badgeClass: string }> = {
  STARTER: {
    label: 'Starter',
    badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  PROFESSIONAL: {
    label: 'Professional',
    badgeClass: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
};

const MODULE_OPTIONS = [
  { key: 'accounting', label: 'Muhasebe' },
  { key: 'inventory', label: 'Stok & Envanter' },
  { key: 'crm', label: 'CRM & Müşteri' },
  { key: 'sales', label: 'Satış Yönetimi' },
  { key: 'purchasing', label: 'Satın Alma' },
  { key: 'warehouse', label: 'Depo Yönetimi' },
  { key: 'production', label: 'Üretim' },
  { key: 'service', label: 'Servis Hizmetleri' },
  { key: 'hr', label: 'İnsan Kaynakları' },
  { key: 'payroll', label: 'Bordro' },
  { key: 'marketplace', label: 'Pazaryeri Entegrasyonları' },
  { key: 'reporting', label: 'Raporlama & BI' },
  { key: 'contacts', label: 'Cari Hesaplar' },
  { key: 'invoicing', label: 'Faturalama' },
  { key: 'approvals', label: 'Onay Süreçleri' },
  { key: 'workflow', label: 'İş Akışı' },
  { key: 'documents', label: 'Doküman Yönetimi' },
  { key: 'mail', label: 'Mail Entegrasyonu' },
] as const;

const PLAN_MODULES = {
  STARTER: ['accounting', 'inventory', 'crm', 'sales', 'reporting', 'contacts', 'invoicing', 'documents'],
  PROFESSIONAL: [
    'accounting',
    'inventory',
    'crm',
    'sales',
    'purchasing',
    'warehouse',
    'reporting',
    'contacts',
    'invoicing',
    'approvals',
    'workflow',
    'documents',
  ],
  ENTERPRISE: MODULE_OPTIONS.map((module) => module.key),
} as const;

type PlanKey = keyof typeof PLAN_MODULES;

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysToInputDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  return toDateInput(addDays(new Date(year, month - 1, day), days));
}

function createDefaultTenantForm(): CreateTenantInput {
  const startDate = new Date();
  const endDate = addDays(startDate, 372);

  return {
    companyName: '',
    email: '',
    ownerName: '',
    slug: '',
    phone: '',
    city: '',
    sector: '',
    plan: 'STARTER',
    status: 'TRIAL',
    maxUsers: null,
    modules: [...PLAN_MODULES.STARTER],
    notes: '',
    isCustomPricing: false,
    trialEndsAt: null,
    subscriptionStart: toDateInput(startDate),
    subscriptionEnd: toDateInput(endDate),
  };
}

function FormSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-400 ring-1 ring-slate-800">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function AdminTenantsContent() {
  const canCreateTenant = useAdminAuthStore((state) => canAdmin(state.admin, 'tenant.create'));
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const initialStatus = searchParams.get('status') ?? '';
  const initialPlan = searchParams.get('plan') ?? '';

  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [planFilter, setPlanFilter] = useState(initialPlan);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const s = searchParams.get('search');
    if (s !== null) setSearch(s);
    const st = searchParams.get('status');
    if (st !== null) setStatusFilter(st);
    const p = searchParams.get('plan');
    if (p !== null) setPlanFilter(p);
  }, [searchParams]);

  const [form, setForm] = useState<CreateTenantInput>(() => createDefaultTenantForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    input: TenantProvisioningInput;
    preview: TenantProvisioningPreview;
  } | null>(null);
  const [job, setJob] = useState<TenantProvisioningJob | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'tenants', page, search, statusFilter, planFilter],
    queryFn: () =>
      getTenants({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
        plan: planFilter || undefined,
      }),
  });

  const preview = useMutation({
    mutationFn: previewTenant,
    onSuccess: (result, input) => setProposal({ input, preview: result }),
    onError: (err: unknown) => {
      toastAdminError(err, 'Önizleme alınamadı.');
    },
  });

  const create = useMutation({
    mutationFn: ({ input, key }: { input: TenantProvisioningInput; key: string }) =>
      createTenant(input, key),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'tenant-provisioning'] });
      setJob(result);
      setFormError(null);
      toast.success('Tenant kurulum süreci başlatıldı.');
    },
    onError: (err: unknown) => {
      const msg = extractAdminError(err, 'Tenant oluşturulamadı.');
      setFormError(msg);
      toastAdminError(err, 'Tenant oluşturulamadı.');
    },
  });

  const jobs = useQuery({
    queryKey: ['admin', 'tenant-provisioning'],
    queryFn: getTenantProvisioningJobs,
    enabled: canCreateTenant,
  });

  const retry = useMutation({
    mutationFn: retryTenantProvisioning,
    onSuccess: (result) => {
      setJob(result);
      void qc.invalidateQueries({ queryKey: ['admin', 'tenant-provisioning'] });
      toast.info('Kurulum adımı yeniden tetiklendi.');
    },
    onError: (err: unknown) => {
      toastAdminError(err, 'Kurulum adımı yeniden tetiklenemedi.');
    },
  });

  const toggleModule = (module: ModuleKey) => {
    const current = form.modules;
    setForm({
      ...form,
      modules: current.includes(module)
        ? current.filter((item) => item !== module)
        : [...current, module],
    });
  };

  const submitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const toIso = (value: string | null | undefined) =>
      value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;

    preview.mutate({
      ...form,
      slug: form.slug?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      city: form.city?.trim() || undefined,
      sector: form.sector?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      maxUsers: form.maxUsers || null,
      trialEndsAt: toIso(form.trialEndsAt),
      subscriptionStart: toIso(form.subscriptionStart),
      subscriptionEnd: toIso(form.subscriptionEnd),
    });
  };

  const handleCopyId = (id: string, name: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success(`${name} ID kopyalandı`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const hasActiveFilters = Boolean(search) || Boolean(statusFilter) || Boolean(planFilter);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPlanFilter('');
    setPage(1);
  };

  const tenantList = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, totalPages: 1, page: 1, pageSize: 20 };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-rose-600/20 text-rose-400 ring-1 ring-rose-500/30">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Tenant Yönetimi & Şirketler
            </h1>
            <p className="text-xs text-slate-400">
              Platformdaki tüm müşteri şirket hesaplarını, abonelik planlarını ve provizyon süreçlerini yönetin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })}
            loading={isFetching}
            leftIcon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>

          {canCreateTenant && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setForm(createDefaultTenantForm());
                setProposal(null);
                setJob(null);
                setFormError(null);
                setIsCreateOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Yeni Tenant Ekle
            </Button>
          )}
        </div>
      </div>

      {/* KPI & Metric Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kayıtlı Şirketler</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">{meta.total}</div>
          <div className="mt-1 text-[11px] text-slate-400">Sistemdeki tüm şirket hesapları</div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Aktif Şirketler</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {tenantList.filter((t) => t.status === 'ACTIVE').length}
            <span className="text-xs font-normal text-slate-400"> / Sayfada</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium">Canlı üretim yapan hesaplar</div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Deneme Sürecinde</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {tenantList.filter((t) => t.status === 'TRIAL').length}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Satış takibindeki hesaplar</div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Askıda / Riskli</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {tenantList.filter((t) => t.status === 'SUSPENDED').length}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">İnceleme gereken tenantlar</div>
        </div>
      </div>

      {/* Provisioning Jobs Alert Strip (if any active/recent) */}
      {canCreateTenant && jobs.data && jobs.data.length > 0 && (
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-sm backdrop-blur">
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            Son Provizyon / Kurulum İşlemleri
          </h2>
          <div className="space-y-2">
            {jobs.data.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/70 px-3.5 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-400">{item.id.slice(0, 16)}…</span>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-bold border',
                      item.status === 'SUCCEEDED'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : item.status === 'FAILED'
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                    )}
                  >
                    {item.status}
                  </span>
                  {item.error && <span className="text-rose-400 text-[11px]">{item.error}</span>}
                </div>

                <div className="flex gap-2">
                  {item.status === 'FAILED' && (
                    <button
                      type="button"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(item.id)}
                      className="text-xs font-semibold text-amber-400 hover:text-amber-300"
                    >
                      Tekrar Dene
                    </button>
                  )}
                  {item.tenantId && (
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/tenants/${item.tenantId}`)}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300"
                    >
                      Tenantı Aç →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create Tenant Drawer / Modal */}
      {canCreateTenant && isCreateOpen && (
        <form
          onSubmit={submitCreate}
          onChange={() => {
            setProposal(null);
            setJob(null);
          }}
          className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-white">Yeni Tenant Oluştur</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Şirket veritabanı, yetkili yönetici hesabı ve modül lisansları anında provizyonlanır.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              aria-label="Formu kapat"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 p-6">
            {formError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {formError}
              </div>
            )}

            <FormSection icon={<Building2 className="h-4 w-4" />} title="Şirket ve Yetkili Bilgileri">
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                <input
                  required
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="Şirket Adı *"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Yönetici (Owner) E-Posta *"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <input
                  required
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  placeholder="Yönetici Ad Soyad *"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="Slug / Alan Adı (Örn: acme-ltd)"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Telefon Numarası"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Şehir"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <input
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  placeholder="Sektör"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
                <select
                  value={form.plan}
                  onChange={(e) => {
                    const plan = e.target.value as PlanKey;
                    setForm({ ...form, plan, modules: [...PLAN_MODULES[plan]] });
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <option value="STARTER">Starter Planı</option>
                  <option value="PROFESSIONAL">Professional Planı</option>
                  <option value="ENTERPRISE">Enterprise Planı</option>
                </select>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value === 'ACTIVE' ? 'ACTIVE' : 'TRIAL',
                    })
                  }
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <option value="TRIAL">Deneme Sürümü (Trial)</option>
                  <option value="ACTIVE">Aktif Lisanslı</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={form.maxUsers ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxUsers: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Maksimum Kullanıcı Limiti"
                  className="bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
            </FormSection>

            <FormSection icon={<CalendarDays className="h-4 w-4" />} title="Abonelik Tarihleri">
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                <DatePicker
                  label="Başlangıç Tarihi"
                  value={form.subscriptionStart ?? ''}
                  onValueChange={(start) => {
                    setForm({
                      ...form,
                      subscriptionStart: start,
                      subscriptionEnd: start ? addDaysToInputDate(start, 372) : null,
                    });
                  }}
                />
                <DatePicker
                  label="Bitiş Tarihi"
                  value={form.subscriptionEnd ?? ''}
                  onValueChange={(end) => setForm({ ...form, subscriptionEnd: end })}
                />
              </div>
            </FormSection>

            <FormSection icon={<Layers3 className="h-4 w-4" />} title="Aktif Modüller">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">{form.modules?.length ?? 0} modül seçili</p>
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, modules: [...PLAN_MODULES[form.plan as PlanKey]] })
                  }
                  className="rounded-lg border border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:border-slate-700 hover:text-slate-200"
                >
                  Pakete Göre Sıfırla
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                {MODULE_OPTIONS.map((module) => (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => toggleModule(module.key)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors',
                      form.modules?.includes(module.key)
                        ? 'border-red-500/40 bg-red-500/10 text-red-300'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200',
                    )}
                  >
                    {module.label}
                  </button>
                ))}
              </div>
            </FormSection>

            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Yönetici dahili notları (opsiyonel)"
              rows={2}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl text-xs text-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />

            {proposal && (
              <section className="space-y-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                <h3 className="font-bold text-white text-sm">Kurulum Ön Doğrulaması</h3>
                {proposal.preview.checks.map((check) => (
                  <p
                    key={check.key}
                    className={cn('text-xs flex items-center gap-1.5', check.valid ? 'text-emerald-300' : 'text-rose-300')}
                  >
                    {check.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    <span>{check.message}</span>
                  </p>
                ))}
                <div className="text-xs text-slate-300 pt-1">
                  <p>
                    Slug: <strong>{proposal.preview.normalizedSlug}</strong> • E-posta:{' '}
                    <strong>{proposal.preview.normalizedEmail}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!proposal.preview.valid || create.isPending}
                  onClick={() => create.mutate({ input: proposal.input, key: crypto.randomUUID() })}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition-colors"
                >
                  Kurulumu Başlat
                </button>
              </section>
            )}

            {job && (
              <section className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="font-bold text-white text-sm">Provizyon Durumu: {job.status}</h3>
                {job.steps.map((step) => (
                  <p key={step.key} className="text-xs text-slate-300">
                    {step.key}: <strong>{step.status}</strong> • Deneme {step.attempts}
                    {step.error ? ` • ${step.error}` : ''}
                  </p>
                ))}
                {job.error && <p className="text-rose-400 text-xs">{job.error}</p>}
                <div className="flex gap-2 pt-2">
                  {job.status === 'FAILED' && (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(job.id)}
                    >
                      Başarısız Adımı Yeniden Dene
                    </Button>
                  )}
                  {job.tenantId && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => router.push(`/admin/tenants/${job.tenantId}`)}
                    >
                      Tenantı Aç
                    </Button>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/60 px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="md" onClick={() => setIsCreateOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={preview.isPending || create.isPending}
            >
              Ön Doğrula ve Önizle
            </Button>
          </div>
        </form>
      )}

      {/* Filters Toolbar */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Şirket adı, slug veya e-posta ile ara…"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-red-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs text-slate-200 focus:border-red-500 focus:outline-none"
            >
              <option value="">Tüm Durumlar</option>
              <option value="TRIAL">Deneme</option>
              <option value="ACTIVE">Aktif</option>
              <option value="SUSPENDED">Askıda</option>
              <option value="CANCELLED">İptal</option>
              <option value="ARCHIVED">Arşivlendi</option>
              <option value="DELETION_SCHEDULED">Silme Planlandı</option>
              <option value="DELETED">Silindi</option>
            </select>

            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs text-slate-200 focus:border-red-500 focus:outline-none"
            >
              <option value="">Tüm Planlar</option>
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="ENTERPRISE">Enterprise</option>
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
      </div>

      {/* Tenants Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-sm backdrop-blur">
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800/80 bg-slate-950/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <div className="col-span-4 sm:col-span-3">Şirket / Slug</div>
          <div className="col-span-2">Paket Planı</div>
          <div className="col-span-2">Durum</div>
          <div className="col-span-2 sm:col-span-3">Hacim (Kul. / Ürün / Fat.)</div>
          <div className="col-span-2 text-right">Kayıt / Aksiyon</div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-800/40 p-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="animate-pulse grid grid-cols-12 gap-3 p-4">
                <div className="col-span-3 h-4 rounded bg-slate-800" />
                <div className="col-span-2 h-4 rounded bg-slate-800/70" />
                <div className="col-span-2 h-4 rounded bg-slate-800/60" />
                <div className="col-span-3 h-4 rounded bg-slate-800/50" />
                <div className="col-span-2 h-4 rounded bg-slate-800/40" />
              </div>
            ))}
          </div>
        ) : tenantList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-200">Tenant bulunamadı</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              {hasActiveFilters
                ? 'Arama kriterlerinizi veya filtrelerinizi sıfırlayarak tekrar deneyin.'
                : 'Sistemde henüz kayıtlı tenant bulunmuyor.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {tenantList.map((t) => {
              const plan = PLAN_MAP[t.plan] ?? PLAN_MAP.STARTER;
              const status = STATUS_MAP[t.status] ?? { label: t.status, variant: 'neutral' };

              return (
                <div
                  key={t.id}
                  className="group grid grid-cols-12 gap-3 items-center px-5 py-3.5 text-xs transition-colors hover:bg-slate-800/40"
                >
                  {/* Company info */}
                  <div className="col-span-4 sm:col-span-3 min-w-0 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-bold text-slate-200 ring-1 ring-slate-700">
                      {t.companyName ? t.companyName.charAt(0).toUpperCase() : 'T'}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            t.status === 'DELETED'
                              ? `/admin/tenants/${t.id}/lifecycle`
                              : `/admin/tenants/${t.id}`,
                          )
                        }
                        className="truncate font-semibold text-slate-100 hover:text-red-400 transition-colors text-left block"
                      >
                        {t.companyName}
                      </button>
                      <p className="truncate text-[11px] text-slate-500 font-mono">
                        {t.slug} • {t.email}
                      </p>
                    </div>
                  </div>

                  {/* Plan */}
                  <div className="col-span-2">
                    <span className={cn('rounded-lg border px-2.5 py-0.5 text-xs font-semibold', plan.badgeClass)}>
                      {plan.label}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  {/* Counters */}
                  <div className="col-span-2 sm:col-span-3 flex items-center gap-3 text-slate-300 text-xs">
                    <span className="flex items-center gap-1 font-medium" title="Kullanıcı Sayısı">
                      <Users className="h-3 w-3 text-slate-500" />
                      {t._count.users}
                    </span>
                    <span className="text-slate-700">•</span>
                    <span className="flex items-center gap-1 font-medium" title="Kayıtlı Ürün">
                      <Package className="h-3 w-3 text-slate-500" />
                      {t._count.products}
                    </span>
                    <span className="text-slate-700">•</span>
                    <span className="flex items-center gap-1 font-medium" title="Fatura Sayısı">
                      <CreditCard className="h-3 w-3 text-slate-500" />
                      {t._count.invoices}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 text-right flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyId(t.id, t.companyName)}
                      title="Tenant ID Kopyala"
                      className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white transition-colors"
                    >
                      {copiedId === t.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          t.status === 'DELETED'
                            ? `/admin/tenants/${t.id}/lifecycle`
                            : `/admin/tenants/${t.id}`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      <span>Yönet</span>
                      <ExternalLink className="h-3 w-3 text-slate-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4">
          <Pagination
            page={page}
            pageSize={meta.pageSize}
            total={meta.total}
            totalPages={meta.totalPages}
            onChange={(newPage) => setPage(newPage)}
          />
        </div>
      )}
    </div>
  );
}

export default function AdminTenantsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Yükleniyor…</div>}>
      <AdminTenantsContent />
    </Suspense>
  );
}
