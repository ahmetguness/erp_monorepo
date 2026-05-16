'use client';

import { useEffect, useState } from 'react';
import { Image, Package } from 'lucide-react';
import { useAttachments } from '@/hooks/useAttachments';
import { downloadAttachment, type Attachment } from '@/services/attachment.service';
import { cn } from '@/lib/utils';

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimeType?.startsWith('image/') ?? false;
}

interface EntityImageProps {
  entityType: string;
  entityId: string;
  className?: string;
  fallback?: 'image' | 'package' | 'none';
  fallbackContent?: React.ReactNode;
}

export function EntityImage({ entityType, entityId, className, fallback = 'image', fallbackContent }: EntityImageProps) {
  const { data: attachments = [] } = useAttachments(entityType, entityId);
  const image = attachments.find(isImageAttachment);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let mounted = true;

    setUrl(null);
    if (!image) return undefined;

    downloadAttachment(image.id)
      .then((blob) => {
        if (!mounted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (mounted) setUrl(null);
      });

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image?.id]);

  return (
    <div className={cn('bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden', className)}>
      {url ? (
        <div className="w-full h-full bg-center bg-cover" style={{ backgroundImage: `url("${url}")` }} />
      ) : fallbackContent ? (
        fallbackContent
      ) : fallback === 'package' ? (
        <Package className="w-4 h-4 text-slate-600" />
      ) : fallback === 'image' ? (
        <Image className="w-4 h-4 text-slate-600" />
      ) : null}
    </div>
  );
}
