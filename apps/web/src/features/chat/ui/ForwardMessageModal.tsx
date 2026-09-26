'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChatConversation, ChatMessage } from '@repo/types/chat';
import { Check, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface ForwardMessageModalProps {
  isOpen: boolean;
  message: ChatMessage | null;
  conversations: ChatConversation[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (conversationIds: string[]) => Promise<void>;
}

export function ForwardMessageModal({ isOpen, message, conversations, pending, onClose, onSubmit }: ForwardMessageModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIds([]);
  }, [isOpen, message?.id]);

  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
    return conversations.filter((conversation) => conversation.id !== message?.conversationId
      && (!normalizedQuery || conversation.title.toLocaleLowerCase('tr-TR').includes(normalizedQuery)));
  }, [conversations, message?.conversationId, query]);

  const toggle = (conversationId: string): void => {
    setSelectedIds((current) => {
      if (current.includes(conversationId)) return current.filter((id) => id !== conversationId);
      return current.length < 10 ? [...current, conversationId] : current;
    });
  };
  const preview = message?.content?.trim() || (message?.attachments.length ? `${message.attachments.length} dosya` : 'Mesaj');

  return <Modal isOpen={isOpen} onClose={pending ? () => undefined : onClose} title="Mesajı ilet" description="Mesajı göndermek istediğiniz sohbetleri seçin." footer={<><Button variant="ghost" disabled={pending} onClick={onClose}>İptal</Button><Button loading={pending} disabled={selectedIds.length === 0} onClick={() => onSubmit(selectedIds)}>{selectedIds.length > 0 ? `${selectedIds.length} sohbete ilet` : 'İlet'}</Button></>}>
    <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">İletilecek mesaj</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-200">{preview}</p></div>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sohbet ara" prefixIcon={<Search className="h-4 w-4" />} autoFocus />
    <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
      {candidates.map((conversation) => {
        const selected = selectedIds.includes(conversation.id);
        return <button type="button" key={conversation.id} disabled={pending || (!selected && selectedIds.length >= 10)} onClick={() => toggle(conversation.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"><Users className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-100">{conversation.title}</strong><small className="block truncate text-slate-500">{conversation.lastMessage?.content ?? 'Henüz mesaj yok'}</small></span>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-slate-600'}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
        </button>;
      })}
      {selectedIds.length >= 10 && <p className="px-1 pt-1 text-xs text-amber-300">Tek işlemde en fazla 10 sohbet seçebilirsiniz.</p>}
      {candidates.length === 0 && <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">İletilebilecek sohbet bulunamadı.</div>}
    </div>
  </Modal>;
}
