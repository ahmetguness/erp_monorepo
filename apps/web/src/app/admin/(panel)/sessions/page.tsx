'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSessionSummary } from '@repo/types';
import {
  closeAdminSession,
  closeAllAdminSessions,
  listAdminSecurityEvents,
  listAdminSessions,
  reauthenticateAdmin,
} from '@/services/admin-session.service';
import { toast } from '@/store/ui.store';
import { extractAdminError, toastAdminError } from '@/lib/admin/errors';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AdminPageHeader, AdminKpiCard, AdminKpiGrid } from '@/components/features/admin/ui';
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Lock,
  Unlock,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  Clock,
  LogOut,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Info,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getDeviceIcon(deviceName: string) {
  const lower = deviceName.toLowerCase();
  if (
    lower.includes('mobile') ||
    lower.includes('iphone') ||
    lower.includes('android') ||
    lower.includes('phone')
  ) {
    return Smartphone;
  }
  if (lower.includes('ipad') || lower.includes('tablet')) {
    return Tablet;
  }
  if (
    lower.includes('mac') ||
    lower.includes('windows') ||
    lower.includes('linux') ||
    lower.includes('laptop') ||
    lower.includes('desktop') ||
    lower.includes('chrome') ||
    lower.includes('firefox') ||
    lower.includes('safari') ||
    lower.includes('edge')
  ) {
    return Laptop;
  }
  return Monitor;
}

export default function AdminSessionsPage() {
  const queryClient = useQueryClient();

  // Step-up Reauthentication Form State
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reauthSuccessUntil, setReauthSuccessUntil] = useState<Date | null>(null);

  // Dialog State
  const [sessionToClose, setSessionToClose] = useState<AdminSessionSummary | null>(null);
  const [isCloseAllDialogOpen, setIsCloseAllDialogOpen] = useState(false);

  // Queries
  const sessionsQuery = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: listAdminSessions,
    refetchInterval: 30000,
  });

  const eventsQuery = useQuery({
    queryKey: ['admin', 'security-events'],
    queryFn: listAdminSecurityEvents,
    refetchInterval: 30000,
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'security-events'] }),
    ]);
  };

  // Reauth Mutation
  const reauthMutation = useMutation({
    mutationFn: () => reauthenticateAdmin(password, otp),
    onSuccess: () => {
      setPassword('');
      setOtp('');
      const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setReauthSuccessUntil(validUntil);
      toast.success(
        'Kimliğiniz başarıyla doğrulandı! 1 gün boyunca hassas işlemleri gerçekleştirebilirsiniz.',
      );
    },
    onError: (error: unknown) => {
      toast.error(extractAdminError(error, 'Doğrulama başarısız. Lütfen şifrenizi ve 6 haneli yeni MFA kodunuzu kontrol edin.'));
    },
  });

  // Revoke Single Session Mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => closeAdminSession(id),
    onSuccess: async (_, id) => {
      const isCurrent = sessionsQuery.data?.find((s) => s.id === id)?.current;
      setSessionToClose(null);
      if (isCurrent) {
        toast.info('Mevcut oturumunuzu kapattınız. Giriş sayfasına yönlendiriliyorsunuz…');
        setTimeout(() => window.location.assign('/admin/login'), 800);
      } else {
        toast.success('Oturum başarıyla sonlandırıldı.');
        await queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] });
      }
    },
    onError: (err: unknown) => {
      toastAdminError(err, 'Oturum kapatılamadı. Lütfen tekrar deneyin.');
    },
  });

  // Revoke All Sessions Mutation
  const revokeAllMutation = useMutation({
    mutationFn: closeAllAdminSessions,
    onSuccess: () => {
      setIsCloseAllDialogOpen(false);
      toast.info('Tüm oturumlar kapatıldı. Giriş sayfasına yönlendiriliyorsunuz…');
      setTimeout(() => window.location.assign('/admin/login'), 800);
    },
    onError: (err: unknown) => {
      toastAdminError(err, 'Oturumlar kapatılırken bir sorun oluştu.');
    },
  });

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const securityEvents = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const currentSession = sessions.find((s) => s.current);

  const isReauthenticated = Boolean(reauthSuccessUntil && reauthSuccessUntil > new Date());

  const handleReauthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !otp.trim() || otp.trim().length !== 6) {
      toast.warning('Lütfen şifrenizi ve 6 haneli doğrulama kodunu eksiksiz girin.');
      return;
    }
    reauthMutation.mutate();
  };

  return (
    <div className="space-y-4 pb-10">
      {/* Page Header */}
      <AdminPageHeader
        title="Oturumlar ve Güvenlik Doğrulaması"
        description="Aktif cihaz oturumlarınızı yönetin, güvenlik bildirimlerini inceleyin ve kritik işlemler için yeniden doğrulama yapın."
        icon={Radio}
        iconTone="purple"
        badge={
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            {sessions.length} Cihaz
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              loading={sessionsQuery.isFetching || eventsQuery.isFetching}
              leftIcon={
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5',
                    (sessionsQuery.isFetching || eventsQuery.isFetching) && 'animate-spin',
                  )}
                />
              }
            >
              Yenile
            </Button>

            {sessions.length > 1 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsCloseAllDialogOpen(true)}
                leftIcon={<LogOut className="h-3.5 w-3.5" />}
              >
                Tüm Cihazlardan Çıkış
              </Button>
            )}
          </>
        }
      />

      {/* KPI & Security Summary Strip */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Aktif Cihaz Oturumları"
          value={sessions.length}
          icon={Laptop}
          iconTone="sky"
          subtext={
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              1 tanesi şu anki oturumunuz
            </span>
          }
        />

        <AdminKpiCard
          label="Mevcut Bağlantı"
          value={currentSession?.deviceName || 'Bu Cihaz'}
          icon={Globe}
          iconTone="emerald"
          subtext={`IP: ${currentSession?.ipAddress || 'Yerel Ağ'}`}
        />

        <AdminKpiCard
          label="Güvenlik Bildirimleri"
          value={securityEvents.length}
          icon={ShieldAlert}
          iconTone="amber"
          subtext={
            securityEvents.length === 0 ? (
              <span className="text-emerald-400 font-medium">Olağandışı aktivite yok</span>
            ) : (
              <span className="text-amber-400 font-medium">İncelenmesi gereken kayıtlar var</span>
            )
          }
        />

        <AdminKpiCard
          label="Kritik İşlem Yetkisi"
          value={isReauthenticated ? 'Yetkili' : 'Standart'}
          icon={isReauthenticated ? Unlock : Lock}
          iconTone={isReauthenticated ? 'emerald' : 'slate'}
          subtext={
            isReauthenticated ? (
              <span className="text-emerald-400 font-medium">Hassas işlemler yapılabilir (1 Gün)</span>
            ) : (
              <span>Yüksek güvenlikli işlemler için doğrulayın</span>
            )
          }
        />
      </AdminKpiGrid>

      {/* Main Content Grid: Left (Sessions & Events) / Right (Step-up Auth & Best Practices) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7/12: Sessions List & Security Events */}
        <div className="space-y-6 lg:col-span-7">
          {/* Active Devices Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                  <Laptop className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Aktif Cihazlar & Oturumlar
                  </h2>
                  <p className="text-xs text-slate-400">
                    Hesabınıza bağlı tüm aktif tarayıcı ve istemci oturumları.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                {sessions.length} Cihaz
              </span>
            </div>

            {/* Sessions List Content */}
            <div className="mt-4 space-y-3">
              {sessionsQuery.isLoading && (
                <div className="space-y-3">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="animate-pulse rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 space-y-2"
                    >
                      <div className="h-4 w-40 rounded bg-slate-800" />
                      <div className="h-3 w-64 rounded bg-slate-800/60" />
                    </div>
                  ))}
                </div>
              )}

              {sessionsQuery.isError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center justify-between">
                  <span>Oturum listesi yüklenemedi.</span>
                  <Button variant="danger" size="sm" onClick={() => sessionsQuery.refetch()}>
                    Tekrar Dene
                  </Button>
                </div>
              )}

              {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
                  Kayıtlı aktif oturum bulunamadı.
                </div>
              )}

              {!sessionsQuery.isLoading &&
                sessions.map((session) => {
                  const DeviceIcon = getDeviceIcon(session.deviceName);

                  return (
                    <div
                      key={session.id}
                      className={cn(
                        'relative flex flex-col justify-between gap-3 rounded-xl border p-4 transition-all duration-150 sm:flex-row sm:items-center',
                        session.current
                          ? 'border-emerald-500/40 bg-emerald-950/10 ring-1 ring-emerald-500/20'
                          : 'border-slate-800/90 bg-slate-950/50 hover:border-slate-700/80 hover:bg-slate-950/80',
                      )}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
                            session.current
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-slate-800 bg-slate-900 text-slate-400',
                          )}
                        >
                          <DeviceIcon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-100 text-sm truncate">
                              {session.deviceName}
                            </span>
                            {session.current && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Bu Cihaz
                              </span>
                            )}
                            {session.rememberMe && (
                              <span className="rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                                Beni Hatırla
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-slate-500" />
                              {session.ipAddress || 'IP Bilinmiyor'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-500" />
                              Son Etkinlik: {formatDateTime(session.lastSeenAt)}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500">
                            Bitiş: {formatDateTime(session.expiresAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end shrink-0 sm:self-center">
                        <Button
                          variant={session.current ? 'outline' : 'ghost'}
                          size="sm"
                          disabled={revokeMutation.isPending}
                          onClick={() => setSessionToClose(session)}
                          className={cn(
                            'text-xs',
                            session.current
                              ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
                              : 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300',
                          )}
                          leftIcon={<LogOut className="h-3.5 w-3.5" />}
                        >
                          {session.current ? 'Çıkış Yap' : 'Oturumu Kapat'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Security Events & Audit Logs Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Güvenlik Bildirimleri</h2>
                  <p className="text-xs text-slate-400">
                    Hesabınız ve oturumlarınızla ilgili son güvenlik ve doğrulama olayları.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                {securityEvents.length} Bildirim
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              {eventsQuery.isLoading && (
                <div className="space-y-2">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="animate-pulse rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 space-y-2"
                    >
                      <div className="h-4 w-3/4 rounded bg-slate-800" />
                      <div className="h-3 w-1/2 rounded bg-slate-800/60" />
                    </div>
                  ))}
                </div>
              )}

              {eventsQuery.isError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
                  Bildirimler yüklenemedi.
                </div>
              )}

              {!eventsQuery.isLoading && !eventsQuery.isError && securityEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800/90 bg-slate-950/30 p-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-200">
                    Olağandışı bir güvenlik uyarısı bulunmuyor
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Tüm oturum ve giriş hareketleri güvenli protokoller dahilinde gerçekleşmiştir.
                  </p>
                </div>
              )}

              {!eventsQuery.isLoading &&
                securityEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 transition-colors"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 text-xs">
                      <p className="font-medium text-amber-200 leading-snug">{event.message}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                        {event.ipAddress && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3 text-slate-500" />
                            IP: {event.ipAddress}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Right 5/12: Step-up Reauthentication Form & Security Guidelines */}
        <div className="space-y-6 lg:col-span-5">
          {/* Reauth Form Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2.5 border-b border-slate-800/80 pb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Kritik İşlem Yeniden Doğrulama
                </h2>
                <p className="text-xs text-slate-400">
                  Hassas yönetim işlemlerinden önce güvenlik doğrulaması (Step-Up Auth).
                </p>
              </div>
            </div>

            {/* Reauth Alert State if active */}
            {isReauthenticated && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-200">Kimliğiniz Başarıyla Doğrulandı</p>
                  <p className="text-emerald-300/80">
                    1 gün süreyle kritik operasyonları ve yetki güncellemelerini gerçekleştirebilirsiniz.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleReauthSubmit} className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <p>
                    Doğrulama <strong>1 gün</strong> geçerlidir. Girişte kullandığınız MFA kodunun süresinin dolup yeni 6 haneli kodun oluşmasını bekleyin.
                  </p>
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Yönetici Şifreniz <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={reauthMutation.isPending}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2.5 pl-9 pr-10 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* OTP Input */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  6 Haneli MFA Doğrulama Kodu <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="123456"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    disabled={reauthMutation.isPending}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2.5 pl-9 pr-3 font-mono text-sm tracking-widest text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                loading={reauthMutation.isPending}
                disabled={reauthMutation.isPending || !password.trim() || otp.trim().length !== 6}
                leftIcon={<ShieldCheck className="h-4 w-4" />}
              >
                Kimliği Doğrula & Yetkilendir
              </Button>
            </form>
          </div>

          {/* Security Guidelines & Best Practices Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-sm backdrop-blur space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Sparkles className="h-4 w-4 text-sky-400" />
              <span>Güvenlik İlkeleri & Tavsiyeler</span>
            </div>

            <div className="space-y-3 text-xs text-slate-400">
              <div className="flex gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0 mt-1.5" />
                <p>
                  <strong className="text-slate-200">Ortak ve Paylaşımlı Cihazlar:</strong> İşiniz bittiğinde mutlaka oturumunuzu kapatın veya tüm cihazlardan çıkış yap seçeneğini kullanın.
                </p>
              </div>

              <div className="flex gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0 mt-1.5" />
                <p>
                  <strong className="text-slate-200">MFA Kod Güvenliği:</strong> Doğrulama kodlarınızı asla üçüncü şahıslarla paylaşmayın. Sistem hiçbir zaman telefonla veya e-posta ile MFA kodu talep etmez.
                </p>
              </div>

              <div className="flex gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0 mt-1.5" />
                <p>
                  <strong className="text-slate-200">Bilinmeyen Oturumlar:</strong> Tanımadığınız bir IP veya cihaz fark ettiğinizde derhal oturumu sonlandırıp şifrenizi yenileyin.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog: Revoke Single Session */}
      <ConfirmDialog
        isOpen={Boolean(sessionToClose)}
        onClose={() => setSessionToClose(null)}
        onConfirm={() => sessionToClose && revokeMutation.mutate(sessionToClose.id)}
        title={sessionToClose?.current ? 'Mevcut Oturumu Kapat' : 'Cihaz Oturumunu Kapat'}
        variant="danger"
        isLoading={revokeMutation.isPending}
        confirmLabel={sessionToClose?.current ? 'Çıkış Yap' : 'Oturumu Sonlandır'}
        cancelLabel="Vazgeç"
        message={
          <div>
            <p>
              <strong className="text-white">{sessionToClose?.deviceName}</strong> (
              <span className="font-mono text-slate-300">{sessionToClose?.ipAddress || 'IP Bilinmiyor'}</span>
              ) oturumu sonlandırılacak.
            </p>
            {sessionToClose?.current && (
              <p className="mt-2 text-xs font-semibold text-rose-400">
                Dikkat: Bu işlem geçerli oturumunuzu sonlandıracak ve giriş ekranına yönlendirileceksiniz.
              </p>
            )}
          </div>
        }
      />

      {/* Confirmation Dialog: Revoke All Sessions */}
      <ConfirmDialog
        isOpen={isCloseAllDialogOpen}
        onClose={() => setIsCloseAllDialogOpen(false)}
        onConfirm={() => revokeAllMutation.mutate()}
        title="Tüm Cihazlardan Çıkış Yap"
        variant="danger"
        isLoading={revokeAllMutation.isPending}
        confirmLabel="Tüm Oturumları Kapat"
        cancelLabel="Vazgeç"
        message={
          <div>
            <p>
              Hesabınıza ait tüm açık oturumlar ve yetkilendirmeler tek seferde sonlandırılacaktır.
            </p>
            <p className="mt-2 text-xs font-semibold text-rose-400">
              Mevcut oturumunuz da kapatılacak ve yeniden giriş yapmanız gerekecektir.
            </p>
          </div>
        }
      />
    </div>
  );
}
