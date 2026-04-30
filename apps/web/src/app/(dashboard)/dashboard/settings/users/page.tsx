'use client';
'use no memo';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Mail, X, Clock, CheckCircle2, XCircle, Ban, Send, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { getInvitations, createInvitation, cancelInvitation, type Invitation } from '@/services/invitation.service';
import { useTenantUsers } from '@/hooks/useUsers';
import { useRoles } from '@/hooks/useRoles';
import { useUIStore } from '@/store/ui.store';
import { useCurrentUser } from '@/hooks/useAuth';
import { getErrorMessage } from '@/types/api.types';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning', icon: Clock },
  ACCEPTED: { label: 'Kabul Edildi', variant: 'success', icon: CheckCircle2 },
  EXPIRED: { label: 'Süresi Doldu', variant: 'neutral', icon: XCircle },
  CANCELLED: { label: 'İptal', variant: 'danger', icon: Ban },
};

export default function UsersAndInvitesPage() {
  const { tenant } = useCurrentUser();
  const { toast } = useUIStore();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const { data: users = [], isLoading: usersLoading } = useTenantUsers();
  const { data: rolesData } = useRoles({ page: 1, limit: 50 });
  const roles = rolesData?.data ?? [];
  const { data: invitations = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['invitations'],
    queryFn: getInvitations,
  });

  const sendInvite = useMutation({
    mutationFn: () => createInvitation(email, selectedRoleId || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      toast.success('Davet gönderildi.');
      setInviteOpen(false);
      setEmail('');
      setSelectedRoleId('');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelInvitation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      toast.success('Davet iptal edildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const pendingInvites = invitations.filter((i) => i.status === 'PENDING');
  const pastInvites = invitations.filter((i) => i.status !== 'PENDING');

  return (
    <div>
      <PageHeader
        title="Kullanıcılar & Davetler"
        subtitle="Ekip üyelerinizi yönetin ve yeni kullanıcılar davet edin."
        action={
          <Button size="sm" leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            onClick={() => setInviteOpen(true)}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-500/20">
            Kullanıcı Davet Et
          </Button>
        }
      />

      {/* Mevcut Üyeler */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Ekip Üyeleri</h3>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Kullanıcı</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Rol</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {users.map((tu) => {
                  const u = tu.user || tu;
                  return (
                    <tr key={tu.id || u.id} className="border-b border-slate-800/50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                            {(u.name || '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm text-slate-200 font-medium">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                          {tu.isOwner && (
                            <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">OWNER</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{tu.roleRef?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive !== false ? 'success' : 'danger'}>
                          {u.isActive !== false ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bekleyen Davetler */}
      {pendingInvites.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Bekleyen Davetler</h3>
          <div className="space-y-2">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-200">{inv.email}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(inv.expiresAt) > new Date()
                      ? `${Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))} saat kaldı`
                      : 'Süresi doldu'}
                  </p>
                </div>
                <Badge variant="warning">Bekliyor</Badge>
                <button onClick={() => cancel.mutate(inv.id)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="İptal et">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Geçmiş Davetler */}
      {pastInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Geçmiş Davetler</h3>
          <div className="space-y-2">
            {pastInvites.map((inv) => {
              const s = STATUS_MAP[inv.status] || STATUS_MAP.EXPIRED;
              const Icon = s.icon;
              return (
                <div key={inv.id} className="flex items-center gap-3 bg-slate-900/50 border border-slate-800/50 rounded-xl px-4 py-3 opacity-60">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-400">{inv.email}</p>
                    <p className="text-xs text-slate-600">{new Date(inv.createdAt).toLocaleDateString('tr-TR')}</p>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Davet Modal */}
      <Modal isOpen={inviteOpen} onClose={() => { setInviteOpen(false); setEmail(''); setSelectedRoleId(''); }}
        title="Kullanıcı Davet Et" description="E-posta adresine davet linki gönderilecek." size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setInviteOpen(false); setEmail(''); setSelectedRoleId(''); }}>İptal</Button>
            <Button size="sm" loading={sendInvite.isPending}
              disabled={!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
              leftIcon={<Send className="w-3.5 h-3.5" />}
              onClick={() => sendInvite.mutate()}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500">
              Davet Gönder
            </Button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">E-posta Adresi</label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <Mail className="w-[18px] h-[18px]" />
              </div>
              <input type="email" placeholder="kullanici@sirket.com" value={email}
                onChange={(e) => setEmail(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendInvite.mutate(); } }}
                className="w-full h-12 pl-11 pr-4 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-all" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Rol</label>
            <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}
              className="w-full h-12 px-4 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-all">
              <option value="">Rol seçilmedi (varsayılan)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.description ? ` — ${r.description}` : ''}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              {roles.length === 0
                ? 'Henüz rol tanımlanmamış. Rol Yönetimi sayfasından oluşturabilirsiniz.'
                : 'Kullanıcının erişebileceği modül ve işlemleri belirler.'}
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Davet linki 48 saat geçerlidir. Kullanıcı linke tıklayarak adını ve şifresini belirleyecek.
          </p>
        </div>
      </Modal>
    </div>
  );
}
