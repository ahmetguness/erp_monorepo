'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  disabled: boolean;
  replyLabel?: string;
  onCancelReply: () => void;
  onSend: (content: string, files: File[]) => Promise<void>;
}

export function MessageComposer({ disabled, replyLabel, onCancelReply, onSend }: Props) {
  const [content, setContent] = useState(''); const [files, setFiles] = useState<File[]>([]); const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if ((!content.trim() && files.length === 0) || sending) return;
    setSending(true);
    try { await onSend(content.trim(), files); setContent(''); setFiles([]); }
    finally { setSending(false); }
  };
  return <form onSubmit={submit} className="border-t border-slate-800 bg-slate-950/80 p-3">
    {replyLabel && <div className="mb-2 flex items-center justify-between rounded-lg border-l-2 border-sky-500 bg-slate-900 px-3 py-2 text-xs text-slate-300"><span>Yanıt: {replyLabel}</span><button type="button" onClick={onCancelReply} aria-label="Yanıtı iptal et"><X className="h-4 w-4" /></button></div>}
    {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <span key={`${file.name}-${file.size}`} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300">{file.name}</span>)}</div>}
    <div className="flex items-end gap-2">
      <input ref={input} className="hidden" type="file" multiple accept="image/*,.pdf,.txt,.csv,.docx,.xlsx" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 10))} />
      <Button type="button" variant="ghost" size="md" onClick={() => input.current?.click()} aria-label="Dosya ekle"><Paperclip className="h-4 w-4" /></Button>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} disabled={disabled} rows={1} maxLength={10_000} placeholder="Mesaj yazın…" className="max-h-36 min-h-10 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <Button type="submit" loading={sending} disabled={disabled || (!content.trim() && files.length === 0)} aria-label="Gönder"><Send className="h-4 w-4" /></Button>
    </div>
  </form>;
}
