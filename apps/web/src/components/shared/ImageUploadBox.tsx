'use client';

import { CheckCircle2, ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImageUploadStatus = 'idle' | 'selected' | 'uploading' | 'uploaded' | 'removing' | 'error';

interface ImageUploadBoxProps {
  label: string;
  description: string;
  previewUrl: string | null;
  fileName?: string | null;
  status: ImageUploadStatus;
  hasImage: boolean;
  disabled?: boolean;
  maxSizeLabel?: string;
  onSelect: () => void;
  onClearSelection?: () => void;
  onRemove?: () => void;
  variant?: 'inline' | 'avatar';
}

function getStatusLabel(status: ImageUploadStatus, hasImage: boolean, fileName?: string | null): string {
  if (status === 'uploading') return 'Görsel yükleniyor...';
  if (status === 'removing') return 'Görsel kaldırılıyor...';
  if (status === 'uploaded') return 'Görsel yüklendi';
  if (status === 'error') return 'İşlem tamamlanamadı';
  if (fileName) return `${fileName} seçildi`;
  if (hasImage) return 'Görsel yüklü';
  return 'Henüz görsel yok';
}

export function ImageUploadBox({
  label,
  description,
  previewUrl,
  fileName,
  status,
  hasImage,
  disabled = false,
  maxSizeLabel = 'JPG, PNG veya WebP',
  onSelect,
  onClearSelection,
  onRemove,
  variant = 'inline',
}: ImageUploadBoxProps) {
  const isBusy = status === 'uploading' || status === 'removing';
  const canRemove = hasImage && !!onRemove;
  const canClearSelection = !!fileName && !!onClearSelection;

  if (variant === 'avatar') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
        <div
          className={cn(
            'relative aspect-square w-full rounded-xl border flex items-center justify-center overflow-hidden',
            status === 'uploaded' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-950',
          )}
        >
          {previewUrl ? (
            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${previewUrl}")` }} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-600">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">Gorsel yok</span>
            </div>
          )}
          {isBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75">
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
            </div>
          )}
          {status === 'uploaded' && (
            <div className="absolute right-2 top-2 rounded-full bg-emerald-500/90 p-1">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p
            className={cn(
              'min-w-0 truncate text-xs',
              status === 'error' ? 'text-red-400' : status === 'selected' ? 'text-sky-400' : 'text-slate-500',
            )}
          >
            {getStatusLabel(status, hasImage, fileName)}
          </p>
          <span className="shrink-0 text-[10px] text-slate-600">{maxSizeLabel}</span>
        </div>

        {isBusy && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-400" />
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled || isBusy}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            {hasImage ? 'Guncelle' : 'Sec'}
          </button>
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled || isBusy}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Kaldir
            </button>
          ) : canClearSelection ? (
            <button
              type="button"
              onClick={onClearSelection}
              disabled={disabled || isBusy}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
              Vazgec
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'relative w-16 h-16 rounded-xl border flex items-center justify-center overflow-hidden shrink-0',
            status === 'uploaded' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-950',
          )}
        >
          {previewUrl ? (
            <div className="w-full h-full bg-center bg-cover" style={{ backgroundImage: `url("${previewUrl}")` }} />
          ) : (
            <ImageIcon className="w-6 h-6 text-slate-600" />
          )}
          {isBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75">
              <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
            </div>
          )}
          {status === 'uploaded' && (
            <div className="absolute right-1 top-1 rounded-full bg-emerald-500/90 p-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-300">{label}</p>
            {status === 'uploaded' && (
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                Yüklendi
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{description}</p>
          <p
            className={cn(
              'mt-1 truncate text-[11px]',
              status === 'error' ? 'text-red-400' : status === 'selected' ? 'text-sky-400' : 'text-slate-600',
            )}
          >
            {getStatusLabel(status, hasImage, fileName)}
          </p>
          {isBusy && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-400" />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled || isBusy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            {hasImage ? 'Güncelle' : 'Görsel seç'}
          </button>
          {canClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              disabled={disabled || isBusy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" />
              Vazgeç
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled || isBusy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Kaldır
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">{maxSizeLabel}</p>
    </div>
  );
}
