'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  LifeBuoy,
  Building2,
  ExternalLink,
  ChevronRight,
  Search,
  ArrowLeft,
  ShieldCheck,
  Ticket,
  Clock,
  Sparkles,
  Copy,
  Check,
  Lock,
  Layers,
  FileText,
  AlertCircle,
  HelpCircle,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { getTenants, getTenantById, type TenantListItem } from '@/services/admin.service';
import { listAdminTickets } from '@/services/support-ticket.service';
import { AdminSupportSessions } from '@/components/features/admin/support-sessions/AdminSupportSessions';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { AdminPageHeader } from '@/components/features/admin/ui';
import type { PlatformSupportTicketSummaryDto } from '@repo/types';

function CopyableBadge({ label, value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Panoya kopyalamak için tıklayın"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/70 px-2.5 py-1 text-xs font-mono text-slate-300 transition-all hover:border-slate-600 hover:text-white group"
    >
      {label && <span className="text-[10px] uppercase font-sans font-semibold text-slate-500">{label}:</span>}
      <span className="font-semibold text-slate-200">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-slate-500 group-hover:text-slate-300 shrink-0" />
      )}
    </button>
  );
}

function SupportSessionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? '';
  const ticketId = searchParams.get('ticketId') ?? '';
  const admin = useAdminAuthStore((state) => state.admin);

  const [searchFilter, setSearchFilter] = useState('');

  const hasManagePermission = canAdmin(admin, 'support-session.manage');

  // If tenantId is provided, fetch specific tenant details
  const tenantQuery = useQuery({
    queryKey: ['admin', 'tenant-detail', tenantId],
    queryFn: () => getTenantById(tenantId),
    enabled: Boolean(tenantId && hasManagePermission),
    staleTime: 30_000,
  });

  // If ticketId is provided, look up ticket details
  const ticketQuery = useQuery({
    queryKey: ['admin', 'ticket-lookup', ticketId],
    queryFn: () => listAdminTickets({ search: ticketId }),
    enabled: Boolean(ticketId && hasManagePermission),
    staleTime: 30_000,
  });

  const matchingTicket: PlatformSupportTicketSummaryDto | undefined = useMemo(() => {
    const list = ticketQuery.data ?? [];
    return list.find((t) => t.ticketNumber === ticketId || t.id === ticketId) ?? list[0];
  }, [ticketQuery.data, ticketId]);

  // If no tenantId, fetch tenant list for selection
  const tenantsListQuery = useQuery({
    queryKey: ['admin', 'tenants-list', 'support-picker'],
    queryFn: () => getTenants({ limit: 100 }),
    enabled: Boolean(!tenantId && hasManagePermission),
    staleTime: 60_000,
  });

  const filteredTenants: TenantListItem[] = useMemo(() => {
    const list: TenantListItem[] = tenantsListQuery.data?.data ?? [];
    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase();
    return list.filter(
      (t: TenantListItem) =>
        t.companyName.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [tenantsListQuery.data?.data, searchFilter]);

  if (!hasManagePermission) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-8 text-center max-w-lg mx-auto mt-12">
        <ShieldCheck className="mx-auto h-12 w-12 text-red-400 mb-3" />
        <h2 className="text-lg font-bold text-white">Erişim Yetkisi Yetersiz</h2>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Destek oturumu başlatma ve yönetme için <code>support-session.manage</code> yetkisine sahip bir admin rolü gereklidir.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/admin" className="hover:text-slate-200 transition-colors">
            Admin
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <Link href="/admin/tickets" className="hover:text-slate-200 transition-colors">
            Destek Talepleri
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="text-indigo-400 font-semibold">Destek Oturumu Yönetimi</span>
        </div>

        <div className="flex items-center gap-2">
          {matchingTicket ? (
            <Link href={`/admin/tickets/${matchingTicket.id}`}>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
                className="text-xs"
              >
                Talebe Geri Dön ({matchingTicket.ticketNumber})
              </Button>
            </Link>
          ) : ticketId ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={() => router.back()}
              className="text-xs"
            >
              Talebe Geri Dön
            </Button>
          ) : null}

          {tenantId && (
            <Link href={`/admin/tenants/${encodeURIComponent(tenantId)}?tab=Destek`}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                className="text-xs"
              >
                Tenant 360
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Page Header */}
      <AdminPageHeader
        title="Güvenli Destek Oturumu Yönetimi"
        description="Kiracı yetkisiyle sınırlı, süre ayarlı ve doğrudan kiracı sahibi onayı gerektiren geçici destek oturumları oluşturun ve yönetin."
        icon={LifeBuoy}
        iconTone="indigo"
        badge={
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/20 flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" />
              Süre & Onay Korumalı
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
              Zero-Trust
            </span>
          </div>
        }
        actions={
          tenantId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/admin/support')}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Başka Tenant Seç
            </Button>
          ) : undefined
        }
      />

      {/* Dynamic Context Strip (Tenant + Linked Ticket) */}
      {tenantId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tenant Card */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">
                      {tenantQuery.data?.companyName ?? (tenantQuery.isPending ? 'Yükleniyor…' : tenantId)}
                    </span>
                    {tenantQuery.data?.plan && (
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.2 text-[9px] font-bold text-sky-400 ring-1 ring-sky-500/20">
                        {tenantQuery.data.plan}
                      </span>
                    )}
                    {tenantQuery.data?.status && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.2 text-[9px] font-bold',
                          tenantQuery.data.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
                        )}
                      >
                        {tenantQuery.data.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <CopyableBadge label="Tenant ID" value={tenantId} />
                  </div>
                </div>
              </div>
            </div>

            {/* Linked Ticket Card */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
                  <Ticket className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">
                      {matchingTicket ? matchingTicket.title : 'Bağlantılı Destek Talebi'}
                    </span>
                    {matchingTicket && (
                      <span className="rounded bg-indigo-500/10 px-1.5 py-0.2 text-[9px] font-bold text-indigo-400 ring-1 ring-indigo-500/20">
                        {matchingTicket.category}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <CopyableBadge label="Talep No" value={ticketId || matchingTicket?.ticketNumber || 'Belirtilmedi'} />
                    {matchingTicket && (
                      <Link
                        href={`/admin/tickets/${matchingTicket.id}`}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline inline-flex items-center gap-0.5"
                      >
                        Talebe Git
                        <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Main Support Area */}
      {tenantId ? (
        <AdminSupportSessions
          tenantId={tenantId}
          initialTicketId={ticketId || undefined}
        />
      ) : (
        /* Tenant Selection Mode */
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">İnceleme Yapılacak Kiracıyı Seçin</h2>
                <p className="text-xs text-slate-400">
                  Destek oturumu başlatmak veya mevcut oturumları incelemek istediğiniz firmayı listeden arayın.
                </p>
              </div>

              {/* Search Field */}
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Firma adı, slug veya ID ile ara..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-4 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Grid of Tenants */}
            {tenantsListQuery.isPending ? (
              <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <span>Tenant listesi yükleniyor…</span>
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Arama kriterine uygun kiracı bulunamadı.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      router.push(`/admin/support?tenantId=${encodeURIComponent(t.id)}`);
                    }}
                    className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 text-left transition-all hover:border-indigo-500/50 hover:bg-slate-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-200 group-hover:text-white transition-colors text-xs truncate">
                          {t.companyName}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[9px] font-semibold text-slate-400">
                          {t.plan}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 font-mono">{t.slug}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-900 pt-2.5 text-xs text-indigo-400 group-hover:text-indigo-300">
                      <span className="text-[11px] font-medium">Destek Oturumları</span>
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Security & Audit Principles Footer Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5">
        <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Destek Oturumu Güvenlik & Denetim Prensipleri
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] text-slate-400">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
            <strong className="text-slate-200 block mb-1">Kiracı Sahibi Onayı</strong>
            Oturum ancak kiracı sahibinin Ayarlar sayfasından onay vermesiyle devreye girer. Süre onay anında işlemeye başlar.
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
            <strong className="text-slate-200 block mb-1">Kapsam ve Süre Sınırı</strong>
            Erişim yalnızca talep edilen modüllerle sınırlıdır. Süre dolduğunda veya sonlandırıldığında erişim anında kesilir.
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
            <strong className="text-slate-200 block mb-1">Append-Only Denetim İzi</strong>
            Oturum süresince yapılan tüm sorgular ve işlemler platform denetim günlüğüne hash zinciriyle silinemez şekilde yazılır.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      }
    >
      <SupportSessionsContent />
    </Suspense>
  );
}
