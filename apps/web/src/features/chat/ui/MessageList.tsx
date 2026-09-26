'use client';

import type { ChatMessage } from '@repo/types/chat';
import { Copy, Forward, Pencil, Pin, Reply, Star, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '@/lib/constants';

interface Props {
  messages: ChatMessage[];
  currentUserId?: string;
  onReply: (message: ChatMessage) => void;
  onDelete: (id: string) => void;
  onEdit: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emoji: string) => void;
  onStar: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onVote: (pollId: string, optionId: string) => void;
  onEventResponse: (eventId: string, status: 'GOING' | 'MAYBE' | 'DECLINED') => void;
}

export function MessageList(props: Props) {
  return <section className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">{props.messages.map((message) => {
    const mine = message.sender.id === props.currentUserId;
    const reacted = message.reactions.some((reaction) => reaction.emoji === '✅' && reaction.reactedByMe);
    return <article key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
      <div className="mb-1 text-[11px] font-medium opacity-70">{message.sender.name}</div>
      {message.forwarded && <div className="mb-1 text-[10px] italic opacity-65">İletildi</div>}
      {message.replyTo && <div className="mb-2 rounded border-l-2 border-white/50 bg-black/10 px-2 py-1 text-xs opacity-80">{message.replyTo.senderName}: {message.replyTo.content ?? 'Silinmiş mesaj'}</div>}
      <p className="whitespace-pre-wrap break-words text-sm">{message.deletedAt ? 'Bu mesaj silindi.' : message.content}</p>
      {message.poll && <div className="mt-2 space-y-1 rounded-lg bg-black/15 p-2"><strong className="text-sm">{message.poll.question}</strong>{message.poll.options.map((option) => <button type="button" disabled={Boolean(message.poll?.closedAt)} onClick={() => props.onVote(message.poll!.id, option.id)} key={option.id} className={`flex w-full justify-between rounded px-2 py-1 text-xs ${option.selectedByMe ? 'bg-white/25' : 'bg-black/10 hover:bg-white/10'}`}><span>{option.label}</span><span>{option.voteCount}</span></button>)}</div>}
      {message.event && <div className="mt-2 rounded-lg bg-black/15 p-2 text-xs"><strong className="block text-sm">{message.event.title}</strong><time className="block opacity-75">{new Date(message.event.startsAt).toLocaleString('tr-TR')}</time><div className="mt-2 flex flex-wrap gap-1">{([['GOING', 'Katılıyorum'], ['MAYBE', 'Belki'], ['DECLINED', 'Katılamıyorum']] as const).map(([status, label]) => <button type="button" onClick={() => props.onEventResponse(message.event!.id, status)} className={`rounded px-2 py-1 ${message.event?.myResponse === status ? 'bg-white/25' : 'bg-black/10'}`} key={status}>{label}</button>)}</div></div>}
      {message.attachments.map((attachment) => <a className="mt-2 block rounded-lg bg-black/15 px-2 py-1 text-xs underline" key={attachment.id} href={`${API_BASE_URL}/api/chat/attachments/${attachment.id}/download`}>{attachment.originalName}</a>)}
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-65">{message.editedAt && <span>düzenlendi · </span>}<time>{new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time></div>
      {!message.deletedAt && <div className="mt-1 hidden items-center gap-2 group-hover:flex"><button onClick={() => props.onReply(message)} title="Yanıtla"><Reply className="h-3.5 w-3.5" /></button><button onClick={() => void navigator.clipboard.writeText(message.content ?? '')} title="Kopyala"><Copy className="h-3.5 w-3.5" /></button><button onClick={() => props.onForward(message)} title="İlet"><Forward className="h-3.5 w-3.5" /></button><button onClick={() => props.onReaction(message, '✅')} title="Tepki ver" className={reacted ? 'opacity-100' : 'opacity-60'}>✅</button><button onClick={() => props.onStar(message)} title="Yıldızla"><Star className={`h-3.5 w-3.5 ${message.starredByMe ? 'fill-current' : ''}`} /></button><button onClick={() => props.onPin(message)} title="Sabitle"><Pin className={`h-3.5 w-3.5 ${message.pinned ? 'fill-current' : ''}`} /></button>{mine && <><button onClick={() => props.onEdit(message)} title="Düzenle"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => props.onDelete(message.id)} title="Sil"><Trash2 className="h-3.5 w-3.5" /></button></>}</div>}
    </div></article>;
  })}</section>;
}
