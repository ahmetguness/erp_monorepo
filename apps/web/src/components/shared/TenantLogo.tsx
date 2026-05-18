'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useTenantLogo } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

interface TenantLogoProps {
  className?: string;
  fallbackClassName?: string;
}

export function TenantLogo({ className, fallbackClassName }: TenantLogoProps) {
  const { data: logoBlob } = useTenantLogo();
  const [logoUrl, setLogoUrl] = useState<{ blob: Blob; url: string } | null>(null);
  const url = logoBlob && logoUrl?.blob === logoBlob ? logoUrl.url : null;

  useEffect(() => {
    if (!logoBlob) return undefined;

    const objectUrl = URL.createObjectURL(logoBlob);
    let active = true;
    queueMicrotask(() => {
      if (active) setLogoUrl({ blob: logoBlob, url: objectUrl });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [logoBlob]);

  return (
    <div className={cn('bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden', className)}>
      {url ? (
        <div className="w-full h-full bg-center bg-contain bg-no-repeat" style={{ backgroundImage: `url("${url}")` }} />
      ) : (
        <Building2 className={cn('w-4 h-4 text-slate-600', fallbackClassName)} />
      )}
    </div>
  );
}
