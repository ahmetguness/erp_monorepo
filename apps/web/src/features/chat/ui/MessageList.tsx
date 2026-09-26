'use client';

import type { ChatMessage, ChatPollView } from '@repo/types/chat';
import { Check, Copy, Forward, LockKeyhole, Pencil, Pin, Reply, Star, Trash2, Users } from 'lucide-react';
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

function PollCard({ poll, onVote }: { poll: ChatPollView; onVote: (pollId: string, optionId: string) => void }) {
  const totalVotes = poll.options.reduce((total, option) => total + option.voteCount, 0);
  const closed = Boolean(poll.closedAt) || (poll.closesAt ? new Date(poll.closesAt).getTime() <= Date.now() : false);

  return <div className="mt-3 w-[min(22rem,70vw)] overflow-hidden rounded-xl border border-white/15 bg-slate-950/35 shadow-sm">
    <div className="border-b border-white/10 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <strong className="text-sm leading-5 text-white">{poll.question}</strong>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${closed ? 'bg-slate-500/25 text-slate-300' : 'bg-emerald-500/20 text-emerald-200'}`}>{closed ? 'Kapandı' : 'Açık'}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-300/80">
        <span>{poll.multiple ? 'Birden fazla seçenek' : 'Tek seçenek'}</span><span>·</span><span>{totalVotes} oy</span>
        {poll.anonymous && <span className="inline-flex items-center gap-1"><LockKeyhole className="h-3 w-3" /> Anonim</span>}
      </div>
    </div>
    <div className="space-y-2 p-2.5">
      {poll.options.map((option) => {
        const percentage = totalVotes === 0 ? 0 : Math.round((option.voteCount / totalVotes) * 100);
        return <button type="button" disabled={closed} onClick={() => onVote(poll.id, option.id)} key={option.id} className={`relative block w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors ${option.selectedByMe ? 'border-sky-300/50 bg-sky-400/15' : 'border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/10'} disabled:cursor-default disabled:hover:bg-black/15`}>
          <span className="absolute inset-y-0 left-0 bg-sky-400/10 transition-[width]" style={{ width: `${percentage}%` }} />
          <span className="relative flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-medium text-white"><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${option.selectedByMe ? 'border-sky-300 bg-sky-400 text-slate-950' : 'border-slate-400/70'}`}>{option.selectedByMe && <Check className="h-3 w-3" />}</span><span className="truncate">{option.label}</span></span>
            <span className="shrink-0 tabular-nums text-slate-200">{percentage}% · {option.voteCount}</span>
          </span>
          {!poll.anonymous && option.voters.length > 0 && <span className="relative mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2 text-[10px] text-slate-300"><Users className="h-3 w-3" />{option.voters.map((voter) => <span key={voter.id} className="rounded-full bg-white/10 px-2 py-0.5">{voter.name}</span>)}</span>}
        </button>;
      })}
    </div>
  </div>;
}

function MessageActions({ message, mine, reacted, actions }: { message: ChatMessage; mine: boolean; reacted: boolean; actions: Props }) {
  const buttonClass = 'rounded p-1 hover:bg-slate-700 hover:text-white';
  return <div className={`pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-900/95 p-1 text-slate-300 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${mine ? 'right-0' : 'left-0'}`}>
    <button className={buttonClass} onClick={() => actions.onReply(message)} title="Yanıtla" aria-label="Yanıtla"><Reply className="h-3.5 w-3.5" /></button>
    <button className={buttonClass} onClick={() => void navigator.clipboard.writeText(message.content ?? '')} title="Kopyala" aria-label="Kopyala"><Copy className="h-3.5 w-3.5" /></button>
    <button className={buttonClass} onClick={() => actions.onForward(message)} title="İlet" aria-label="İlet"><Forward className="h-3.5 w-3.5" /></button>
    <button className={`${buttonClass} ${reacted ? 'bg-emerald-500/20 opacity-100' : 'opacity-70'}`} onClick={() => actions.onReaction(message, '✅')} title="Tepki ver" aria-label="Tepki ver">✅</button>
    <button className={buttonClass} onClick={() => actions.onStar(message)} title="Yıldızla" aria-label="Yıldızla"><Star className={`h-3.5 w-3.5 ${message.starredByMe ? 'fill-current text-amber-300' : ''}`} /></button>
    <button className={buttonClass} onClick={() => actions.onPin(message)} title="Sabitle" aria-label="Sabitle"><Pin className={`h-3.5 w-3.5 ${message.pinned ? 'fill-current text-sky-300' : ''}`} /></button>
    {mine && <><button className={buttonClass} onClick={() => actions.onEdit(message)} title="Düzenle" aria-label="Düzenle"><Pencil className="h-3.5 w-3.5" /></button><button className="rounded p-1 hover:bg-red-500/20 hover:text-red-300" onClick={() => actions.onDelete(message.id)} title="Sil" aria-label="Sil"><Trash2 className="h-3.5 w-3.5" /></button></>}
  </div>;
}

export function MessageList(props: Props) {
  return <section className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4" aria-live="polite">{props.messages.map((message) => {
    const mine = message.sender.id === props.currentUserId;
    const reacted = message.reactions.some((reaction) => reaction.emoji === '✅' && reaction.reactedByMe);
    return <article key={message.id} className={`group flex py-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
        <div className="mb-1 text-[11px] font-medium opacity-70">{message.sender.name}</div>
        {message.forwarded && <div className="mb-1 text-[10px] italic opacity-65">İletildi</div>}
        {message.replyTo && <div className="mb-2 rounded border-l-2 border-white/50 bg-black/10 px-2 py-1 text-xs opacity-80">{message.replyTo.senderName}: {message.replyTo.content ?? 'Silinmiş mesaj'}</div>}
        <p className="whitespace-pre-wrap break-words text-sm">{message.deletedAt ? 'Bu mesaj silindi.' : message.content}</p>
        {message.poll && <PollCard poll={message.poll} onVote={props.onVote} />}
        {message.event && <div className="mt-2 rounded-lg bg-black/15 p-2 text-xs"><strong className="block text-sm">{message.event.title}</strong><time className="block opacity-75">{new Date(message.event.startsAt).toLocaleString('tr-TR')}</time><div className="mt-2 flex flex-wrap gap-1">{([['GOING', 'Katılıyorum'], ['MAYBE', 'Belki'], ['DECLINED', 'Katılamıyorum']] as const).map(([status, label]) => <button type="button" onClick={() => props.onEventResponse(message.event!.id, status)} className={`rounded px-2 py-1 ${message.event?.myResponse === status ? 'bg-white/25' : 'bg-black/10'}`} key={status}>{label}</button>)}</div></div>}
        {message.attachments.map((attachment) => <a className="mt-2 block rounded-lg bg-black/15 px-2 py-1 text-xs underline" key={attachment.id} href={`${API_BASE_URL}/api/chat/attachments/${attachment.id}/download`}>{attachment.originalName}</a>)}
        <div className="relative mt-1 h-8">
          <div className="absolute inset-0 flex items-center justify-end gap-1 text-[10px] opacity-65 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">{message.editedAt && <span>düzenlendi · </span>}<time>{new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time></div>
          {!message.deletedAt && <MessageActions message={message} mine={mine} reacted={reacted} actions={props} />}
        </div>
      </div>
    </article>;
  })}</section>;
}
