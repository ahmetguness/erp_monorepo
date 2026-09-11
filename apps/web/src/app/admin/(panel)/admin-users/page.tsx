'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRoleKey, AdminUserSummary, InviteAdminInput, UpdateAdminInput } from '@repo/types';
import {
  listAdminUsers,
  inviteAdminUser,
  updateAdminUser,
  revokeAdminUserSessions,
} from '@/services/admin-users.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AdminUserEditor } from '@/components/features/admin/AdminUserEditor';
import { InviteAdminModal } from '@/components/features/admin/InviteAdminModal';
import { ADMIN_ROLE_CONFIGS } from '@/components/features/admin/AdminRoleSelector';
import {
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  X,
  Users,
  LogOut,
  Mail,
  Clock,
  AlertTriangle,
  FilterX,
  Laptop,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const detail = error.error;
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'message' in detail &&
      typeof detail.message === 'string'
    ) {
      return detail.message;
    }
  }
  return 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.';
}

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

type StatusFilter = 'ALL' | 'ACTIVE' | 'LOCKED' | 'PENDING';
type MfaFilter = 'ALL' | 'MFA_ENABLED' | 'MFA_DISABLED';

export default function AdminUsersPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = canAdmin(admin, 'admin-user.manage');
  const canRead = canAdmin(admin, 'admin-user.read');
  const queryClient = useQueryClient();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [mfaFilter, setMfaFilter] = useState<MfaFilter>('ALL');

  // Modals & Dialogs state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserSummary | null>(null);
  const [revokingUser, setRevokingUser] = useState<AdminUserSummary | null>(null);
  const [resendingUser, setResendingUser] = useState<AdminUserSummary | null>(null);

  // Queries
  const usersQuery = useQuery({
    queryKey: ['admin', 'admin-users'],
    queryFn: listAdminUsers,
    enabled: canRead,
  });

  const refreshList = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'admin-users'] });
  };

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: (input: InviteAdminInput) => inviteAdminUser(input),
    onSuccess: async () => {
      setIsInviteModalOpen(false);
      toast.success('Davet e-postası başarıyla gönderildi.');
      await refreshList();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminInput }) =>
      updateAdminUser(id, input),
    onSuccess: async (_, { id }) => {
      setEditingUser(null);
      toast.success('Yönetici yetkileri ve durumu güncellendi.');
      if (id === admin?.id) {
        toast.info('Kendi hesabınızı güncellediniz. Tekrar giriş yapılıyor…');
        setTimeout(() => window.location.assign('/admin/login'), 1000);
      } else {
        await refreshList();
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAdminUserSessions(id),
    onSuccess: async (_, id) => {
      setRevokingUser(null);
      toast.success('Yöneticinin tüm aktif oturumları kapatıldı.');
      if (id === admin?.id) {
        toast.info('Kendi oturumunuzu kapattınız. Giriş sayfasına yönlendiriliyorsunuz…');
        setTimeout(() => window.location.assign('/admin/login'), 1000);
      } else {
        await refreshList();
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (user: AdminUserSummary) =>
      inviteAdminUser({
        name: user.name,
        email: user.email,
        roles: user.roles,
      }),
    onSuccess: async () => {
      setResendingUser(null);
      toast.success('Davet e-postası tekrar gönderildi.');
      await refreshList();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const isPending =
    inviteMutation.isPending ||
    updateMutation.isPending ||
    revokeMutation.isPending ||
    resendInviteMutation.isPending;

  // Filtered Users
  const userList = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const filteredUsers = useMemo(() => {
    return userList.filter((user) => {
      // Search
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !search ||
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search);

      // Role
      const matchesRole =
        selectedRole === 'ALL' || user.roles.includes(selectedRole as AdminRoleKey);

      // Status
      let matchesStatus = true;
      if (statusFilter === 'ACTIVE') matchesStatus = user.isActive;
      else if (statusFilter === 'LOCKED') matchesStatus = !user.isActive;
      else if (statusFilter === 'PENDING')
        matchesStatus =
          user.invitationStatus === 'PENDING' || user.invitationStatus === 'EXPIRED';

      // MFA
      let matchesMfa = true;
      if (mfaFilter === 'MFA_ENABLED') matchesMfa = user.mfaEnabled;
      else if (mfaFilter === 'MFA_DISABLED') matchesMfa = !user.mfaEnabled;

      return matchesSearch && matchesRole && matchesStatus && matchesMfa;
    });
  }, [userList, searchTerm, selectedRole, statusFilter, mfaFilter]);

  // Key Metrics
  const metrics = useMemo(() => {
    const total = userList.length;
    const active = userList.filter((u) => u.isActive).length;
    const locked = total - active;
    const mfaEnabledCount = userList.filter((u) => u.mfaEnabled).length;
    const mfaPercent = total > 0 ? Math.round((mfaEnabledCount / total) * 100) : 0;
    const pendingInvites = userList.filter(
      (u) => u.invitationStatus === 'PENDING' || u.invitationStatus === 'EXPIRED',
    ).length;
    const activeSessionsCount = userList.reduce((acc, u) => acc + (u.activeSessionCount || 0), 0);

    return {
      total,
      active,
      locked,
      mfaEnabledCount,
      mfaPercent,
      pendingInvites,
      activeSessionsCount,
    };
  }, [userList]);

  const hasActiveFilters =
    Boolean(searchTerm) ||
    selectedRole !== 'ALL' ||
    statusFilter !== 'ALL' ||
    mfaFilter !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedRole('ALL');
    setStatusFilter('ALL');
    setMfaFilter('ALL');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Page Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/20 to-red-600/20 text-rose-400 ring-1 ring-rose-500/30">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight sm:text-2xl">
                Admin Kullanıcıları & Yetkilendirme
              </h1>
              <p className="text-xs text-slate-400">
                Platform yöneticilerini, rol bazlı erişim yetkilerini (RBAC) ve oturum güvenliğini yönetin.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={refreshList}
            loading={usersQuery.isFetching}
            leftIcon={<RefreshCw className={cn('h-4 w-4', usersQuery.isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>

          {canManage && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsInviteModalOpen(true)}
              leftIcon={<UserPlus className="h-4 w-4" />}
            >
              Yönetici Davet Et
            </Button>
          )}
        </div>
      </div>

      {/* KPI & Health Summary Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Admins */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Toplam Yönetici</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{metrics.total}</span>
            <span className="text-xs text-slate-400">
              ({metrics.active} Aktif, {metrics.locked} Kilitli)
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Platform idarecileri</span>
          </div>
        </div>

        {/* Metric 2: MFA Compliance */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">2FA / MFA Güvenliği</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">%{metrics.mfaPercent}</span>
            <span className="text-xs text-slate-400">
              ({metrics.mfaEnabledCount}/{metrics.total} Etkin)
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            {metrics.mfaPercent === 100 ? (
              <span className="text-emerald-400 font-medium">Tüm hesaplar koruma altında</span>
            ) : (
              <span className="text-amber-400 font-medium">{metrics.total - metrics.mfaEnabledCount} hesapta MFA bekleniyor</span>
            )}
          </div>
        </div>

        {/* Metric 3: Active Sessions */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Aktif Oturumlar</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Laptop className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{metrics.activeSessionsCount}</span>
            <span className="text-xs text-slate-400">Canlı Oturum</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Tüm yöneticiler genelinde</span>
          </div>
        </div>

        {/* Metric 4: Pending Invitations */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Bekleyen Davetler</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{metrics.pendingInvites}</span>
            <span className="text-xs text-slate-400">Bekleyen istek</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>24 saatlik süre limitli</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Yönetici adı veya e-posta ile ara…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Role & MFA Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Role Filter */}
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="h-9 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="ALL">Tüm Roller</option>
              {Object.entries(ADMIN_ROLE_CONFIGS).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label} ({config.badge})
                </option>
              ))}
            </select>

            {/* MFA Filter */}
            <select
              value={mfaFilter}
              onChange={(e) => setMfaFilter(e.target.value as MfaFilter)}
              className="h-9 rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="ALL">Tüm MFA Durumları</option>
              <option value="MFA_ENABLED">MFA Etkin</option>
              <option value="MFA_DISABLED">MFA Yapılandırılmadı</option>
            </select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                leftIcon={<FilterX className="h-3.5 w-3.5" />}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Filtreleri Temizle
              </Button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 border-t border-slate-800/80 pt-3">
          <span className="text-xs font-medium text-slate-400 mr-1.5">Durum:</span>
          {(
            [
              { key: 'ALL', label: 'Tümü' },
              { key: 'ACTIVE', label: 'Aktif Yöneticiler' },
              { key: 'LOCKED', label: 'Kilitli / Devre Dışı' },
              { key: 'PENDING', label: 'Davet Bekleyenler' },
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
                    ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading Skeleton */}
      {usersQuery.isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-slate-800" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 rounded bg-slate-800" />
                  <div className="h-3 w-48 rounded bg-slate-800/60" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-6 w-20 rounded-md bg-slate-800" />
                <div className="h-6 w-24 rounded-md bg-slate-800" />
              </div>
              <div className="h-8 w-full rounded-lg bg-slate-800/40" />
            </div>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {usersQuery.isError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-rose-200">Kullanıcı listesi yüklenemedi</p>
              <p className="text-xs text-rose-300/80">Sunucu ile bağlantı kurulurken bir hata oluştu.</p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => usersQuery.refetch()}>
            Tekrar Dene
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!usersQuery.isLoading && !usersQuery.isError && filteredUsers.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-200">
            Kriterlere uygun yönetici bulunamadı
          </h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            {hasActiveFilters
              ? 'Arama teriminizi veya filtrelerinizi değiştirerek tekrar deneyebilirsiniz.'
              : 'Henüz sistemde kayıtlı başka bir yönetici bulunmuyor.'}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="mt-4 text-xs"
              leftIcon={<FilterX className="h-3.5 w-3.5" />}
            >
              Filtreleri Temizle
            </Button>
          )}
        </div>
      )}

      {/* Admin Users Grid */}
      {!usersQuery.isLoading && filteredUsers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredUsers.map((user) => {
            const isCurrentUser = user.id === admin?.id;
            const isPendingInvite =
              user.invitationStatus === 'PENDING' || user.invitationStatus === 'EXPIRED';

            return (
              <div
                key={user.id}
                className={cn(
                  'relative flex flex-col justify-between rounded-2xl border bg-slate-900/50 p-5 shadow-sm transition-all duration-200 hover:border-slate-700/90 hover:bg-slate-900/80',
                  user.isActive
                    ? 'border-slate-800/90'
                    : 'border-rose-500/30 bg-rose-950/10',
                )}
              >
                <div>
                  {/* Card Header: Avatar, Name, Email, Quick Status Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-inner ring-1 ring-white/10',
                          user.isActive
                            ? 'bg-gradient-to-br from-slate-700 to-slate-800'
                            : 'bg-gradient-to-br from-rose-900 to-slate-900 text-rose-300',
                        )}
                      >
                        {user.name.charAt(0).toUpperCase()}
                        {/* Live active dot indicator */}
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-950',
                            user.isActive ? 'bg-emerald-400' : 'bg-rose-500',
                          )}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="truncate font-semibold text-slate-100 text-base">
                            {user.name}
                          </h3>
                          {isCurrentUser && (
                            <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">
                              Siz
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                          Kilitli
                        </span>
                      )}

                      {/* Invitation Status if applicable */}
                      {user.invitationStatus !== 'NONE' && (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium border',
                            user.invitationStatus === 'ACCEPTED'
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                              : user.invitationStatus === 'PENDING'
                                ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                                : 'border-rose-500/20 bg-rose-500/10 text-rose-400',
                          )}
                        >
                          {{
                            NONE: '',
                            PENDING: 'Davet Bekliyor',
                            EXPIRED: 'Davet Süresi Doldu',
                            ACCEPTED: 'Davet Kabul Edildi',
                          }[user.invitationStatus]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Role Tags Section */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {user.roles.map((roleKey) => {
                      const roleConfig = ADMIN_ROLE_CONFIGS[roleKey];
                      const Icon = roleConfig?.icon || Shield;
                      return (
                        <span
                          key={roleKey}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                            roleConfig?.colorClasses?.badgeBg || 'bg-slate-800',
                            roleConfig?.colorClasses?.badgeText || 'text-slate-300 border-slate-700',
                          )}
                          title={roleConfig?.description}
                        >
                          <Icon className={cn('h-3.5 w-3.5', roleConfig?.colorClasses?.iconColor)} />
                          <span>{roleConfig?.label || roleKey}</span>
                        </span>
                      );
                    })}
                  </div>

                  {/* Security & Activity Details Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-xs">
                    {/* MFA Status */}
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-md border',
                          user.mfaEnabled
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                            : 'border-amber-500/20 bg-amber-500/10 text-amber-400',
                        )}
                      >
                        {user.mfaEnabled ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">2FA / MFA</div>
                        <div className="font-medium text-slate-300">
                          {user.mfaEnabled ? 'Etkinleştirildi' : 'Kurulmadı'}
                        </div>
                      </div>
                    </div>

                    {/* Active Sessions */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400">
                        <Laptop className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Açık Oturum</div>
                        <div className="font-medium text-slate-300 flex items-center gap-1.5">
                          {user.activeSessionCount > 0 ? (
                            <>
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>{user.activeSessionCount} Oturum</span>
                            </>
                          ) : (
                            <span className="text-slate-500">Yok</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Last Login */}
                    <div className="col-span-2 flex items-center justify-between border-t border-slate-800/60 pt-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>Son Giriş:</span>
                        <span className="text-slate-300 font-medium">
                          {formatDateTime(user.lastLoginAt)}
                        </span>
                      </div>

                      {user.failedLoginCount > 0 && (
                        <div className="flex items-center gap-1 text-amber-400 font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          <span>{user.failedLoginCount} Başarısız Deneme</span>
                        </div>
                      )}
                    </div>

                    {/* Invitation Expiration if Pending */}
                    {user.invitationExpiresAt && isPendingInvite && (
                      <div className="col-span-2 flex items-center gap-1.5 border-t border-slate-800/60 pt-2 text-[11px] text-amber-400/90">
                        <Clock className="h-3 w-3 text-amber-400" />
                        <span>Davet Bitiş:</span>
                        <span className="font-medium">
                          {formatDateTime(user.invitationExpiresAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                {canManage && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setEditingUser(user)}
                        leftIcon={<Shield className="h-3.5 w-3.5 text-sky-400" />}
                      >
                        Yetki & Durum
                      </Button>

                      {isPendingInvite && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setResendingUser(user)}
                          leftIcon={<Mail className="h-3.5 w-3.5 text-amber-400" />}
                        >
                          Daveti Yenile
                        </Button>
                      )}
                    </div>

                    {user.activeSessionCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setRevokingUser(user)}
                        className="text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        leftIcon={<LogOut className="h-3.5 w-3.5" />}
                      >
                        Oturumları Kapat ({user.activeSessionCount})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals & Dialogs */}
      {/* 1. Invite Admin Modal */}
      <InviteAdminModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSubmit={(input) => inviteMutation.mutate(input)}
        pending={inviteMutation.isPending}
      />

      {/* 2. Edit Admin Modal */}
      {editingUser && (
        <AdminUserEditor
          key={editingUser.id}
          user={editingUser}
          pending={updateMutation.isPending}
          onClose={() => setEditingUser(null)}
          onSave={(input) => updateMutation.mutate({ id: editingUser.id, input })}
        />
      )}

      {/* 3. Revoke Sessions Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(revokingUser)}
        onClose={() => setRevokingUser(null)}
        onConfirm={() => revokingUser && revokeMutation.mutate(revokingUser.id)}
        title="Yönetici Oturumlarını Kapat"
        variant="danger"
        isLoading={revokeMutation.isPending}
        confirmLabel="Oturumları Kapat"
        cancelLabel="İptal"
        message={
          <div>
            <p>
              <strong className="text-white">{revokingUser?.name}</strong> yöneticisinin{' '}
              <strong className="text-rose-400">{revokingUser?.activeSessionCount}</strong> açık oturumu anında sonlandırılacak.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Yönetici panele devam edebilmek için yeniden giriş yapmak zorunda kalacaktır.
            </p>
          </div>
        }
      />

      {/* 4. Resend Invite Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(resendingUser)}
        onClose={() => setResendingUser(null)}
        onConfirm={() => resendingUser && resendInviteMutation.mutate(resendingUser)}
        title="Davet Bağlantısını Yeniden Gönder"
        variant="warning"
        isLoading={resendInviteMutation.isPending}
        confirmLabel="Daveti Gönder"
        cancelLabel="İptal"
        message={
          <div>
            <p>
              <strong className="text-white">{resendingUser?.email}</strong> adresine 24 saat geçerli yeni bir davet e-postası gönderilecek.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Eski davet bağlantısı geçersiz kılınacaktır.
            </p>
          </div>
        }
      />
    </div>
  );
}
