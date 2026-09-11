'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  RefreshCw,
  Building2,
  CalendarDays,
  Tag,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  TrendingUp,
  Percent,
  Layers,
  FileText,
  Clock,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Send,
  Plus,
  Receipt,
  Banknote,
  DollarSign,
  Laptop,
} from 'lucide-react';
import type { PlanName, ModuleKey } from '@repo/types';
import {
  applySubscriptionCoupon,
  createSubscriptionCoupon,
  decideSubscriptionPrice,
  getRevenueOverview,
  getSubscription,
  quoteSubscriptionPlan,
  reconcileSubscription,
  recordBillingEvent,
  requestSubscriptionPrice,
} from '@/services/subscription-operations.service';
import { getTenantById } from '@/services/admin.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';
import { toastAdminError } from '@/lib/admin/errors';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const iso = (date: string) => new Date(`${date}T12:00:00.000Z`).toISOString();

const PLAN_BADGES: Record<string, { label: string; badgeClass: string }> = {
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

const STATE_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Aktif', variant: 'success' },
  TRIALING: { label: 'Deneme', variant: 'warning' },
  PAST_DUE: { label: 'Gecikmede (Dunning)', variant: 'danger' },
  CANCELED: { label: 'İptal Edildi', variant: 'neutral' },
};

const INVOICE_STATUS_MAP: Record<string, { label: string; badgeClass: string }> = {
  PAID: {
    label: 'Ödendi',
    badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  OPEN: {
    label: 'Açık / Bekliyor',
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  FAILED: {
    label: 'Başarısız',
    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  VOID: {
    label: 'Geçersiz',
    badgeClass: 'text-slate-400 bg-slate-800 border-slate-700',
  },
};

function formatCurrency(amount: string | number | null | undefined, currency = 'TRY'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return String(amount);
  return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

type TabKey = 'quote' | 'reconcile' | 'coupons' | 'invoices';

export function SubscriptionOperationsPage({ tenantId }: { tenantId: string }) {
  const admin = useAdminAuthStore((state) => state.admin);
  const client = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('quote');

  // Form states
  const [plan, setPlan] = useState<PlanName>('PROFESSIONAL');
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString().slice(0, 10));

  const [coupon, setCoupon] = useState('');
  const [newCoupon, setNewCoupon] = useState('');
  const [couponPercent, setCouponPercent] = useState('');
  const [couponExpiry, setCouponExpiry] = useState('');

  const [monthly, setMonthly] = useState('');
  const [unit, setUnit] = useState('');
  const [expires, setExpires] = useState('');
  const [reason, setReason] = useState('');

  const [billingProvider, setBillingProvider] = useState<'MANUAL' | 'STRIPE' | 'IYZICO'>('MANUAL');
  const [eventType, setEventType] = useState<'INVOICE_OPEN' | 'INVOICE_PAID' | 'INVOICE_FAILED'>('INVOICE_OPEN');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');

  // Queries
  const tenantQuery = useQuery({
    queryKey: ['admin', 'tenant', tenantId],
    queryFn: () => getTenantById(tenantId),
  });

  const query = useQuery({
    queryKey: ['admin', 'subscription', tenantId],
    queryFn: () => getSubscription(tenantId),
  });

  const revenue = useQuery({
    queryKey: ['admin', 'revenue'],
    queryFn: getRevenueOverview,
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'subscription', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'revenue'] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenant', tenantId] }),
    ]);
    toast.success('Abonelik ve gelir verileri güncellendi.');
  };

  // Mutations
  const quote = useMutation({
    mutationFn: () => quoteSubscriptionPlan(tenantId, plan, iso(effectiveAt)),
    onSuccess: () => toast.info('Plan ön hesaplaması hazırlandı.'),
    onError: (err: unknown) => toastAdminError(err, 'Plan ön hesabı alınamadı.'),
  });

  const reconcile = useMutation({
    mutationFn: () => reconcileSubscription(tenantId),
    onSuccess: async () => {
      toast.success('Modül lisansları planla başarıyla eşitlendi.');
      await refresh();
    },
    onError: (err: unknown) => toastAdminError(err, 'Mutabakat işlemi gerçekleştirilemedi.'),
  });

  const applyCoupon = useMutation({
    mutationFn: () => applySubscriptionCoupon(tenantId, coupon.trim()),
    onSuccess: async () => {
      toast.success('İndirim kuponu aboneliğe uygulandı.');
      setCoupon('');
      await refresh();
    },
    onError: (err: unknown) => toastAdminError(err, 'Kupon uygulanamadı. Geçersiz veya süresi dolmuş olabilir.'),
  });

  const createCoupon = useMutation({
    mutationFn: () =>
      createSubscriptionCoupon({
        code: newCoupon.trim().toUpperCase(),
        percent: Number(couponPercent),
        expiresAt: iso(couponExpiry),
      }),
    onSuccess: () => {
      toast.success('Yeni kupon tanımlandı.');
      setNewCoupon('');
      setCouponPercent('');
      setCouponExpiry('');
    },
    onError: (err: unknown) => toastAdminError(err, 'Kupon oluşturulamadı.'),
  });

  const price = useMutation({
    mutationFn: () =>
      requestSubscriptionPrice(tenantId, {
        monthlyAmount: Number(monthly),
        unitPrice: unit ? Number(unit) : null,
        expiresAt: iso(expires),
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      toast.success('Özel fiyat talebi 4-göz onay kuyruğuna gönderildi.');
      setMonthly('');
      setUnit('');
      setExpires('');
      setReason('');
      await refresh();
    },
    onError: (err: unknown) => toastAdminError(err, 'Fiyat talebi iletilemedi.'),
  });

  const decision = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 'approve' | 'reject' }) =>
      decideSubscriptionPrice(tenantId, id, value),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.value === 'approve'
          ? 'Özel fiyat onaylandı ve yürürlüğe girdi.'
          : 'Özel fiyat talebi reddedildi.',
      );
      await refresh();
    },
    onError: (err: unknown) => toastAdminError(err, 'İşlem tamamlanamadı.'),
  });

  const event = useMutation({
    mutationFn: () =>
      recordBillingEvent({
        provider: billingProvider,
        providerEventId: crypto.randomUUID(),
        tenantId,
        type: eventType,
        providerInvoiceId: invoiceId.trim(),
        amount: Number(amount),
        currency: 'TRY',
        dueAt: new Date().toISOString(),
        ...(eventType === 'INVOICE_FAILED' ? { failureReason: 'Tahsilat başarısız (manuel kayıt)' } : {}),
      }),
    onSuccess: async () => {
      toast.success('Fatura olayı kaydedildi ve işlendi.');
      setInvoiceId('');
      setAmount('');
      await refresh();
    },
    onError: (err: unknown) => toastAdminError(err, 'Fatura olayı işlenemedi.'),
  });

  const tenant = tenantQuery.data;
  const data = query.data;
  const snapshot = data?.snapshot;
  const customPrices = data?.customPrices ?? [];
  const isRefreshing = query.isFetching || revenue.isFetching;

  const planBadge = snapshot ? PLAN_BADGES[snapshot.plan] ?? PLAN_BADGES.STARTER : PLAN_BADGES.STARTER;
  const stateBadge = snapshot ? STATE_BADGES[snapshot.state] ?? STATE_BADGES.ACTIVE : STATE_BADGES.ACTIVE;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb & Return Link */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Link href="/admin" className="hover:text-slate-200 transition-colors">
            Axon Admin
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <Link href="/admin/tenants" className="hover:text-slate-200 transition-colors">
            Tenantlar
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <Link href={`/admin/tenants/${tenantId}`} className="hover:text-slate-200 transition-colors font-medium">
            {tenant?.companyName ?? tenantId.slice(0, 8)}
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="font-semibold text-slate-200">Abonelik & Gelir</span>
        </div>

        <Link
          href={`/admin/tenants/${tenantId}`}
          className="inline-flex items-center gap-1.5 font-semibold text-red-400 hover:text-red-300 transition-colors"
        >
          <span>← Tenant Detayına Dön</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-rose-600/20 text-rose-400 ring-1 ring-rose-500/30 shadow-inner">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Abonelik & Gelir Operasyonları
              </h1>
              {snapshot && (
                <span className={cn('rounded-lg border px-2.5 py-0.5 text-xs font-semibold', planBadge.badgeClass)}>
                  {planBadge.label} Planı
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {tenant ? `${tenant.companyName} (${tenant.slug})` : 'Tenant'} için faturalama, kıstelyevm ön hesabı, kupon ve gelir yönetimi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={refresh}
            loading={isRefreshing}
            leftIcon={<RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* KPI & Revenue Strip (Platform Revenue + Tenant Snapshot) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Monthly & Annual Value */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tenant MRR / ARR</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {snapshot ? formatCurrency(snapshot.mrr, snapshot.currency) : '—'}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>ARR: {snapshot ? formatCurrency(snapshot.arr, snapshot.currency) : '—'}</span>
            <span className="text-slate-500">• {snapshot?.provider ?? 'MANUAL'}</span>
          </div>
        </div>

        {/* Metric 2: Plan State */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Abonelik Durumu</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
            <span className="text-xs text-slate-400 font-mono">
              {snapshot?.customPricingExpiresAt ? 'Özel Fiyat' : 'Standart Tarife'}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-400">
            {snapshot?.discount
              ? `Kupon: ${snapshot.discount.code} (%${snapshot.discount.percent})`
              : 'Aktif indirim kuponu yok'}
          </div>
        </div>

        {/* Metric 3: Dunning / Collection Retries */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tahsilat / Dunning</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {snapshot ? `${snapshot.dunningAttempt} Deneme` : '0 Deneme'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {snapshot?.nextRetryAt ? `Sonraki: ${formatDateTime(snapshot.nextRetryAt)}` : 'Gecikmiş tahsilat yok'}
          </div>
        </div>

        {/* Metric 4: Platform Wide Overview */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Platform Toplam MRR</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {revenue.data ? formatCurrency(revenue.data.mrr) : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {revenue.data ? `${revenue.data.activeSubscriptions} aktif abonelik genelinde` : 'Gelir tablosu'}
          </div>
        </div>
      </div>

      {/* Snapshot Summary Detail Card */}
      {snapshot && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">Mevcut Abonelik Özeti</h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Provider ID: {snapshot.providerCustomerId ?? 'Manuel Havale'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Aylık Fatura</span>
              <p className="mt-1 text-sm font-bold text-white">
                {formatCurrency(snapshot.monthlyAmount, snapshot.currency)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Kullanıcı Başı Fiyat</span>
              <p className="mt-1 text-sm font-bold text-white">
                {snapshot.customUnitPrice ? formatCurrency(snapshot.customUnitPrice, snapshot.currency) : 'Standart'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Kupon / İndirim</span>
              <p className="mt-1 text-sm font-bold text-white">
                {snapshot.discount ? `${snapshot.discount.code} (%${snapshot.discount.percent})` : 'Uygulanmadı'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Özel Fiyat Bitişi</span>
              <p className="mt-1 text-sm font-bold text-white">
                {formatDateTime(snapshot.customPricingExpiresAt)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-1">
        {[
          { key: 'quote', label: 'Plan Ön Hesabı (Proration)', icon: CalculatorIcon },
          { key: 'reconcile', label: 'Modül Lisans Mutabakatı', icon: Layers },
          { key: 'coupons', label: 'Kupon & Özel Fiyat Talepleri', icon: Tag },
          { key: 'invoices', label: 'Fatura & Sağlayıcı Olayları', icon: FileText },
        ].map((tab) => {
          const isSelected = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all',
                isSelected
                  ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Quote / Plan Change Proration Calculation */}
      {activeTab === 'quote' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur">
            <div className="mb-4">
              <h2 className="text-base font-bold text-white">Plan Değişikliği ve Kıstelyevm (Proration) Hesabı</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Yeni plana geçişte kalan gün farkı, kullanıcı katsayısı ve modül değişimlerini yürürlüğe girmeden önce hesaplayın.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as PlanName)}
                className="h-10 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-red-500"
              >
                <option value="STARTER">Starter Planı</option>
                <option value="PROFESSIONAL">Professional Planı</option>
                <option value="ENTERPRISE">Enterprise Planı</option>
              </select>

              <input
                type="date"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                className="h-10 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-red-500"
              />

              <Button
                variant="primary"
                size="md"
                onClick={() => quote.mutate()}
                loading={quote.isPending}
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                Kıstelyevm Farkını Hesapla
              </Button>
            </div>

            {quote.data && (
              <div className="mt-5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-sky-200">Hesaplanan Plan Değişim Özeti</h3>
                    <p className="text-xs text-sky-300/80">
                      {quote.data.fromPlan} → {quote.data.toPlan} geçişi
                    </p>
                  </div>
                  <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-bold text-sky-200">
                    {quote.data.activeUsers} Aktif Kullanıcı
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl bg-slate-950/60 p-3 border border-sky-500/20">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Mevcut Aylık Tutar</span>
                    <p className="mt-1 text-base font-bold text-white">
                      {formatCurrency(quote.data.currentMonthly, quote.data.currency)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-950/60 p-3 border border-sky-500/20">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Yeni Aylık Tutar</span>
                    <p className="mt-1 text-base font-bold text-white">
                      {formatCurrency(quote.data.nextMonthly, quote.data.currency)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-950/60 p-3 border border-sky-500/20">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Tahakkuk Edecek Kıstelyevm Farkı
                    </span>
                    <p className="mt-1 text-base font-bold text-emerald-400">
                      {formatCurrency(quote.data.proratedAmount, quote.data.currency)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs pt-1">
                  <div className="rounded-xl bg-slate-950/60 p-3 border border-sky-500/20">
                    <span className="text-emerald-400 font-semibold block mb-1.5">
                      ✓ Yeni Açılacak Modüller ({quote.data.moduleChanges.added.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {quote.data.moduleChanges.added.length > 0 ? (
                        quote.data.moduleChanges.added.map((m) => (
                          <span
                            key={m}
                            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-300"
                          >
                            {m}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500 text-[11px]">Eklenen modül yok</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-950/60 p-3 border border-sky-500/20">
                    <span className="text-rose-400 font-semibold block mb-1.5">
                      ✕ Kapanacak Modüller ({quote.data.moduleChanges.removed.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {quote.data.moduleChanges.removed.length > 0 ? (
                        quote.data.moduleChanges.removed.map((m) => (
                          <span
                            key={m}
                            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono text-rose-300"
                          >
                            {m}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500 text-[11px]">Kapanan modül yok</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Entitlement Reconciliation */}
      {activeTab === 'reconcile' && snapshot && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">Modül & Yetki (Entitlement) Mutabakatı</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tenantın tanımlı abonelik planındaki beklenen modülleri ile gerçekte aktif olan modülleri karşılaştırın.
                </p>
              </div>

              {canAdmin(admin, 'tenant.settings.update') && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => reconcile.mutate()}
                  loading={reconcile.isPending}
                  disabled={!snapshot.missingModules.length && !snapshot.extraModules.length}
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                >
                  Planla Eşitle (Mutabakat Sağla)
                </Button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <span className="font-bold text-slate-200 block">
                  Beklenen Modüller ({snapshot.expectedModules.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.expectedModules.map((m) => (
                    <span
                      key={m}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-300"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <span className="font-bold text-slate-200 block">
                  Gerçekte Aktif Modüller ({snapshot.actualModules.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.actualModules.map((m) => (
                    <span
                      key={m}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-300"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {snapshot.missingModules.length > 0 && (
                <div className="col-span-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                  <span className="font-bold text-rose-300 block mb-1">
                    ⚠ Planda Olup Tenantta Eksik Olan Modüller ({snapshot.missingModules.length})
                  </span>
                  <p className="text-xs text-rose-200/80 mb-2">
                    Aşağıdaki modüller müşterinin lisansında var ancak tenant veritabanında aktif değil:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {snapshot.missingModules.map((m) => (
                      <span
                        key={m}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-2.5 py-1 text-xs font-mono font-bold text-rose-200"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.extraModules.length > 0 && (
                <div className="col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <span className="font-bold text-amber-300 block mb-1">
                    ⚠ Planda Olmayıp Tenantta Fazladan Açık Modüller ({snapshot.extraModules.length})
                  </span>
                  <p className="text-xs text-amber-200/80 mb-2">
                    Müşterinin mevcut paketinde bulunmayan modüller:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {snapshot.extraModules.map((m) => (
                      <span
                        key={m}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-mono font-bold text-amber-200"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.missingModules.length === 0 && snapshot.extraModules.length === 0 && (
                <div className="col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-300">Modül Yetkileri %100 Uyumlu</p>
                    <p className="text-xs text-emerald-200/80">
                      Tenantın modül yetkileri satın alınan {snapshot.plan} planı ile tam senkronizedir.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Coupons & Custom Pricing 4-Eyes Governance */}
      {activeTab === 'coupons' && (
        <div className="space-y-6">
          {/* Apply & Create Coupon Box */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Apply coupon */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Percent className="h-4 w-4 text-emerald-400" />
                  <span>Tenanta İndirim Kuponu Uygula</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mevcut bir kupon kodunu bu tenantın aboneliğine tanımlayın.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Kupon Kodu (Örn: SUMMER50)"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500 uppercase font-mono"
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => applyCoupon.mutate()}
                  loading={applyCoupon.isPending}
                  disabled={!coupon.trim()}
                >
                  Uygula
                </Button>
              </div>
            </div>

            {/* Create new coupon */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="h-4 w-4 text-sky-400" />
                  <span>Yeni İndirim Kuponu Oluştur</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Platform genelinde kullanılabilecek yeni indirim kodu tanımlayın.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Kod (Örn: PROMO20)"
                  value={newCoupon}
                  onChange={(e) => setNewCoupon(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500 uppercase font-mono"
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="İndirim % (1-100)"
                  value={couponPercent}
                  onChange={(e) => setCouponPercent(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                />
                <input
                  type="date"
                  value={couponExpiry}
                  onChange={(e) => setCouponExpiry(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-red-500"
                />
              </div>

              <Button
                variant="outline"
                size="md"
                onClick={() => createCoupon.mutate()}
                loading={createCoupon.isPending}
                disabled={!newCoupon || !couponPercent || !couponExpiry}
                className="w-full"
              >
                Kuponu Kaydet
              </Button>
            </div>
          </div>

          {/* Custom Price Request Form */}
          {canAdmin(admin, 'tenant.plan.update') && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-400" />
                  <span>Özel Fiyatlandırma Talebi (4-Göz Prensibi)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Standart liste fiyatları dışında bir fiyat teklif edildiğinde onay için ikinci bir yönetici değerlendirmesi gereklidir.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
                <input
                  type="number"
                  placeholder="Aylık Sabit Tutar (TRY) *"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                />
                <input
                  type="number"
                  placeholder="Kullanıcı Başı Ek Fiyat (Opsiyonel)"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                />
                <input
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-red-500"
                />
                <input
                  type="text"
                  placeholder="Teklif Gerekçesi (En az 10 karakter) *"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={() => price.mutate()}
                loading={price.isPending}
                disabled={!monthly || !expires || reason.trim().length < 10}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Onay Kuyruğuna Gönder
              </Button>
            </div>
          )}

          {/* Custom Prices List */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur space-y-3">
            <h3 className="text-sm font-bold text-white">Geçmiş ve Bekleyen Özel Fiyat Talepleri</h3>

            {customPrices.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Henüz özel fiyat teklifi oluşturulmadı.
              </p>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {customPrices.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {formatCurrency(item.monthlyAmount)} / Ay
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[10px] font-bold border',
                            item.state === 'APPLIED'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : item.state === 'PENDING'
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
                          )}
                        >
                          {item.state}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          Son Geçerlilik: {formatDateTime(item.expiresAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300 text-xs">Gerekçe: {item.reason}</p>
                    </div>

                    {item.state === 'PENDING' && canAdmin(admin, 'tenant.plan.approve') && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={item.requestedById === admin?.id || decision.isPending}
                          onClick={() => decision.mutate({ id: item.id, value: 'approve' })}
                          className="bg-emerald-600 hover:bg-emerald-500"
                        >
                          Onayla
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={item.requestedById === admin?.id || decision.isPending}
                          onClick={() => decision.mutate({ id: item.id, value: 'reject' })}
                        >
                          Reddet
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Invoices & Provider Events */}
      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* Record Billing Event Form */}
          {canAdmin(admin, 'tenant.plan.update') && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-400" />
                  <span>Manuel Sağlayıcı / Fatura Olayı İşle</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Havale veya harici ödeme sağlayıcılarından gelen fatura açılış veya tahsilat bildirimlerini sisteme kaydedin.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
                <select
                  value={billingProvider}
                  onChange={(e) => setBillingProvider(e.target.value as typeof billingProvider)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-red-500"
                >
                  <option value="MANUAL">MANUAL (Havale / EFT)</option>
                  <option value="STRIPE">STRIPE Entegrasyonu</option>
                  <option value="IYZICO">IYZICO Entegrasyonu</option>
                </select>

                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as typeof eventType)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-red-500"
                >
                  <option value="INVOICE_OPEN">INVOICE_OPEN (Fatura Açıldı)</option>
                  <option value="INVOICE_PAID">INVOICE_PAID (Ödeme Alındı)</option>
                  <option value="INVOICE_FAILED">INVOICE_FAILED (Ödeme Başarısız)</option>
                </select>

                <input
                  type="text"
                  placeholder="Fatura No / ID (Örn: INV-2026-001)"
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500 font-mono"
                />

                <input
                  type="number"
                  placeholder="Tutar (TRY) *"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={() => event.mutate()}
                loading={event.isPending}
                disabled={!invoiceId || !amount}
              >
                Olayı Sisteme İşle
              </Button>
            </div>
          )}

          {/* Invoices List Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-sm backdrop-blur">
            <div className="grid grid-cols-12 gap-3 border-b border-slate-800/80 bg-slate-950/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <div className="col-span-3">Fatura ID</div>
              <div className="col-span-3">Tutar</div>
              <div className="col-span-2">Durum</div>
              <div className="col-span-2">Vade / Tarih</div>
              <div className="col-span-2 text-right">Açıklama</div>
            </div>

            {!snapshot || snapshot.invoices.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                Kayıtlı fatura bulunamadı.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {snapshot.invoices.map((inv) => {
                  const statusConfig = INVOICE_STATUS_MAP[inv.status] ?? {
                    label: inv.status,
                    badgeClass: 'text-slate-400 bg-slate-800 border-slate-700',
                  };
                  return (
                    <div
                      key={inv.id}
                      className="grid grid-cols-12 gap-3 items-center px-5 py-3 text-xs transition-colors hover:bg-slate-800/30"
                    >
                      <div className="col-span-3 font-mono text-slate-200 truncate">
                        {inv.providerInvoiceId ?? inv.id.slice(0, 16)}
                      </div>
                      <div className="col-span-3 font-bold text-white">
                        {formatCurrency(inv.amount, inv.currency)}
                      </div>
                      <div className="col-span-2">
                        <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold border', statusConfig.badgeClass)}>
                          {statusConfig.label}
                        </span>
                      </div>
                      <div className="col-span-2 text-slate-400 text-[11px]">
                        {formatDateTime(inv.dueAt)}
                      </div>
                      <div className="col-span-2 text-right text-slate-500 text-[11px] truncate">
                        {inv.failureReason ?? '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalculatorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  );
}
