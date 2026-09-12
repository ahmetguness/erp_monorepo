'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Ticket,
  Plus,
  X,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  ToggleLeft,
  CalendarDays,
  Users,
  Layers,
  Percent,
  SlidersHorizontal,
  Tag,
  ShieldCheck,
  Clock,
  Sparkles,
  RefreshCw,
  Building2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  getCoupons,
  createAdminCoupon,
  deactivateAdminCoupon,
  type BillingCoupon,
  type CouponPlan,
  type CreateCouponInput,
  type CouponDiscount,
} from '@/services/admin.service';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui.store';
import { extractAdminError, isReauthRequired, toastAdminError } from '@/lib/admin/errors';
import { AdminPageHeader, AdminKpiCard, AdminKpiGrid } from '@/components/features/admin/ui';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateCouponCode(customPrefix?: string, plan?: CouponPlan | null, percent?: number): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  let prefix = customPrefix?.toUpperCase().trim();
  if (!prefix) {
    if (plan === 'STARTER') prefix = 'START';
    else if (plan === 'PROFESSIONAL') prefix = 'PRO';
    else if (plan === 'ENTERPRISE') prefix = 'ENT';
    else prefix = 'AXON';
  }

  const pct = percent && percent > 0 ? percent : '';
  return `${prefix}${pct}-${randomPart}`;
}

const PLAN_META: Record<CouponPlan, { label: string; color: string; bg: string; ring: string }> = {
  STARTER: {
    label: 'Starter',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    ring: 'ring-sky-500/30',
  },
  PROFESSIONAL: {
    label: 'Professional',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    ring: 'ring-violet-500/30',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-500/30',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isExpired(iso: string) {
  return new Date(iso) < new Date();
}

function daysLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Kopyala"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── PlanBadge ─────────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: CouponPlan | null }) {
  if (!plan)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-600/50">
        <Layers className="h-3 w-3" />
        Tüm Planlar
      </span>
    );
  const meta = PLAN_META[plan];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1', meta.bg, meta.color, meta.ring)}>
      <Tag className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ coupon }: { coupon: BillingCoupon }) {
  const expired = isExpired(coupon.expiresAt);
  const exhausted = coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions;

  if (!coupon.isActive)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-600/40">
        <XCircle className="h-3 w-3" /> Pasif
      </span>
    );
  if (expired)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
        <Clock className="h-3 w-3" /> Süresi Doldu
      </span>
    );
  if (exhausted)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
        <AlertTriangle className="h-3 w-3" /> Limit Doldu
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
      <CheckCircle2 className="h-3 w-3" /> Aktif
    </span>
  );
}

// ── CreateCouponModal ─────────────────────────────────────────────────────────

function CreateCouponModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateCouponInput>(() => ({
    code: '',
    percent: 10,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
    maxRedemptions: undefined,
    plan: null,
    description: '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  const mutation = useMutation({
    mutationFn: createAdminCoupon,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(extractAdminError(err, 'Kupon oluşturulurken bir hata oluştu.'));
      setMfaRequired(isReauthRequired(err));
    },
  });

  const fieldClass =
    'w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20';
  const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-400';

  const handleGenerate = (customPrefix?: string) => {
    const code = generateCouponCode(customPrefix, form.plan, form.percent);
    setForm((f) => ({ ...f, code }));
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMfaRequired(false);
    const payload: CreateCouponInput = {
      ...form,
      code: form.code.toUpperCase().trim(),
      expiresAt: new Date(form.expiresAt).toISOString(),
      plan: form.plan ?? null,
      description: form.description || undefined,
      maxRedemptions: form.maxRedemptions ?? undefined,
    };
    mutation.mutate(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/30">
              <Ticket className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Yeni Kupon Oluştur</h2>
              <p className="text-[10px] text-slate-400">İndirim kuponu tanımla ve plan kısıtlaması belirle</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Code + Percent */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-400">Kupon Kodu *</label>
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  className="flex items-center gap-1 text-[11px] font-semibold text-red-400 transition hover:text-red-300"
                >
                  <Sparkles className="h-3 w-3" />
                  Rastgele Üret
                </button>
              </div>
              <div className="relative">
                <input
                  className={cn(fieldClass, 'font-mono uppercase tracking-wider pr-10')}
                  placeholder="SUMMER25"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[A-Z0-9_-]+"
                  title="Büyük harf, rakam, - ve _ kullanabilirsiniz"
                />
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  title="Yeni kod üret"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Quick prefix chips */}
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500">Şablon:</span>
                {['AXON', 'PROMO', 'VIP', 'INDIRIM'].map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => handleGenerate(pref)}
                    className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 ring-1 ring-slate-700/60 transition hover:bg-slate-700 hover:text-white"
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>İndirim Yüzdesi (%) *</label>
              <div className="relative">
                <input
                  type="number"
                  className={cn(fieldClass, 'pr-8')}
                  placeholder="10"
                  min={1}
                  max={100}
                  value={form.percent}
                  onChange={(e) => setForm((f) => ({ ...f, percent: Number(e.target.value) }))}
                  required
                />
                <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
          </div>

          {/* Plan restriction */}
          <div>
            <label className={labelClass}>Plan Kısıtlaması</label>
            <div className="grid grid-cols-4 gap-2">
              {([null, 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as (CouponPlan | null)[]).map((p) => {
                const label = p === null ? 'Tümü' : PLAN_META[p].label;
                const selected = form.plan === p;
                return (
                  <button
                    key={String(p)}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, plan: p }))}
                    className={cn(
                      'rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all',
                      selected
                        ? 'border-red-500/60 bg-red-500/10 text-red-300 ring-1 ring-red-500/20'
                        : 'border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {form.plan && (
              <p className="mt-1.5 text-[10px] text-amber-400/80">
                ⚠ Bu kupon yalnızca <strong>{PLAN_META[form.plan].label}</strong> planındaki tenantlara uygulanabilir.
              </p>
            )}
          </div>

          {/* Expires + Max Redemptions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Bitiş Tarihi *</label>
              <input
                type="datetime-local"
                className={fieldClass}
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Maks. Kullanım (İsteğe Bağlı)</label>
              <input
                type="number"
                className={fieldClass}
                placeholder="Sınırsız"
                min={1}
                value={form.maxRedemptions ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxRedemptions: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Açıklama / Not (İsteğe Bağlı)</label>
            <textarea
              className={cn(fieldClass, 'resize-none')}
              rows={2}
              placeholder="Kampanya adı, hedef kitle, özel notlar…"
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {error && (
            <div className="space-y-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                <span className="flex-1 whitespace-pre-line leading-relaxed">{error}</span>
              </div>
              {mfaRequired && (
                <div className="pt-0.5 pl-5">
                  <a
                    href="/admin/sessions?reauth=1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-500/30 active:scale-95"
                  >
                    🔐 MFA Doğrulama Sayfasına Git (Yeni Sekme) →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2 text-xs font-semibold text-white shadow transition hover:bg-red-400 disabled:opacity-60"
            >
              {mutation.isPending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Oluşturuluyor…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Kuponu Oluştur
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── RedeemedTenantsList ───────────────────────────────────────────────────────

function RedeemedTenantsList({ discounts, totalCount }: { discounts?: CouponDiscount[]; totalCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const items = discounts ?? [];
  const count = items.length > 0 ? items.length : totalCount;

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-[11px] text-slate-500">
        <Building2 className="h-3.5 w-3.5 text-slate-600 shrink-0" />
        <span>Henüz hiçbir tenant bu kuponu kullanmadı</span>
      </div>
    );
  }

  const visibleItems = expanded ? items : items.slice(0, 2);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Building2 className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span>Kullanan Tenantlar</span>
          <span className="ml-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/20">
            {count}
          </span>
        </div>
        {items.length > 2 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-300 transition"
          >
            <span>{expanded ? 'Daha az göster' : `Tümü (${items.length})`}</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {visibleItems.map((discount) => {
          const t = discount.tenant;
          const planMeta = t.plan === 'STARTER'
            ? { bg: 'bg-sky-500/10', text: 'text-sky-400', ring: 'ring-sky-500/20' }
            : t.plan === 'PROFESSIONAL'
              ? { bg: 'bg-violet-500/10', text: 'text-violet-400', ring: 'ring-violet-500/20' }
              : t.plan === 'ENTERPRISE'
                ? { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/20' }
                : { bg: 'bg-slate-800', text: 'text-slate-400', ring: 'ring-slate-700' };

          return (
            <div
              key={discount.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs ring-1 ring-slate-800/70 transition hover:bg-slate-850 hover:ring-slate-700/80"
            >
              <Link
                href={`/admin/tenants/${discount.tenantId}`}
                className="flex items-center gap-1.5 min-w-0 text-slate-200 hover:text-white group/t"
                title={`${t.companyName} tenant detayını aç`}
              >
                <span className="truncate font-medium text-xs group-hover/t:text-red-400 transition">
                  {t.companyName || t.slug}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-500 group-hover/t:text-red-400 transition" />
              </Link>
              <div className="flex items-center gap-2 shrink-0 text-[10px]">
                <span className="text-slate-500 font-mono">
                  {new Date(discount.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1', planMeta.bg, planMeta.text, planMeta.ring)}>
                  {t.plan}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CouponCard ────────────────────────────────────────────────────────────────

function CouponCard({ coupon, onDeactivate }: { coupon: BillingCoupon; onDeactivate: (id: string) => void }) {
  const expired = isExpired(coupon.expiresAt);
  const canDeactivate = coupon.isActive && !expired;
  const days = daysLeft(coupon.expiresAt);
  const usagePercent =
    coupon.maxRedemptions !== null
      ? Math.min(100, Math.round((coupon.redemptionCount / coupon.maxRedemptions) * 100))
      : null;

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-4 rounded-2xl border p-5 transition-all duration-200',
        coupon.isActive && !expired
          ? 'border-slate-700/60 bg-gradient-to-br from-slate-900 to-slate-900/80 hover:border-slate-600/80 hover:shadow-lg hover:shadow-black/30'
          : 'border-slate-800/40 bg-slate-900/40 opacity-70',
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold tracking-wider text-white">{coupon.code}</span>
            <CopyButton text={coupon.code} />
          </div>
          {coupon.description && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{coupon.description}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge coupon={coupon} />
          <PlanBadge plan={coupon.plan} />
        </div>
      </div>

      {/* Discount hero */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 ring-1 ring-red-500/30">
          <span className="text-2xl font-black text-red-400">%{coupon.percent}</span>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          {/* Kullanım */}
          <div className="rounded-xl bg-slate-800/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-1">
              <Users className="h-3 w-3" /> Kullanım
            </div>
            <div className="text-sm font-bold text-slate-200">
              {coupon.redemptionCount}
              {coupon.maxRedemptions !== null && (
                <span className="text-xs font-normal text-slate-400"> / {coupon.maxRedemptions}</span>
              )}
            </div>
          </div>
          {/* Aktif İndirim */}
          <div className="rounded-xl bg-slate-800/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-1">
              <ShieldCheck className="h-3 w-3" /> Aktif
            </div>
            <div className="text-sm font-bold text-slate-200">{coupon._count.discounts}</div>
          </div>
          {/* Kalan Gün */}
          <div className="rounded-xl bg-slate-800/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-1">
              <CalendarDays className="h-3 w-3" /> Gün
            </div>
            <div className={cn('text-sm font-bold', expired ? 'text-rose-400' : days <= 7 ? 'text-amber-400' : 'text-slate-200')}>
              {expired ? 'Sona Erdi' : days}
            </div>
          </div>
        </div>
      </div>

      {/* Usage progress bar */}
      {usagePercent !== null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>Kullanım oranı</span>
            <span>{usagePercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                usagePercent >= 100
                  ? 'bg-rose-500'
                  : usagePercent >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500',
              )}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Redeemed Tenants List */}
      <RedeemedTenantsList discounts={coupon.discounts} totalCount={coupon._count.discounts} />

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
        <span className="text-[10px] text-slate-500">
          Son geçerlilik:{' '}
          <span className={cn('font-medium', expired ? 'text-rose-400' : 'text-slate-400')}>
            {formatDate(coupon.expiresAt)}
          </span>
        </span>
        {canDeactivate && (
          <button
            type="button"
            onClick={() => onDeactivate(coupon.id)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-[10px] font-medium text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <ToggleLeft className="h-3 w-3" />
            Devre Dışı Bırak
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type FilterPlan = 'ALL' | CouponPlan;
type FilterStatus = 'ALL' | 'ACTIVE' | 'INACTIVE';

export default function CouponsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterPlan, setFilterPlan] = useState<FilterPlan>('ALL');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => getCoupons(),
    refetchInterval: 60_000,
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateAdminCoupon,
    onSuccess: () => {
      toast.success('Kupon başarıyla pasife alındı.');
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
    onError: (err: unknown) => {
      toastAdminError(err, 'Kupon pasife alınırken bir sorun oluştu.');
    },
  });

  const filtered = useMemo(() => {
    return coupons.filter((c) => {
      if (search) {
        const q = search.toLowerCase().trim();
        const matchesCode = c.code.toLowerCase().includes(q);
        const matchesDesc = c.description?.toLowerCase().includes(q);
        const matchesTenant = c.discounts?.some(
          (d) =>
            d.tenant.companyName.toLowerCase().includes(q) ||
            d.tenant.slug.toLowerCase().includes(q),
        );
        if (!matchesCode && !matchesDesc && !matchesTenant) return false;
      }
      if (filterPlan !== 'ALL' && c.plan !== filterPlan) return false;
      if (filterStatus === 'ACTIVE' && (!c.isActive || isExpired(c.expiresAt))) return false;
      if (filterStatus === 'INACTIVE' && c.isActive && !isExpired(c.expiresAt)) return false;
      return true;
    });
  }, [coupons, search, filterPlan, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const active = coupons.filter((c) => c.isActive && !isExpired(c.expiresAt));
    const totalRedemptions = coupons.reduce((s, c) => s + c.redemptionCount, 0);
    const expiringSoon = active.filter((c) => daysLeft(c.expiresAt) <= 7);
    return { total: coupons.length, active: active.length, totalRedemptions, expiringSoon: expiringSoon.length };
  }, [coupons]);

  const tabClass = (v: string, current: string) =>
    cn(
      'rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
      v === current
        ? 'bg-slate-700/80 text-white shadow-inner'
        : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300',
    );

  return (
    <div className="space-y-4 pb-10">
      {/* Page Header */}
      <AdminPageHeader
        title="Kupon Yönetimi"
        description="Plan bazlı indirim kuponları oluştur, izle ve yönet."
        icon={Ticket}
        iconTone="red"
        badge={
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            {stats.total} Kupon
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-red-500"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Yeni Kupon</span>
          </button>
        }
      />

      {/* KPI Cards */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Toplam Kupon"
          value={stats.total}
          icon={Ticket}
          iconTone="slate"
          subtext="Sistemdeki tüm kuponlar"
        />

        <AdminKpiCard
          label="Aktif Kupon"
          value={stats.active}
          icon={CheckCircle2}
          iconTone="emerald"
          subtext={<span className="text-emerald-400 font-medium">Kullanıma açık kuponlar</span>}
        />

        <AdminKpiCard
          label="Toplam Kullanım"
          value={stats.totalRedemptions}
          icon={Users}
          iconTone="sky"
          subtext="Uygulanan indirim sayısı"
        />

        <AdminKpiCard
          label="7 Günde Bitiyor"
          value={stats.expiringSoon}
          icon={AlertTriangle}
          iconTone="amber"
          subtext={<span className={stats.expiringSoon > 0 ? 'text-amber-400 font-medium' : 'text-slate-400'}>Süresi dolmak üzere</span>}
        />
      </AdminKpiGrid>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-700/50 bg-slate-900/40 px-4 py-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full rounded-xl border border-slate-700/60 bg-slate-800/60 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 outline-none transition focus:border-red-500/40 focus:ring-1 focus:ring-red-500/10"
            placeholder="Kupon kodu, açıklama veya kullanan tenant ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Plan filter */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-800/50 p-1">
          {(['ALL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as FilterPlan[]).map((p) => (
            <button key={p} type="button" className={tabClass(p, filterPlan)} onClick={() => setFilterPlan(p)}>
              {p === 'ALL' ? 'Tümü' : PLAN_META[p].label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-800/50 p-1">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as FilterStatus[]).map((s) => (
            <button key={s} type="button" className={tabClass(s, filterStatus)} onClick={() => setFilterStatus(s)}>
              {s === 'ALL' ? 'Tüm Durumlar' : s === 'ACTIVE' ? 'Aktif' : 'Pasif'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <SlidersHorizontal className="h-3 w-3" />
          {filtered.length}/{coupons.length} kupon
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <span className="text-xs">Kuponlar yükleniyor…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-700/60 py-16 text-center">
          <Ticket className="h-10 w-10 text-slate-700" />
          <div>
            <p className="text-sm font-semibold text-slate-400">
              {coupons.length === 0 ? 'Henüz kupon oluşturulmamış' : 'Filtre sonucu bulunamadı'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {coupons.length === 0
                ? '"Yeni Kupon" butonuyla ilk kuponu oluşturun'
                : 'Arama veya filtre kriterlerini değiştirin'}
            </p>
          </div>
          {coupons.length === 0 && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-2 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Kupon Oluştur
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((coupon) => (
            <CouponCard
              key={coupon.id}
              coupon={coupon}
              onDeactivate={(id) => deactivateMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateCouponModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
