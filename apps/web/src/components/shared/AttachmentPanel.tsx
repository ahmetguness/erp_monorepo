'use client';

import { useRef } from 'react';
import { Paperclip, Upload, Trash2, Download, FileText, Image, File } from 'lucide-react';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useAttachments';
import { downloadAttachment } from '@/services/attachment.service';
import { cn } from '@/lib/utils';

function fileIcon(mime: string | null) {
  if (mime?.startsWith('image/')) return <Image className="w-4 h-4 text-violet-400" />;
  if (mime?.includes('pdf')) return <FileText className="w-4 h-4 text-red-400" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props { entityType: string; entityId: string; }

export function AttachmentPanel({ entityType, entityId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: attachments = [], isLoading } = useAttachments(entityType, entityId);
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate({ entityType, entityId, file });
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDownload = async (id: string, fileName: string) => {
    const blob = await downloadAttachment(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Paperclip className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400">Dosyalar</span>
          <span className="text-[10px] font-medium text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full">{attachments.length}</span>
        </div>
        <button onClick={() => inputRef.current?.click()} disabled={upload.isPending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors">
          <Upload className="w-3 h-3" />{upload.isPending ? 'Yükleniyor…' : 'Yükle'}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} />
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-slate-600">Yükleniyor…</div>
      ) : attachments.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-600">Henüz dosya eklenmemiş</div>
      ) : (
        <div className="divide-y divide-slate-800/40">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/20 transition-colors group">
              {fileIcon(a.mimeType)}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">{a.fileName}</p>
                <p className="text-[10px] text-slate-600">{fmtSize(a.fileSize)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleDownload(a.id, a.fileName)}
                  className="p-1 rounded text-slate-600 hover:text-sky-400"><Download className="w-3 h-3" /></button>
                <button onClick={() => remove.mutate(a.id)}
                  className="p-1 rounded text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
