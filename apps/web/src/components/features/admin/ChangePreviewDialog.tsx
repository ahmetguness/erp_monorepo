'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { previewAdminChange, type AdminChangePreviewInput } from '@/services/admin.service';

export interface ChangeMetadata { reason: string; ticketId?: string }

interface ChangePreviewDialogProps {
  input: AdminChangePreviewInput | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (metadata: ChangeMetadata) => void;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type OpenChangePreviewDialogProps = Omit<ChangePreviewDialogProps, 'input'> & {
  input: AdminChangePreviewInput;
};

function OpenChangePreviewDialog({ input, isSubmitting, onClose, onConfirm }: OpenChangePreviewDialogProps) {
  const [reason, setReason] = useState('');
  const [ticketId, setTicketId] = useState('');
  const preview = useQuery({
    queryKey: ['admin', 'change-preview', input],
    queryFn: () => previewAdminChange(input),
  });

  const valid = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="change-preview-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div><h2 id="change-preview-title" className="font-semibold text-white">Değişiklik Önizlemesi</h2><p className="mt-1 text-xs text-slate-500">Kaydetmeden önce etkiyi ve alan farklarını kontrol edin.</p></div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {preview.isLoading && <p className="text-sm text-slate-500">Önizleme hazırlanıyor…</p>}
          {preview.isError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Önizleme oluşturulamadı.</p>}
          {preview.data && <>
            <div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs text-slate-500">Etkilenen tenant</p><p className="mt-1 font-semibold text-white">{preview.data.affectedTenantCount}</p></div><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs text-slate-500">Etkilenen kullanıcı</p><p className="mt-1 font-semibold text-white">{preview.data.affectedUserCount}</p></div></div>
            <div className="overflow-hidden rounded-lg border border-slate-800">{preview.data.changes.map((item) => <div key={item.field} className="grid gap-2 border-b border-slate-800 p-3 text-xs last:border-0 sm:grid-cols-[140px_1fr_24px_1fr]"><span className="font-medium text-slate-300">{item.label}</span><span className="break-words text-slate-500">{displayValue(item.before)}</span><span className="text-center text-slate-600">→</span><span className="break-words text-white">{displayValue(item.after)}</span></div>)}</div>
            {preview.data.warnings.map((warning) => <p key={warning} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{warning}</p>)}
          </>}
          <label className="block text-xs font-medium text-slate-300">Gerekçe <span className="text-red-400">*</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" placeholder="En az 10 karakter ile iş gereksinimini açıklayın" /></label>
          <label className="block text-xs font-medium text-slate-300">Ticket numarası <span className="text-slate-600">(opsiyonel)</span><input value={ticketId} onChange={(event) => setTicketId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" placeholder="Örn. OPS-1234" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300">Vazgeç</button><button type="button" disabled={!preview.data || !valid || isSubmitting} onClick={() => onConfirm({ reason: reason.trim(), ticketId: ticketId.trim() || undefined })} className="rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{isSubmitting ? 'Gönderiliyor…' : 'Onaya Gönder'}</button></div>
      </div>
    </div>
  );
}

export function ChangePreviewDialog(props: ChangePreviewDialogProps) {
  if (!props.input) return null;
  return <OpenChangePreviewDialog {...props} input={props.input} />;
}
