'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500';

interface PollDialogProps {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: { question: string; options: string[]; multiple: boolean; anonymous: boolean }) => Promise<void>;
}

export function PollDialog({ isOpen, isPending, onClose, onSubmit }: PollDialogProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  useEffect(() => { if (!isOpen) { setQuestion(''); setOptions(['', '']); setMultiple(false); setAnonymous(false); } }, [isOpen]);
  const validOptions = options.map((option) => option.trim()).filter(Boolean);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || validOptions.length < 2) return;
    await onSubmit({ question: question.trim(), options: validOptions, multiple, anonymous });
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="Anket oluştur" description="Katılımcıların sohbet içinden oy verebileceği bir anket hazırlayın." footer={<><Button variant="ghost" disabled={isPending} onClick={onClose}>İptal</Button><Button type="submit" form="chat-poll-form" loading={isPending} disabled={!question.trim() || validOptions.length < 2}>Anketi yayınla</Button></>}>
    <form id="chat-poll-form" onSubmit={submit} className="space-y-4">
      <Input label="Soru" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} autoFocus />
      <div className="space-y-2"><span className="text-sm font-medium text-slate-300">Seçenekler</span>{options.map((option, index) => <div className="flex gap-2" key={index}><input className={fieldClass} value={option} maxLength={200} placeholder={`${index + 1}. seçenek`} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{options.length > 2 && <Button type="button" variant="ghost" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Sil</Button>}</div>)}{options.length < 12 && <Button type="button" size="sm" variant="outline" onClick={() => setOptions((current) => [...current, ''])}>Seçenek ekle</Button>}</div>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={multiple} onChange={(event) => setMultiple(event.target.checked)} />Birden fazla seçenek işaretlenebilsin</label>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />Oy verenler anonim olsun</label>
    </form>
  </Modal>;
}

interface EventDialogProps {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; startsAt: string; endsAt: string; timezone: string }) => Promise<void>;
}

export function EventDialog({ isOpen, isPending, onClose, onSubmit }: EventDialogProps) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  useEffect(() => { if (!isOpen) { setTitle(''); setStartsAt(''); setEndsAt(''); } }, [isOpen]);
  const validRange = Boolean(startsAt && endsAt && new Date(endsAt) > new Date(startsAt));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !validRange) return;
    await onSubmit({ title: title.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="Etkinlik oluştur" description="Tarih ve saat bilgilerini katılımcıların yerel saat diliminde gösterir." footer={<><Button variant="ghost" disabled={isPending} onClick={onClose}>İptal</Button><Button type="submit" form="chat-event-form" loading={isPending} disabled={!title.trim() || !validRange}>Etkinliği yayınla</Button></>}>
    <form id="chat-event-form" onSubmit={submit} className="space-y-4">
      <Input label="Etkinlik adı" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} autoFocus />
      <label className="block space-y-1 text-sm text-slate-300"><span>Başlangıç</span><input className={fieldClass} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
      <label className="block space-y-1 text-sm text-slate-300"><span>Bitiş</span><input className={fieldClass} type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
      {startsAt && endsAt && !validRange && <p role="alert" className="text-sm text-red-400">Bitiş zamanı başlangıçtan sonra olmalıdır.</p>}
      <p className="text-xs text-slate-500">Saat dilimi: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    </form>
  </Modal>;
}
