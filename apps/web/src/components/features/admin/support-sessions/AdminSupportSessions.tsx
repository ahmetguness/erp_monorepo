'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endSupportSession, listAdminSupportSessions } from '@/services/support-session.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { SupportSessionRequestForm } from './SupportSessionRequestForm';
import { SupportSessionViewer } from './SupportSessionViewer';
import { useSupportSessionTime } from '@/hooks/useSupportSessionTime';
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  Ticket,
  Eye,
  LogOut,
  RefreshCw,
  PlusCircle,
  ListOrdered,
  AlertCircle,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { SupportSessionSummary } from '@repo/types';

type SessionFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'ENDED';

export function AdminSupportSessions({
  tenantId,
  initialTicketId,
}: {
  tenantId: string;
  initialTicketId?: string;
}) {
  const now = useSupportSessionTime();
  const admin = useAdminAuthStore((state) => state.admin);
  const allowed = canAdmin(admin, 'support-session.manage');

  const [activeTab, setActiveTab] = useState<'REQUEST' | 'LIST'>('REQUEST');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SessionFilter>('ALL');

  const client = useQueryClient();

  const sessions = useQuery({
    queryKey: ['support-sessions', tenantId, admin?.id],
    queryFn: () => listAdminSupportSessions(tenantId),
    enabled: allowed,
    refetchInterval: 10000,
    retry: false,
  });

  const selected = !sessions.isError && allowed ? sessions.data?.find((s) => s.id === selectedId) : undefined;

  const end = useMutation({
    mutationFn: (id: string) => endSupportSession(tenantId, id),
    onSuccess: async (_, id) => {
      if (selectedId === id) setSelectedId(null);
      client.removeQueries({ queryKey: ['support-data', id] });
      await client.invalidateQueries({ queryKey: ['support-sessions', tenantId] });
    },
  });

  // Derived statistics
  const stats = useMemo(() => {
    const list = sessions.data ?? [];
    const active = list.filter(
      (s) => s.approvedAt && !s.revokedAt && new Date(s.expiresAt).getTime() > now,
    ).length;
    const pending = list.filter((s) => !s.approvedAt && !s.revokedAt && new Date(s.expiresAt).getTime() > now).length;
    const ended = list.filter((s) => s.revokedAt || new Date(s.expiresAt).getTime() <= now).length;
    return { total: list.length, active, pending, ended };
  }, [sessions.data, now]);

  const filteredSessions = useMemo(() => {
    const list = sessions.data ?? [];
    switch (filter) {
      case 'ACTIVE':
        return list.filter((s) => s.approvedAt && !s.revokedAt && new Date(s.expiresAt).getTime() > now);
      case 'PENDING':
        return list.filter((s) => !s.approvedAt && !s.revokedAt && new Date(s.expiresAt).getTime() > now);
      case 'ENDED':
        return list.filter((s) => s.revokedAt || new Date(s.expiresAt).getTime() <= now);
      default:
        return list;
    }
  }, [sessions.data, filter, now]);

  if (!allowed) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-6 text-center text-xs text-red-300">
        Destek oturumu yönetimi için <code>support-session.manage</code> yetkisi gerekmektedir.
      </div>
    );
  }

  // Active Session Remote Inspection Mode
  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId(null)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Oturum Listesine Dön
          </Button>
        </div>
        <SupportSessionViewer
          key={selected.id}
          session={selected}
          onExit={() => end.mutate(selected.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation & Status Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('REQUEST')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all',
              activeTab === 'REQUEST'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800',
            )}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Yeni Oturum Talep Et</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LIST')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all',
              activeTab === 'LIST'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800',
            )}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span>Tüm Oturumlar</span>
            {stats.total > 0 && (
              <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
                {stats.total}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {stats.active > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {stats.active} Aktif Oturum
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            loading={sessions.isFetching}
            onClick={() => void sessions.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* Main View Toggle */}
      {activeTab === 'REQUEST' ? (
        <SupportSessionRequestForm
          key={`${tenantId}-${initialTicketId ?? ''}`}
          tenantId={tenantId}
          initialTicketId={initialTicketId}
        />
      ) : (
        /* Sessions List View */
        <div className="space-y-4">
          {/* Quick Filter Strip */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'ALL' as const, label: 'Tümü', count: stats.total },
              { key: 'ACTIVE' as const, label: 'Aktif (Onaylı)', count: stats.active },
              { key: 'PENDING' as const, label: 'Onay Bekleyen', count: stats.pending },
              { key: 'ENDED' as const, label: 'Sonlanan / Süresi Dolan', count: stats.ended },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
                  filter === f.key
                    ? 'border-indigo-500/60 bg-indigo-500/20 text-white ring-1 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200',
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          {sessions.isError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300">
              Oturum bilgileri alınamadı. Lütfen yetkinizi ve oturumunuzu kontrol edin.
            </div>
          )}

          {/* Sessions Grid */}
          {sessions.isPending ? (
            <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span>Destek oturumları yükleniyor…</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-12 text-center text-xs text-slate-400 space-y-3">
              <KeyRound className="mx-auto h-10 w-10 text-slate-600" />
              <p className="font-semibold text-slate-300">Bu filtrede oturum kaydı bulunamadı.</p>
              <p className="text-[11px] text-slate-500">
                Kiracı kullanıcısı adına oturum başlatmak için yukarıdaki &quot;Yeni Oturum Talep Et&quot; sekmesini kullanabilirsiniz.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('REQUEST')}
                className="mt-2 text-xs"
              >
                Yeni Oturum Talebi Oluştur
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredSessions.map((session) => {
                const expiresMs = new Date(session.expiresAt).getTime();
                const isExpired = expiresMs <= now;
                const isRevoked = Boolean(session.revokedAt);
                const isApproved = Boolean(session.approvedAt);
                const isActive = isApproved && !isRevoked && !isExpired;

                return (
                  <article
                    key={session.id}
                    className={cn(
                      'rounded-2xl border p-4.5 transition-all shadow-lg space-y-3',
                      isActive
                        ? 'border-indigo-500/40 bg-slate-950/80 ring-1 ring-indigo-500/30'
                        : 'border-slate-800/80 bg-slate-950/50 hover:border-slate-700/80',
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      {/* User & Ticket details */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold text-slate-300">
                          {session.targetUser.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{session.targetUser.name}</span>
                            <span className="text-[11px] text-slate-400 font-mono">({session.targetUser.email})</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-mono font-semibold">
                              <Ticket className="h-3 w-3" />
                              {session.ticketId}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="text-[11px] text-slate-400">
                              Kapsam: <strong>{session.scopes.map((s) => (s === 'CONTACTS' ? 'Cari' : 'Ürün')).join(', ')}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-2">
                        {isRevoked ? (
                          <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-400 ring-1 ring-red-500/20">
                            Sonlandırıldı
                          </span>
                        ) : isExpired ? (
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-400">
                            Süresi Doldu
                          </span>
                        ) : !isApproved ? (
                          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/20">
                            Sahip Onayı Bekliyor
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Görüntüleme Onaylı
                          </span>
                        )}

                        {session.writeApprovedAt && (
                          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300 ring-1 ring-indigo-500/20">
                            Not Yazma İzinli
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reason & Expiry */}
                    <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-2.5 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-slate-300 truncate max-w-xl">
                        <strong className="text-slate-400">Gerekçe:</strong> {session.reason}
                      </p>
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">
                        Bitiş: {new Date(session.expiresAt).toLocaleString('tr-TR')}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-900">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!isApproved || isRevoked || isExpired}
                        onClick={() => setSelectedId(session.id)}
                        leftIcon={<Eye className="h-3.5 w-3.5" />}
                        className={cn(
                          'text-xs',
                          isActive && 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30',
                        )}
                      >
                        Kullanıcı Adına Görüntüle
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isRevoked || end.isPending}
                        onClick={() => end.mutate(session.id)}
                        leftIcon={<LogOut className="h-3.5 w-3.5" />}
                        className="text-xs"
                      >
                        Sonlandır
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
