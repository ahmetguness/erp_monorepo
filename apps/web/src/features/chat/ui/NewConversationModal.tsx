'use client';
import { useState } from 'react';
import { MessageSquarePlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { TenantUser } from '@/services/user.service';
interface Props { isOpen: boolean; users: TenantUser[]; currentUserId?: string; pending: boolean; onClose: () => void; onDirect: (userId: string) => Promise<void>; onGroup: (title: string, memberIds: string[]) => Promise<void> }
export function NewConversationModal({ isOpen, users, currentUserId, pending, onClose, onDirect, onGroup }: Props) {
  const [groupMode, setGroupMode] = useState(false); const [title, setTitle] = useState(''); const [selected, setSelected] = useState<string[]>([]);
  const candidates = users.filter((member) => member.user.id !== currentUserId && member.isActive);
  return <Modal isOpen={isOpen} onClose={onClose} title={groupMode ? 'Yeni grup' : 'Yeni sohbet'} footer={<Button variant="ghost" onClick={() => setGroupMode((value) => !value)} leftIcon={<Users className="h-4 w-4" />}>{groupMode ? 'Bire bir sohbet' : 'Grup oluştur'}</Button>}>
    {groupMode && <Input label="Grup adı" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />}
    <div className="mt-3 space-y-2">{candidates.map((member) => { const checked = selected.includes(member.user.id); return <button key={member.user.id} disabled={pending} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left hover:bg-slate-800 ${checked ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800'}`} onClick={async () => { if (groupMode) setSelected((ids) => checked ? ids.filter((id) => id !== member.user.id) : [...ids, member.user.id]); else await onDirect(member.user.id); }}><span><strong className="block text-slate-100">{member.user.name}</strong><small className="text-slate-500">{member.user.email}</small></span><MessageSquarePlus className="h-4 w-4 text-sky-400" /></button>; })}</div>
    {groupMode && <Button className="mt-4 w-full" disabled={!title.trim() || selected.length === 0} loading={pending} onClick={() => onGroup(title.trim(), selected)}>Grubu oluştur</Button>}
  </Modal>;
}
