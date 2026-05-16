'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Building2, CalendarDays, Layers3, Plus, Search, X,
} from 'lucide-react';
import { createTenant, getTenants, type CreateTenantInput } from '@/services/admin.service';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  TRIAL: { label: 'Deneme', variant: 'warning' },
  ACTIVE: { label: 'Aktif', variant: 'success' },
  SUSPENDED: { label: 'Askıda', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const PLAN_MAP: Record<string, { label: string; color: string }> = {
  STARTER: { label: 'Starter', color: 'text-sky-400 bg-sky-500/10' },
  PROFESSIONAL: { label: 'Professional', color: 'text-violet-400 bg-violet-500/10' },
  ENTERPRISE: { label: 'Enterprise', color: 'text-amber-400 bg-amber-500/10' },
};

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

const PLAN_MODULES = {
  STARTER: ['accounting', 'inventory', 'crm', 'sales', 'purchasing', 'warehouse', 'reporting', 'contacts', 'invoicing'],
  PROFESSIONAL: ['accounting', 'inventory', 'crm', 'sales', 'purchasing', 'warehouse', 'reporting', 'contacts', 'invoicing', 'approvals'],
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
    <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
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

export default function AdminTenantsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateTenantInput>(() => createDefaultTenantForm());
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tenants', page, search, statusFilter, planFilter],
    queryFn: () => getTenants({ page, limit: 20, search: search || undefined, status: statusFilter || undefined, plan: planFilter || undefined }),
  });

  const create = useMutation({
    mutationFn: createTenant,
    onSuccess: (tenant) => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      setForm(createDefaultTenantForm());
      setFormError(null);
      setIsCreateOpen(false);
      router.push(`/admin/tenants/${tenant.id}`);
    },
    onError: (error: { response?: { data?: { error?: { message?: string } } } }) => {
      setFormError(error.response?.data?.error?.message ?? 'Tenant oluşturulamadı.');
    },
  });

  const toggleModule = (module: string) => {
    const current = form.modules ?? [];
    setForm({
      ...form,
      modules: current.includes(module) ? current.filter((item) => item !== module) : [...current, module],
    });
  };

  const submitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    create.mutate({
      ...form,
      slug: form.slug?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      city: form.city?.trim() || undefined,
      sector: form.sector?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      maxUsers: form.maxUsers || null,
      trialEndsAt: form.trialEndsAt || null,
      subscriptionStart: form.subscriptionStart || null,
      subscriptionEnd: form.subscriptionEnd || null,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-white">Tenantlar</h1>
          <button onClick={() => { setForm(createDefaultTenantForm()); setIsCreateOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400 transition-colors">
            <Plus className="h-4 w-4" /> Yeni Tenant
          </button>
        </div>
        <p className="text-sm text-slate-500">Tüm şirket hesaplarını yönetin.</p>
      </div>

      {isCreateOpen && (
        <form onSubmit={submitCreate} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-white">Yeni Tenant Oluştur</p>
              <p className="mt-1 text-xs text-slate-500">Owner mail adresine şifre belirleme bağlantısı gönderilir.</p>
            </div>
            <button type="button" onClick={() => setIsCreateOpen(false)} aria-label="Formu kapat" className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
          {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{formError}</div>}

          <FormSection icon={<Building2 className="h-4 w-4" />} title="Şirket ve Yetkili">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Şirket adı" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Owner email" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <input required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Owner adı" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Slug (opsiyonel)" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefon" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Şehir" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} placeholder="Sektör" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <select
              value={form.plan}
              onChange={(e) => {
                const plan = e.target.value as PlanKey;
                setForm({ ...form, plan, modules: [...PLAN_MODULES[plan]] });
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50">
              <option value="TRIAL">Deneme</option>
              <option value="ACTIVE">Aktif</option>
              <option value="SUSPENDED">Askıda</option>
              <option value="CANCELLED">İptal</option>
            </select>
            <input type="number" min={1} value={form.maxUsers ?? ''} onChange={(e) => setForm({ ...form, maxUsers: e.target.value ? Number(e.target.value) : null })} placeholder="Max kullanıcı" className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
              <input type="checkbox" checked={form.isCustomPricing} onChange={(e) => setForm({ ...form, isCustomPricing: e.target.checked })} className="accent-red-500" />
              Özel fiyat
            </label>
          </div>
          </FormSection>

          <FormSection icon={<CalendarDays className="h-4 w-4" />} title="Abonelik Tarihleri">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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

          <FormSection icon={<Layers3 className="h-4 w-4" />} title="Modüller">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{form.modules?.length ?? 0} modül seçili</p>
            <button
              type="button"
              onClick={() => setForm({ ...form, modules: [...PLAN_MODULES[form.plan as PlanKey]] })}
              className="rounded-lg border border-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:border-slate-700 hover:text-slate-200"
            >
              Pakete Göre Sıfırla
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {MODULE_OPTIONS.map((module) => (
              <button key={module.key} type="button" onClick={() => toggleModule(module.key)}
                className={cn('rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors',
                  form.modules?.includes(module.key) ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-slate-800 text-slate-500 hover:text-slate-300')}>
                {module.label}
              </button>
            ))}
          </div>
          </FormSection>

          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notlar" rows={2} className="w-full bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />

          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/40 px-5 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">Vazgeç</button>
            <button type="submit" disabled={create.isPending} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
              {create.isPending ? 'Oluşturuluyor...' : 'Tenant Oluştur'}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Şirket adı, slug veya email…"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg text-sm text-white pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50">
          <option value="">Tüm Durumlar</option>
          <option value="TRIAL">Deneme</option>
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Askıda</option>
          <option value="CANCELLED">İptal</option>
        </select>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50">
          <option value="">Tüm Planlar</option>
          <option value="STARTER">Starter</option>
          <option value="PROFESSIONAL">Professional</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-800/30 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/40">
          <div className="col-span-3">Şirket</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-2">Durum</div>
          <div className="col-span-1 text-center">Kullanıcı</div>
          <div className="col-span-1 text-center">Ürün</div>
          <div className="col-span-1 text-center">Fatura</div>
          <div className="col-span-2 text-right">Kayıt</div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-600">Yükleniyor…</div>
        ) : !data || data.data.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-600">Tenant bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {data.data.map((t) => {
              const plan = PLAN_MAP[t.plan];
              const status = STATUS_MAP[t.status];
              return (
                <div key={t.id} onClick={() => router.push(`/admin/tenants/${t.id}`)}
                  className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-slate-800/20 transition-colors cursor-pointer">
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{t.companyName}</p>
                    <p className="text-[10px] text-slate-500">{t.slug} · {t.email}</p>
                  </div>
                  <div className="col-span-2">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', plan?.color ?? 'text-slate-400')}>{plan?.label ?? t.plan}</span>
                  </div>
                  <div className="col-span-2">
                    {status ? <Badge variant={status.variant}>{status.label}</Badge> : <span className="text-xs text-slate-400">{t.status}</span>}
                  </div>
                  <div className="col-span-1 text-center text-sm text-slate-300">{t._count.users}</div>
                  <div className="col-span-1 text-center text-sm text-slate-300">{t._count.products}</div>
                  <div className="col-span-1 text-center text-sm text-slate-300">{t._count.invoices}</div>
                  <div className="col-span-2 text-right text-xs text-slate-500">{new Date(t.createdAt).toLocaleDateString('tr-TR')}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: data.meta.totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              className={cn('w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                page === i + 1 ? 'bg-red-500/15 text-red-400' : 'text-slate-500 hover:bg-slate-800')}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
