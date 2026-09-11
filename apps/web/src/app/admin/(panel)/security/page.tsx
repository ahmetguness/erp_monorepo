'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  FilterX,
  Lock,
  Unlock,
  KeyRound,
  Database,
  Server,
  Cloud,
  Layers,
  Sparkles,
  Info,
  Terminal,
  ExternalLink,
  Code,
  HardDrive,
  Cpu,
  Radio,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getSecurityChecklist, type SecurityCheckStatus } from '@/services/admin.service';
import { cn } from '@/lib/utils';

const STATUS_META: Record<
  SecurityCheckStatus,
  {
    label: string;
    badgeClass: string;
    borderClass: string;
    bgClass: string;
    iconColor: string;
    icon: typeof CheckCircle2;
  }
> = {
  pass: {
    label: 'Geçti',
    badgeClass: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    borderClass: 'border-emerald-500/30',
    bgClass: 'bg-emerald-500/5',
    iconColor: 'text-emerald-400',
    icon: CheckCircle2,
  },
  warn: {
    label: 'Uyarı',
    badgeClass: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    borderClass: 'border-amber-500/30',
    bgClass: 'bg-amber-500/5',
    iconColor: 'text-amber-400',
    icon: AlertTriangle,
  },
  fail: {
    label: 'Kritik Eksiklik',
    badgeClass: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    borderClass: 'border-rose-500/30',
    bgClass: 'bg-rose-500/5',
    iconColor: 'text-rose-400',
    icon: XCircle,
  },
};

function getDomainFromKey(key: string): { name: string; icon: typeof ShieldCheck; color: string } {
  if (key.startsWith('env:')) {
    return { name: 'Ortam & Değişkenler', icon: KeyRound, color: 'text-sky-400 bg-sky-500/10' };
  }
  if (key.startsWith('db:')) {
    return { name: 'Veritabanı & Havuz', icon: Database, color: 'text-emerald-400 bg-emerald-500/10' };
  }
  if (key.startsWith('uploads:') || key.startsWith('storage:')) {
    return { name: 'Depolama & S3', icon: HardDrive, color: 'text-amber-400 bg-amber-500/10' };
  }
  if (key.startsWith('redis:')) {
    return { name: 'Redis & Rate Limit', icon: Zap, color: 'text-rose-400 bg-rose-500/10' };
  }
  if (key.startsWith('worker:')) {
    return { name: 'Worker & Görevler', icon: Server, color: 'text-violet-400 bg-violet-500/10' };
  }
  return { name: 'Platform Güvenliği', icon: ShieldCheck, color: 'text-slate-400 bg-slate-800' };
}

export default function AdminSecurityPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SecurityCheckStatus | 'ALL'>('ALL');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['admin', 'security-checklist'],
    queryFn: getSecurityChecklist,
    refetchInterval: 60000,
  });

  const checks = useMemo(() => data?.checks ?? [], [data?.checks]);

  const counts = useMemo(() => {
    return {
      total: checks.length,
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
    };
  }, [checks]);

  // Security Posture Score (% percentage of passing checks)
  const securityScore = useMemo(() => {
    if (counts.total === 0) return 100;
    // Pass = 1 pt, Warn = 0.5 pt, Fail = 0 pt
    const score = Math.round(((counts.pass + counts.warn * 0.5) / counts.total) * 100);
    return Math.min(100, Math.max(0, score));
  }, [counts]);

  // Domains list
  const domains = useMemo(() => {
    const list = Array.from(new Set(checks.map((c) => getDomainFromKey(c.key).name)));
    return list;
  }, [checks]);

  // Filtered checks
  const filteredChecks = useMemo(() => {
    return checks.filter((check) => {
      const search = searchTerm.toLowerCase().trim();
      const domain = getDomainFromKey(check.key).name;
      const matchesSearch =
        !search ||
        check.label.toLowerCase().includes(search) ||
        check.key.toLowerCase().includes(search) ||
        check.message.toLowerCase().includes(search) ||
        (check.details && check.details.some((d) => d.toLowerCase().includes(search)));

      const matchesStatus = statusFilter === 'ALL' || check.status === statusFilter;
      const matchesDomain = domainFilter === 'ALL' || domain === domainFilter;

      return matchesSearch && matchesStatus && matchesDomain;
    });
  }, [checks, searchTerm, statusFilter, domainFilter]);

  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'ALL' || domainFilter !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setDomainFilter('ALL');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Platform Güvenlik & Uyum Durumu
            </h1>
            <p className="text-xs text-slate-400">
              Çalışma zamanı ortam yapılandırmaları, ortam değişkenleri güvenliği ve depolama denetim kontrol listesi.
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

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Overall Security Score */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Güvenlik & Uyum Skoru</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                'text-2xl font-bold tracking-tight',
                securityScore >= 90
                  ? 'text-emerald-400'
                  : securityScore >= 70
                    ? 'text-amber-400'
                    : 'text-rose-400',
              )}
            >
              %{securityScore}
            </span>
            <span className="text-xs text-slate-400">
              {securityScore >= 90 ? 'Yüksek Uyum' : securityScore >= 70 ? 'İyileştirme Gerekli' : 'Kritik Risk'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {counts.total} denetim kriteri üzerinden hesaplandı
          </div>
        </div>

        {/* Metric 2: Passed Checks */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Başarılı Kontroller</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {counts.pass} <span className="text-xs font-normal text-slate-400">/ {counts.total}</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Kriterleri tam karşılıyor</span>
          </div>
        </div>

        {/* Metric 3: Warnings */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Uyarı Seviyesi</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {counts.warn} <span className="text-xs font-normal text-slate-400">Uyarı</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Production ortamı için tavsiye edilenler
          </div>
        </div>

        {/* Metric 4: Critical Failures */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kritik Eksiklikler</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            <span className={counts.fail > 0 ? 'text-rose-400' : 'text-slate-200'}>
              {counts.fail}
            </span>
            <span className="text-xs font-normal text-slate-400"> Kritik</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {counts.fail === 0 ? (
              <span className="text-emerald-400 font-medium">Kritik güvenlik açığı yok</span>
            ) : (
              <span className="text-rose-400 font-medium">Acil müdahale gerektirir</span>
            )}
          </div>
        </div>
      </div>

      {/* Global Status Banner */}
      {data && (
        <div
          className={cn(
            'flex flex-col gap-3 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between',
            STATUS_META[data.summary].borderClass,
            STATUS_META[data.summary].bgClass,
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                STATUS_META[data.summary].borderClass,
                'bg-slate-950/60',
                STATUS_META[data.summary].iconColor,
              )}
            >
              {(() => {
                const Icon = STATUS_META[data.summary].icon;
                return <Icon className="h-5 w-5" />;
              })()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">
                  Genel Güvenlik Durumu: {STATUS_META[data.summary].label}
                </span>
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-xs font-semibold',
                    STATUS_META[data.summary].badgeClass,
                  )}
                >
                  {data.summary.toUpperCase()}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-300">
                {data.summary === 'pass'
                  ? 'Tüm kritik güvenlik ve çalışma zamanı parametreleri başarıyla doğrulandı.'
                  : data.summary === 'warn'
                    ? 'Sistem çalışır durumda ancak bazı yapılandırma uyarıları optimize edilmelidir.'
                    : 'Kritik ortam değişkenleri veya güvenlik eksiklikleri tespit edildi; lütfen aşağıdaki adımları kontrol edin.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Kontrol adı, anahtar veya detay ile ara…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-emerald-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                <FilterX className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Domain & Status Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Tüm Güvenlik Alanları</option>
              {domains.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
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

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 border-t border-slate-800/80 pt-3">
          <span className="text-xs font-medium text-slate-400 mr-1.5">Durum:</span>
          {(
            [
              { key: 'ALL', label: `Tümü (${checks.length})` },
              { key: 'pass', label: `Geçti (${counts.pass})` },
              { key: 'warn', label: `Uyarı (${counts.warn})` },
              { key: 'fail', label: `Kritik (${counts.fail})` },
            ] as const
          ).map((tab) => {
            const isSelected = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  isSelected
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-800" />
                <div className="space-y-1 flex-1">
                  <div className="h-4 w-40 rounded bg-slate-800" />
                  <div className="h-3 w-64 rounded bg-slate-800/60" />
                </div>
              </div>
              <div className="h-6 w-full rounded bg-slate-800/40" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-rose-200">Güvenlik listesi yüklenemedi</p>
              <p className="text-xs text-rose-300/80">Sunucu ile bağlantı kurulurken bir sorun oluştu.</p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => refetch()}>
            Tekrar Dene
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && filteredChecks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-200">
            Kriterlere uygun güvenlik kontrolü bulunamadı
          </h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            Filtrelerinizi sıfırlayarak tüm güvenlik denetim listesini inceleyebilirsiniz.
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

      {/* Security Checks Cards Grid */}
      {!isLoading && filteredChecks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredChecks.map((check) => {
            const meta = STATUS_META[check.status];
            const StatusIcon = meta.icon;
            const domain = getDomainFromKey(check.key);
            const DomainIcon = domain.icon;

            return (
              <div
                key={check.key}
                className={cn(
                  'flex flex-col justify-between rounded-2xl border bg-slate-900/50 p-5 shadow-sm transition-all duration-150',
                  meta.borderClass,
                  'hover:bg-slate-900/80',
                )}
              >
                <div className="space-y-3">
                  {/* Card Header: Icon, Label, Domain & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950',
                          meta.iconColor,
                        )}
                      >
                        <StatusIcon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-100 text-sm">{check.label}</h3>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border font-mono',
                              domain.color,
                              'border-slate-800',
                            )}
                          >
                            <DomainIcon className="h-3 w-3" />
                            <span>{domain.name}</span>
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 block truncate mt-0.5">
                          {check.key}
                        </span>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border shrink-0',
                        meta.badgeClass,
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      <span>{meta.label}</span>
                    </span>
                  </div>

                  {/* Message Explanation */}
                  <p className="text-xs text-slate-300 leading-relaxed">{check.message}</p>

                  {/* Details / Configurations List */}
                  {check.details && check.details.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                        Denetim Parametreleri:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {check.details.map((detail) => (
                          <code
                            key={detail}
                            className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-300 select-all"
                          >
                            {detail}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
