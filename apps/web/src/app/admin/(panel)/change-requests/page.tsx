'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldAlert, X } from 'lucide-react';
import type { AdminChangeRequest, AdminChangeRequestType } from '@repo/types';
import { approveAdminChangeRequest, getAdminChangeRequests, rejectAdminChangeRequest, rollbackAdminChangeRequest } from '@/services/admin.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';

const TYPE_LABELS: Record<AdminChangeRequestType, string> = {
  TENANT_PLAN_UPDATE: 'Enterprise plan değişikliği',
  TENANT_STATUS_UPDATE: 'Kritik tenant durum değişikliği',
  PLAN_FEATURE_UPDATE: 'Plan özelliği değişikliği',
  FEATURE_OVERRIDE_UPSERT: 'Kalıcı özellik override değişikliği',
  FEATURE_OVERRIDE_DELETE: 'Kalıcı özellik override kaldırma',
  FEATURE_ROLLOUT_ACTIVATE: 'Feature rollout aktivasyonu',
};

function ChangeRequestCard({ request }: { request: AdminChangeRequest }) {
  const admin = useAdminAuthStore((state) => state.admin);
  const queryClient = useQueryClient();
  const isMaker = admin?.id === request.requestedBy.id;
  const canApprove = !isMaker && canAdmin(admin, request.requiredPermission);
  const canReject = canApprove && canAdmin(admin, 'change-request.reject');
  const canRollback = request.canRollback && canAdmin(admin, request.requiredPermission);

  const decide = useMutation({
    mutationFn: ({ action }: { action: 'approve' | 'reject' | 'rollback' }) => {
      if (action === 'approve') return approveAdminChangeRequest(request.id);
      if (action === 'reject') return rejectAdminChangeRequest(request.id);
      return rollbackAdminChangeRequest(request.id, `Geri alma: ${request.reason}`, request.ticketId ?? undefined);
    },
    onSuccess: async (_, variables) => {
      toast.success(variables.action === 'approve' ? 'Talep onaylandı ve uygulandı.' : variables.action === 'reject' ? 'Talep reddedildi.' : 'Değişiklik geri alındı.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'change-requests'] });
    },
    onError: () => toast.error('Talep işlenemedi.'),
  });

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{TYPE_LABELS[request.type]}</p>
          <p className="mt-1 text-xs text-slate-400">{request.targetLabel}</p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">{request.status}</span>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div><dt className="text-slate-500">Talep eden</dt><dd className="mt-1 text-slate-200">{request.requestedBy.name}</dd></div>
        <div><dt className="text-slate-500">Etkilenen tenant</dt><dd className="mt-1 text-slate-200">{request.affectedTenantCount}</dd></div>
        <div><dt className="text-slate-500">Etkilenen kullanıcı</dt><dd className="mt-1 text-slate-200">{request.affectedUserCount}</dd></div>
      </dl>
      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs"><p className="text-slate-500">Gerekçe</p><p className="mt-1 text-slate-200">{request.reason}</p>{request.ticketId && <p className="mt-2 text-slate-400">Ticket: {request.ticketId}</p>}</div>
      <div className="mt-4 grid gap-3 rounded-lg bg-slate-950 p-3 text-xs sm:grid-cols-2">
        <div><p className="mb-1 text-slate-500">Önceki değer</p><pre className="overflow-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(request.previousValues, null, 2)}</pre></div>
        <div><p className="mb-1 text-slate-500">Talep edilen değer</p><pre className="overflow-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(request.payload, null, 2)}</pre></div>
      </div>
      {request.status === 'PENDING' && isMaker && <p className="mt-4 flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="h-4 w-4" /> Kendi talebinizi onaylayamaz veya reddedemezsiniz.</p>}
      <div className="mt-4 flex justify-end gap-2">
        {request.status === 'PENDING' && canReject && <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ action: 'reject' })} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-50"><X className="h-4 w-4" /> Reddet</button>}
        {request.status === 'PENDING' && canApprove && <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ action: 'approve' })} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"><Check className="h-4 w-4" /> Onayla ve Uygula</button>}
        {canRollback && <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ action: 'rollback' })} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-50">Geri Al</button>}
      </div>
    </article>
  );
}

export default function AdminChangeRequestsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'change-requests'],
    queryFn: () => getAdminChangeRequests(),
  });
  return (
    <div className="space-y-5">
      <div><h1 className="text-lg font-semibold text-white">Onay Talepleri</h1><p className="mt-1 text-sm text-slate-500">Yüksek etkili değişiklikleri ikinci bir yetkili admin değerlendirir.</p></div>
      {isLoading ? <p className="text-sm text-slate-500">Yükleniyor…</p> : data.length === 0 ? <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">Değişiklik talebi yok.</div> : data.map((request) => <ChangeRequestCard key={request.id} request={request} />)}
    </div>
  );
}
