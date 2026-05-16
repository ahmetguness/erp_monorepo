'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImageUploadBox, type ImageUploadStatus } from '@/components/shared/ImageUploadBox';
import { useAttachments } from '@/hooks/useAttachments';
import { useUIStore } from '@/store/ui.store';
import { deleteAttachment, downloadAttachment, uploadAttachment, type Attachment } from '@/services/attachment.service';

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimeType?.startsWith('image/') ?? false;
}

interface EntityImageManagerProps {
  entityType: string;
  entityId: string;
  label: string;
  description: string;
  maxSizeLabel?: string;
  disabled?: boolean;
}

export function EntityImageManager({
  entityType,
  entityId,
  label,
  description,
  maxSizeLabel,
  disabled = false,
}: EntityImageManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useUIStore();
  const { data: attachments = [] } = useAttachments(entityType, entityId);
  const image = useMemo(() => attachments.find(isImageAttachment) ?? null, [attachments]);

  const [file, setFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [storedPreviewUrl, setStoredPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ImageUploadStatus>('idle');

  const previewUrl = selectedPreviewUrl ?? storedPreviewUrl;
  const hasImage = !!file || !!image;
  const isBusy = status === 'uploading' || status === 'removing';

  useEffect(() => {
    if (!file) {
      setSelectedPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedPreviewUrl(objectUrl);
    setStatus('selected');
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!image || file) {
      if (!image) setStoredPreviewUrl(null);
      return undefined;
    }

    let mounted = true;
    let objectUrl: string | null = null;

    downloadAttachment(image.id)
      .then((blob) => {
        if (!mounted) return;
        objectUrl = URL.createObjectURL(blob);
        setStoredPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (mounted) setStoredPreviewUrl(null);
      });

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image, file]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
  };

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    if (inputRef.current) inputRef.current.value = '';
  };

  const clearSelection = () => {
    setFile(null);
    setStatus('idle');
  };

  const uploadSelected = async () => {
    if (!file) return;

    try {
      setStatus('uploading');
      await uploadAttachment(entityType, entityId, file);
      if (image) await deleteAttachment(image.id);
      await invalidate();
      setFile(null);
      setStatus('uploaded');
      toast.success(`${label} yüklendi.`);
    } catch {
      setStatus('error');
      toast.error(`${label} yüklenemedi.`);
    }
  };

  const removeImage = async () => {
    if (!image) return;

    try {
      setStatus('removing');
      await deleteAttachment(image.id);
      await invalidate();
      setFile(null);
      setStoredPreviewUrl(null);
      setStatus('idle');
      toast.success(`${label} kaldırıldı.`);
    } catch {
      setStatus('error');
      toast.error(`${label} kaldırılamadı.`);
    }
  };

  return (
    <div className="space-y-2">
      <ImageUploadBox
        label={label}
        description={description}
        previewUrl={previewUrl}
        fileName={file?.name ?? null}
        status={status}
        hasImage={hasImage}
        disabled={disabled || isBusy}
        maxSizeLabel={maxSizeLabel}
        onSelect={() => inputRef.current?.click()}
        onClearSelection={file ? clearSelection : undefined}
        onRemove={image ? removeImage : undefined}
      />
      {file && (
        <button
          type="button"
          onClick={uploadSelected}
          disabled={disabled || isBusy}
          className="inline-flex h-8 items-center rounded-lg bg-emerald-500/10 px-3 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Seçilen görseli yükle
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleSelect} />
    </div>
  );
}
