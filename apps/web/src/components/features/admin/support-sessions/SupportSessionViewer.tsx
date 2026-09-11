'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupportScope, SupportSessionSummary } from '@repo/types';
import { readSupportRows, updateSupportContactNote } from '@/services/support-session.service';
import { useSupportSessionTime } from '@/hooks/useSupportSessionTime';
import {
  Eye,
  LogOut,
  Clock,
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Check,
  AlertTriangle,
  UserCheck,
  Building2,
  Package,
  Layers,
  Save,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

function formatCountdown(targetMs: number, nowMs: number): { text: string; isUrgent: boolean } {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return { text: '00:00 (Süre Doldu)', isUrgent: true };
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return { text, isUrgent: minutes < 5 };
}

function ContactNoteEditor({
  session,
  id,
  initialNote,
}: {
  session: SupportSessionSummary;
  id: string;
  initialNote: string;
}) {
  const [note, setNote] = useState(initialNote);
  const [isEditing, setIsEditing] = useState(false);
  const client = useQueryClient();

  const save = useMutation({
    mutationFn: () => updateSupportContactNote(session, id, note),
    onSuccess: async () => {
      setIsEditing(false);
      await client.invalidateQueries({ queryKey: ['support-data', session.id] });
    },
  });

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs">
        <span className="text-slate-400 truncate max-w-xs">{note ? `Not: ${note}` : 'Henüz not eklenmedi.'}</span>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Edit3 className="h-3 w-3" />}
          onClick={() => setIsEditing(true)}
          className="text-xs text-indigo-400 hover:text-indigo-300 h-6 px-2"
        >
          {note ? 'Düzenle' : 'Not Ekle'}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      className="space-y-2 border-t border-slate-800/80 pt-2"
    >
      <textarea
        aria-label="Cari destek notu"
        maxLength={4000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={save.isPending}
        placeholder="Cariye ilişkin destek inceleme notunuzu girin..."
        className="w-full rounded-lg border border-indigo-500/40 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500"
        rows={2}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={save.isPending}
          onClick={() => {
            setNote(initialNote);
            setIsEditing(false);
          }}
          className="h-6 text-xs"
        >
          Vazgeç
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={save.isPending}
          leftIcon={<Save className="h-3 w-3" />}
          className="h-6 text-xs bg-indigo-600 hover:bg-indigo-500"
        >
          Kaydet
        </Button>
      </div>
      {save.isError && (
        <p role="alert" className="text-[11px] text-red-400">
          Kaydedilemedi; izin veya oturum süresi dolmuş olabilir.
        </p>
      )}
    </form>
  );
}

export function SupportSessionViewer({
  session,
  onExit,
}: {
  session: SupportSessionSummary;
  onExit: () => void;
}) {
  const now = useSupportSessionTime();
  const [scope, setScope] = useState<SupportScope>(session.scopes[0] ?? 'CONTACTS');
  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState('');

  const expiresMs = new Date(session.expiresAt).getTime();
  const active = Boolean(session.approvedAt && !session.revokedAt && expiresMs > now);
  const countdown = formatCountdown(expiresMs, now);

  const rows = useQuery({
    queryKey: ['support-data', session.id, scope, page],
    queryFn: () => readSupportRows(session, scope, page),
    enabled: active,
    gcTime: 0,
    retry: false,
    refetchInterval: 10000,
  });

  const filteredItems = useMemo(() => {
    const list = rows.data?.data ?? [];
    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase();
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.code && item.code.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q)),
    );
  }, [rows.data?.data, searchFilter]);

  return (
    <div className="space-y-5">
      {/* Top Banner - Active Support Inspection Bar */}
      <div
        className={cn(
          'sticky top-0 z-30 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl transition-all',
          active
            ? 'border-indigo-500/40 bg-slate-950/95 ring-1 ring-indigo-500/30'
            : 'border-amber-500/40 bg-amber-950/20 ring-1 ring-amber-500/30',
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400',
              )}
            >
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Canlı Destek İnceleme Modu
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    active
                      ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30',
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  {active ? 'Aktif' : 'Oturum Sona Erdi'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Kullanıcı: <strong className="text-white">{session.targetUser.name}</strong> ({session.targetUser.email}) ·
                Talep: <code className="text-indigo-300">{session.ticketId}</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Countdown Badge */}
            {active && (
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-bold',
                  countdown.isUrgent
                    ? 'border-red-500/50 bg-red-950/40 text-red-400 animate-pulse'
                    : 'border-slate-700 bg-slate-900 text-indigo-300',
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>{countdown.text}</span>
              </div>
            )}

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
              onClick={onExit}
              className="text-xs"
            >
              Görünümden Çık
            </Button>
          </div>
        </div>

        {/* Permissions Strip */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">İzin Modu:</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
            {session.writeApprovedAt ? 'Cari Notu Düzenleme Yetkisi Var' : 'Salt Okunur (Görüntüleme)'}
          </span>
          <span>·</span>
          <span>Bitiş: {new Date(session.expiresAt).toLocaleTimeString('tr-TR')}</span>
          <span>·</span>
          <span className="text-slate-500">
            Her veri erişimi append-only denetim kaydına güvenli biçimde işlenmektedir.
          </span>
        </div>
      </div>

      {active ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
            {/* Scope Switcher */}
            <div className="flex items-center gap-1.5">
              {session.scopes.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={scope === item}
                  onClick={() => {
                    setScope(item);
                    setPage(1);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all',
                    scope === item
                      ? 'border-indigo-500/50 bg-indigo-500/20 text-white shadow-sm ring-1 ring-indigo-500/30'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {item === 'CONTACTS' ? <Building2 className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                  <span>{item === 'CONTACTS' ? 'Cari Hesaplar' : 'Ürünler & Stok'}</span>
                </button>
              ))}
            </div>

            {/* Quick Search */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Listede ara..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 w-full rounded-xl border border-slate-700/80 bg-slate-950 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Records Display */}
          {rows.isPending ? (
            <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span>Veriler hedef kullanıcı bağlamında çekiliyor…</span>
            </div>
          ) : rows.isError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-6 text-center text-xs text-red-400">
              <AlertTriangle className="mx-auto h-8 w-8 mb-2 text-red-400" />
              <p className="font-semibold">Veri alınamadı veya yetki sınırına takıldı.</p>
              <p className="text-[11px] text-slate-400 mt-1">Oturum izinlerini ve hedef kullanıcının modül yetkilerini inceleyin.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Eşleşen kayıt bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map((row) => (
                <article
                  key={row.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700/80 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-tight">{row.name}</h4>
                      {row.code && (
                        <span className="text-[10px] text-slate-500 font-mono">Kod: {row.code}</span>
                      )}
                    </div>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                      ID: {row.id.slice(-6)}
                    </span>
                  </div>

                  {row.notes && (
                    <p className="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed whitespace-pre-wrap">
                      {row.notes}
                    </p>
                  )}

                  {scope === 'CONTACTS' && session.writeApprovedAt && (
                    <ContactNoteEditor
                      key={`${row.id}:${row.notes ?? ''}`}
                      session={session}
                      id={row.id}
                      initialNote={row.notes ?? ''}
                    />
                  )}
                </article>
              ))}
            </div>
          )}

          {/* Pagination */}
          {rows.data && rows.data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
              <span>Toplam Sayfa: {rows.data.meta.totalPages}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((v) => Math.max(1, v - 1))}
                  leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                  className="h-7 text-xs"
                >
                  Önceki
                </Button>
                <span className="px-2 font-semibold text-slate-200">Sayfa {page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= rows.data.meta.totalPages}
                  onClick={() => setPage((v) => v + 1)}
                  rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                  className="h-7 text-xs"
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
          Bu oturumun süresi dolmuş veya henüz kiracı sahibi tarafından onaylanmamış.
        </div>
      )}
    </div>
  );
}
