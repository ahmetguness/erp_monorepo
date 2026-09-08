'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TenantSupportNote } from '@repo/types';
import { addTenantSupportNote } from '@/services/tenant-360.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';

export function TenantSupportPanel({ tenantId, notes }: { tenantId: string; notes: TenantSupportNote[] }) {
  const [body, setBody] = useState('');
  const [ticketId, setTicketId] = useState('');
  const admin = useAdminAuthStore(state => state.admin);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => addTenantSupportNote(tenantId, body.trim(), ticketId.trim()),
    onSuccess: async () => {
      setBody(''); setTicketId('');
      await client.invalidateQueries({ queryKey: ['admin', 'tenant-360', tenantId] });
    },
  });
  return <div className="space-y-4">
    <p className="text-sm text-slate-500">Son 100 destek notu. Notlar yazar ve tarih bilgisiyle saklanır; sonradan değiştirilmez.</p>
    {canAdmin(admin, 'tenant.settings.update') && <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!mutation.isPending && body.trim().length >= 10) mutation.mutate(); }}>
      <label className="block">Destek notu<textarea className="mt-1 block w-full rounded border p-2" value={body} onChange={event => setBody(event.target.value)} minLength={10} maxLength={4000} required disabled={mutation.isPending} /></label>
      <label className="block">Talep numarası (isteğe bağlı)<input className="ml-2 rounded border p-2" value={ticketId} onChange={event => setTicketId(event.target.value)} maxLength={120} disabled={mutation.isPending} /></label>
      <button className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50" disabled={mutation.isPending || body.trim().length < 10}>{mutation.isPending ? 'Kaydediliyor…' : 'Not ekle'}</button>
      {mutation.isError && <p role="alert" className="text-red-600">Not kaydedilemedi. Oturumunuzu ve yetkinizi kontrol edip tekrar deneyin.</p>}
      {mutation.isSuccess && <p role="status">Not kaydedildi.</p>}
    </form>}
    {notes.length === 0 && <p>Henüz destek notu yok.</p>}
    {notes.map(note => <article key={note.id} className="rounded border p-4"><p className="whitespace-pre-wrap break-words">{note.body}</p><p className="mt-2 text-sm text-slate-500">{note.author.name} · {new Date(note.createdAt).toLocaleString('tr-TR')} {note.ticketId && `· ${note.ticketId}`}</p></article>)}
  </div>;
}
