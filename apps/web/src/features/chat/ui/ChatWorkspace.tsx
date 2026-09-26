'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BellOff, CalendarPlus, Eraser, ListPlus, Pin, Search, Users } from 'lucide-react';
import type { ChatMessage } from '@repo/types/chat';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useTenantUsers } from '@/hooks/useUsers';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { useChatMutations, useChatSearch, useConversations, useCreateConversation, useMessages } from '../model/use-chat';
import { ConversationList } from './ConversationList';
import { EventDialog, PollDialog } from './ChatHeaderDialogs';
import { ForwardMessageModal } from './ForwardMessageModal';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';
import { NewConversationModal } from './NewConversationModal';

export function ChatWorkspace() {
  const me = useAuthStore((state) => state.user);
  const conversationsQuery = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const conversations = conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const messagesQuery = useMessages(selectedId);
  const actions = useChatMutations(selectedId);
  const messages = useMemo(() => (messagesQuery.data?.pages.flatMap((page) => page.items) ?? []).reverse(), [messagesQuery.data]);
  const lastMarkedReadRef = useRef<string | null>(null);
  const searchQuery = useChatSearch(search, selectedId ?? undefined);
  const shownMessages = search.trim().length >= 2 ? (searchQuery.data?.items ?? []).slice().reverse() : messages;
  const users = useTenantUsers();
  const create = useCreateConversation();

  useEffect(() => {
    const latestMessage = messages.at(-1);
    if (!selected || selected.unreadCount === 0 || !latestMessage || actions.read.isPending) return;
    const marker = `${selected.id}:${latestMessage.id}`;
    if (lastMarkedReadRef.current === marker) return;
    lastMarkedReadRef.current = marker;
    actions.read.mutate(latestMessage.id, {
      onError: () => {
        if (lastMarkedReadRef.current === marker) lastMarkedReadRef.current = null;
      },
    });
  }, [actions.read, messages, selected]);

  const send = async (content: string, files: File[]) => {
    try {
      const attachmentIds: string[] = [];
      for (const file of files) {
        const uploaded = await actions.upload.mutateAsync({ file, onProgress: () => undefined });
        attachmentIds.push(uploaded.id);
      }
      await actions.send.mutateAsync({ clientMessageId: crypto.randomUUID(), content: content || null, replyToMessageId: reply?.id, attachmentIds, mentionUserIds: [] });
      setReply(null);
    } catch (error: unknown) { toast.error(getErrorMessage(error)); }
  };

  const edit = (message: ChatMessage) => {
    const content = window.prompt('Mesajı düzenleyin', message.content ?? '');
    if (content?.trim()) actions.edit.mutate({ messageId: message.id, content, expectedUpdatedAt: message.updatedAt });
  };
  const forward = async (conversationIds: string[]): Promise<void> => {
    if (!forwardMessage) return;
    try {
      await actions.forward.mutateAsync({ messageId: forwardMessage.id, conversationIds });
      toast.success(conversationIds.length === 1 ? 'Mesaj iletildi.' : `Mesaj ${conversationIds.length} sohbete iletildi.`);
      setForwardMessage(null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  };

  const headerMutationError = (error: unknown) => toast.error(getErrorMessage(error));
  const isMuted = selected?.notificationLevel === 'NONE';

  return <div className="flex h-[calc(100vh-7rem)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50 shadow-2xl">
    <ConversationList conversations={conversations} selectedId={selectedId} hiddenOnMobile={Boolean(selectedId)} onSelect={(id) => { setSelectedId(id); setSearch(''); }} onCreate={() => setNewOpen(true)} />
    <main className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
      {!selected ? <div className="m-auto text-center text-slate-500"><Users className="mx-auto mb-3 h-10 w-10" /><p>Bir sohbet seçin veya yeni sohbet başlatın.</p></div> : <>
        <header className="flex items-center gap-2 border-b border-slate-800 p-3">
          <button className="md:hidden" onClick={() => setSelectedId(null)} aria-label="Sohbet listesine dön">←</button>
          <div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-white">{selected.title}</h2><p className="text-xs text-slate-500">{selected.members.length} katılımcı</p></div>
          <div className="hidden w-48 sm:block"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mesaj ara" prefixIcon={<Search className="h-4 w-4" />} /></div>
          <Button title="Anket oluştur" variant="ghost" size="sm" onClick={() => setPollOpen(true)} aria-label="Anket oluştur"><ListPlus className="h-4 w-4" /></Button>
          <Button title="Etkinlik oluştur" variant="ghost" size="sm" onClick={() => setEventOpen(true)} aria-label="Etkinlik oluştur"><CalendarPlus className="h-4 w-4" /></Button>
          <Button title={isMuted ? 'Bildirimleri aç' : 'Sessize al'} variant="ghost" size="sm" loading={actions.mute.isPending} className={isMuted ? 'bg-amber-500/15 text-amber-300' : undefined} onClick={() => actions.mute.mutate(!isMuted, { onSuccess: () => toast.success(isMuted ? 'Sohbet bildirimleri açıldı.' : 'Sohbet sessize alındı.'), onError: headerMutationError })} aria-label={isMuted ? 'Bildirimleri aç' : 'Sessize al'}><BellOff className="h-4 w-4" /></Button>
          <Button title={selected.pinnedAt ? 'Sabitlemeyi kaldır' : 'Sohbeti sabitle'} variant="ghost" size="sm" loading={actions.pinConversation.isPending} className={selected.pinnedAt ? 'bg-sky-500/15 text-sky-300' : undefined} onClick={() => actions.pinConversation.mutate(!selected.pinnedAt, { onSuccess: () => toast.success(selected.pinnedAt ? 'Sohbet sabitlemesi kaldırıldı.' : 'Sohbet sabitlendi.'), onError: headerMutationError })} aria-label={selected.pinnedAt ? 'Sabitlemeyi kaldır' : 'Sohbeti sabitle'}><Pin className={`h-4 w-4 ${selected.pinnedAt ? 'fill-current' : ''}`} /></Button>
          <Button title="Geçmişi temizle" variant="ghost" size="sm" onClick={() => setClearOpen(true)} aria-label="Geçmişi temizle"><Eraser className="h-4 w-4" /></Button>
        </header>
        <MessageList messages={shownMessages} currentUserId={me?.id} onReply={setReply} onDelete={(id) => actions.remove.mutate(id)} onEdit={edit} onForward={setForwardMessage} onReaction={(message, emoji) => actions.reaction.mutate({ messageId: message.id, emoji, reacted: !message.reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe) })} onStar={(message) => actions.star.mutate({ messageId: message.id, starred: !message.starredByMe })} onPin={(message) => actions.pinMessage.mutate({ messageId: message.id, pinned: !message.pinned })} onVote={(pollId, optionId) => actions.votePoll.mutate({ pollId, optionIds: [optionId] })} onEventResponse={(eventId, status) => actions.respondEvent.mutate({ eventId, status })} />
        <MessageComposer disabled={actions.send.isPending} replyLabel={reply?.content ?? undefined} onCancelReply={() => setReply(null)} onSend={send} />
      </>}
    </main>
    <NewConversationModal isOpen={newOpen} users={users.data ?? []} currentUserId={me?.id} pending={create.direct.isPending || create.group.isPending} onClose={() => setNewOpen(false)} onDirect={async (userId) => { const conversation = await create.direct.mutateAsync(userId); setSelectedId(conversation.id); setNewOpen(false); }} onGroup={async (title, memberIds) => { const conversation = await create.group.mutateAsync({ title, memberIds }); setSelectedId(conversation.id); setNewOpen(false); }} />
    <PollDialog isOpen={pollOpen} isPending={actions.createPoll.isPending} onClose={() => setPollOpen(false)} onSubmit={async (input) => { try { await actions.createPoll.mutateAsync(input); setPollOpen(false); toast.success('Anket yayınlandı.'); } catch (error: unknown) { headerMutationError(error); } }} />
    <EventDialog isOpen={eventOpen} isPending={actions.createEvent.isPending} onClose={() => setEventOpen(false)} onSubmit={async (input) => { try { await actions.createEvent.mutateAsync(input); setEventOpen(false); toast.success('Etkinlik yayınlandı.'); } catch (error: unknown) { headerMutationError(error); } }} />
    <ConfirmDialog isOpen={clearOpen} onClose={() => setClearOpen(false)} title="Sohbet geçmişini temizle" message="Bu işlem mesajları yalnızca sizin görünümünüzden kaldırır ve geri alınamaz." confirmLabel="Geçmişi temizle" isLoading={actions.clear.isPending} onConfirm={() => actions.clear.mutate(undefined, { onSuccess: () => { setClearOpen(false); setSearch(''); toast.success('Sohbet geçmişi temizlendi.'); }, onError: headerMutationError })} />
    <ForwardMessageModal isOpen={Boolean(forwardMessage)} message={forwardMessage} conversations={conversations} pending={actions.forward.isPending} onClose={() => setForwardMessage(null)} onSubmit={forward} />
  </div>;
}
