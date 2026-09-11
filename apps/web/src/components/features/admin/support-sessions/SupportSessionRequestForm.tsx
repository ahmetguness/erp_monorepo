'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUPPORT_SCOPES, type SupportScope } from '@repo/types';
import { listSupportTargets, requestSupportSession } from '@/services/support-session.service';
import {
  ShieldCheck,
  User,
  Ticket,
  Clock,
  FileText,
  Layers,
  Edit3,
  Send,
  AlertCircle,
  CheckCircle2,
  Lock,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const DURATION_PRESETS = [15, 30, 45, 60] as const;

const REASON_TEMPLATES = [
  'Fatura / e-arşiv senkronizasyon hatası analizi ve çözümü',
  'Cari hesap bakiye ve işlem hareketi uyuşmazlığı kontrolü',
  'Ürün stok ve fiyat güncelleme problemi incelemesi',
  'Kullanıcı kaynaklı yetkilendirme ve veri erişim desteği',
] as const;

export function SupportSessionRequestForm({
  tenantId,
  initialTicketId,
}: {
  tenantId: string;
  initialTicketId?: string;
}) {
  const client = useQueryClient();
  const [targetUserId, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [ticketId, setTicket] = useState(initialTicketId ?? '');
  const [durationMinutes, setDuration] = useState(30);
  const [scopes, setScopes] = useState<SupportScope[]>(['CONTACTS']);
  const [writeRequested, setWrite] = useState(false);

  const targets = useQuery({
    queryKey: ['support-targets', tenantId],
    queryFn: () => listSupportTargets(tenantId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      requestSupportSession({
        tenantId,
        targetUserId,
        reason: reason.trim(),
        ticketId: ticketId.trim(),
        durationMinutes,
        scopes,
        writeRequested,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['support-sessions', tenantId] });
      setReason('');
      if (!initialTicketId) setTicket('');
    },
  });

  const isFormValid =
    Boolean(targetUserId) &&
    scopes.length > 0 &&
    reason.trim().length >= 10 &&
    ticketId.trim().length > 0;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl space-y-6">
      {/* Form Header */}
      <div className="flex items-start justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Güvenli Destek Oturumu Talep Et</h3>
            <p className="text-xs text-slate-400">
              Kiracı sahibinin onayıyla, hedef kullanıcının yetki sınırlarında geçici erişim sağlar.
            </p>
          </div>
        </div>

        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700/50">
          <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
          Denetim İzi Aktif
        </span>
      </div>

      {/* Info Callout */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 text-xs text-indigo-200/90 flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Oturum talebi oluşturulduğunda kiracı sahibi <span className="text-white font-medium">Ayarlar → Destek Erişimi</span> menüsünden
          onaylayana kadar veriler görüntülenemez. Süre onay anında başlar ve süre dolduğunda erişim anında kapanır.
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending && isFormValid) {
            mutation.mutate();
          }
        }}
      >
        <fieldset disabled={mutation.isPending} className="space-y-5">
          {/* Row 1: Target User & Ticket ID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target User */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Hedef Kullanıcı <span className="text-red-400">*</span>
              </label>
              {targets.isPending ? (
                <div className="h-10 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 flex items-center text-xs text-slate-500">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-2" />
                  Kullanıcılar yükleniyor…
                </div>
              ) : targets.isError ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Kullanıcı listesi alınamadı.</span>
                  <button
                    type="button"
                    onClick={() => void targets.refetch()}
                    className="text-xs text-indigo-400 underline"
                  >
                    Tekrar Dene
                  </button>
                </div>
              ) : (
                <select
                  required
                  value={targetUserId}
                  onChange={(e) => setTarget(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 text-xs text-slate-200 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Kullanıcı seçin (Aktif ilk 200)</option>
                  {targets.data?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Ticket ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5 text-slate-400" />
                Talep / Ticket Numarası <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={ticketId}
                  onChange={(e) => setTicket(e.target.value)}
                  placeholder="Örn: TCK-2026-609839-9756"
                  className={cn(
                    'h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 text-xs text-slate-200 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                    initialTicketId && 'pr-24',
                  )}
                />
                {initialTicketId && ticketId === initialTicketId && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                    Otomatik Bağlandı
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Oturum Süresi <span className="text-slate-500 font-normal">(5–60 dakika)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {DURATION_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                  className={cn(
                    'rounded-xl border px-3.5 py-2 text-xs font-medium transition-all',
                    durationMinutes === minutes
                      ? 'border-indigo-500/60 bg-indigo-500/20 text-white shadow-sm ring-1 ring-indigo-500/40'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200',
                  )}
                >
                  {minutes} Dakika
                  {minutes === 30 && <span className="ml-1 text-[10px] text-indigo-400 font-semibold">(Önerilen)</span>}
                </button>
              ))}

              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={durationMinutes}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-9 w-20 rounded-xl border border-slate-700 bg-slate-950 px-2 text-center text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
                <span className="text-xs text-slate-500">dk</span>
              </div>
            </div>
          </div>

          {/* Row 3: Scopes Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              Erişim Kapsamı <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* CONTACTS Card */}
              <label
                className={cn(
                  'relative flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all',
                  scopes.includes('CONTACTS')
                    ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700',
                )}
              >
                <input
                  type="checkbox"
                  checked={scopes.includes('CONTACTS')}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setScopes((prev) =>
                      checked ? [...prev, 'CONTACTS'] : prev.filter((item) => item !== 'CONTACTS'),
                    );
                    if (!checked) setWrite(false);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Cari Hesaplar & Kişiler</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Müşteri ve tedarikçi kayıtlarını hedef kullanıcının yetkileriyle görüntüleyin.
                  </span>
                </div>
              </label>

              {/* PRODUCTS Card */}
              <label
                className={cn(
                  'relative flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all',
                  scopes.includes('PRODUCTS')
                    ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700',
                )}
              >
                <input
                  type="checkbox"
                  checked={scopes.includes('PRODUCTS')}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setScopes((prev) =>
                      checked ? [...prev, 'PRODUCTS'] : prev.filter((item) => item !== 'PRODUCTS'),
                    );
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Ürün & Stok Verileri</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Ürün kartları, stok seviyeleri ve fiyat listelerini görüntüleyin.
                  </span>
                </div>
              </label>
            </div>

            {/* Write Permission Option */}
            <div className="mt-3">
              <label
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 text-xs transition-all',
                  !scopes.includes('CONTACTS')
                    ? 'opacity-40 cursor-not-allowed border-slate-800 bg-slate-950/20 text-slate-500'
                    : writeRequested
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20'
                      : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  disabled={!scopes.includes('CONTACTS')}
                  checked={writeRequested}
                  onChange={(e) => setWrite(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                />
                <Edit3 className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Cari Destek Notu Yazma İzni</strong> — Salt okunur incelemeye ek olarak cari karta destek
                  notu ekleyebilme izni talep et.
                </span>
              </label>
            </div>
          </div>

          {/* Row 4: Audit Reason */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                Talep Gerekçesi <span className="text-red-400">*</span>
              </label>
              <span
                className={cn(
                  'text-[10px]',
                  reason.trim().length >= 10 ? 'text-slate-400' : 'text-amber-400 font-medium',
                )}
              >
                {reason.length} / 2000 karakter {reason.trim().length < 10 && '(En az 10 karakter)'}
              </span>
            </div>

            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Destek oturumu talep edilme sebebini detaylı olarak belirtin..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950 p-3 text-xs text-slate-200 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />

            {/* Preset chips */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500">Şablonlar:</span>
              {REASON_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl}
                  type="button"
                  onClick={() => setReason(tmpl)}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
                >
                  {tmpl}
                </button>
              ))}
            </div>
          </div>

          {/* Error / Success Feedback */}
          {mutation.isError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>Talep oluşturulamadı. Bilgileri ve admin oturumunuzu kontrol edip tekrar deneyin.</span>
            </div>
          )}

          {mutation.isSuccess && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Destek oturumu talebi başarıyla oluşturuldu ve kiracı sahibinin onayına sunuldu.</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={mutation.isPending}
              disabled={!isFormValid || mutation.isPending}
              leftIcon={<Send className="h-4 w-4" />}
              className="bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30 px-6"
            >
              Destek Oturumu Talep Et
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
