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
  const imageId = image?.id;
  const [imageUrl, setImageUrl] = useState<{ imageId: string; url: string } | null>(null);
  const url = imageId && imageUrl?.imageId === imageId ? imageUrl.url : null;

  useEffect(() => {
    let objectUrl: string | null = null;
    let mounted = true;

    if (!imageId) return undefined;

    downloadAttachment(imageId)
      .then((blob) => {
        if (!mounted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl({ imageId, url: objectUrl });
      })
      .catch(() => {
        if (mounted) setImageUrl(null);
      });

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

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
