'use client';
import type { ChatConversation } from '@repo/types/chat';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
interface Props { conversations: ChatConversation[]; selectedId: string | null; hiddenOnMobile: boolean; onSelect: (id: string) => void; onCreate: () => void }
export function ConversationList({ conversations, selectedId, hiddenOnMobile, onSelect, onCreate }: Props) {
  return <aside className={`${hiddenOnMobile ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-800 md:w-80`}>
    <div className="flex items-center justify-between border-b border-slate-800 p-4"><div><h1 className="text-lg font-semibold text-white">Sohbet</h1><p className="text-xs text-slate-500">Tenant içi güvenli iletişim</p></div><Button size="sm" onClick={onCreate} aria-label="Yeni sohbet"><MessageSquarePlus className="h-4 w-4" /></Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">{conversations.map((conversation) => <button key={conversation.id} onClick={() => onSelect(conversation.id)} className={`mb-1 w-full rounded-xl p-3 text-left transition ${selectedId === conversation.id ? 'bg-sky-500/15 ring-1 ring-sky-500/30' : 'hover:bg-slate-900'}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-slate-100">{conversation.title}</span>{conversation.unreadCount > 0 && <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessage?.content ?? 'Henüz mesaj yok'}</p></button>)}{conversations.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Henüz sohbetiniz yok.</p>}</div>
  </aside>;
}
