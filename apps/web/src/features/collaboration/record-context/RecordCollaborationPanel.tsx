'use client';

import { useState } from 'react';
import { AtSign, CheckCircle2, MessageSquare, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import type { AuditEntityType } from '@/services/audit-log.service';
import { useCreateCollaborationEntry, useRecordCollaboration, useSetRecordFollowing } from './use-record-collaboration';
import type { CollaborationEntryType } from './record-collaboration.schemas';

interface Props { entityType: AuditEntityType; entityId: string; displayName: string }

export function RecordCollaborationPanel({ entityType, entityId, displayName }: Props) {
  const context = { entityType, entityId };
  const query = useRecordCollaboration(context);
  const createEntry = useCreateCollaborationEntry(context);
  const setFollowing = useSetRecordFollowing(context);
  const [type, setType] = useState<CollaborationEntryType>('COMMENT');
  const [content, setContent] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);

  const submit = async () => {
    if (!content.trim()) return;
    await createEntry.mutateAsync({ type, content, mentionIds });
    setContent('');
    setMentionIds([]);
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4" aria-label={`${displayName} işbirliği`}>
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Users className="h-4 w-4 text-sky-400" /> Kayıt işbirliği</h3><p className="mt-1 text-xs text-slate-500">Konuşma ve kararlar bu kayıtta kalır.</p></div>
        <Button size="sm" variant="outline" loading={setFollowing.isPending} onClick={() => setFollowing.mutate(!(query.data?.isFollowing ?? false))} leftIcon={<UserPlus className="h-3.5 w-3.5" />}>
          {query.data?.isFollowing ? 'Takipte' : 'Takip et'}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <Button size="sm" variant={type === 'COMMENT' ? 'secondary' : 'ghost'} onClick={() => setType('COMMENT')} leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>Yorum</Button>
          <Button size="sm" variant={type === 'DECISION' ? 'secondary' : 'ghost'} onClick={() => setType('DECISION')} leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}>Karar</Button>
        </div>
        <Textarea label={type === 'DECISION' ? 'Alınan karar' : 'Yorum'} value={content} onChange={(event) => setContent(event.target.value)} rows={3} />
        {(query.data?.mentionCandidates.length ?? 0) > 0 && (
          <label className="block space-y-1.5"><span className="flex items-center gap-1 text-xs font-medium text-slate-400"><AtSign className="h-3 w-3" /> Mention</span>
            <select multiple value={mentionIds} onChange={(event) => setMentionIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} className="min-h-20 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-500/60">
              {query.data?.mentionCandidates.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
            </select>
          </label>
        )}
        <Button size="sm" onClick={submit} disabled={!content.trim()} loading={createEntry.isPending}>Kaydet</Button>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
        {query.isLoading && <p className="text-xs text-slate-500">İşbirliği geçmişi yükleniyor…</p>}
        {query.isError && <p className="text-xs text-red-400">İşbirliği geçmişi alınamadı.</p>}
        {query.data?.entries.length === 0 && <p className="text-xs text-slate-500">Henüz yorum veya karar yok.</p>}
        {query.data?.entries.map((entry) => (
          <article key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex justify-between gap-3"><span className="text-xs font-medium text-slate-200">{entry.actor.name}</span><span className="text-[11px] text-slate-600">{new Date(entry.createdAt).toLocaleString('tr-TR')}</span></div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-sky-400">{entry.type === 'DECISION' ? 'Karar' : entry.type === 'EMAIL_LINK' ? 'E-posta' : 'Yorum'}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-300">{entry.content}</p>
          </article>
        ))}
      </div>
      {(query.data?.followers.length ?? 0) > 0 && <p className="mt-3 text-[11px] text-slate-500">{query.data?.followers.map((user) => user.name).join(', ')} takip ediyor.</p>}
    </section>
  );
}
