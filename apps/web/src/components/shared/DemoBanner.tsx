'use client';

import { useAuthStore } from '@/store/auth.store';
import { FlaskConical, Clock } from 'lucide-react';
import { useState } from 'react';

export function DemoBanner() {
  const tenant = useAuthStore((s) => s.tenant);
  const [now] = useState(() => Date.now());

  if (!tenant || tenant.status !== 'TRIAL') return null;

  const daysLeft = tenant.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
      <div className="flex items-center gap-1.5 text-amber-400">
        <FlaskConical className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold tracking-wide uppercase">Demo</span>
      </div>
      <div className="w-px h-3.5 bg-amber-500/20" />
      {daysLeft !== null ? (
        <div className="flex items-center gap-1.5 text-amber-300/80">
          <Clock className="w-3 h-3" />
          <span className="text-xs">
            {daysLeft > 0 ? `${daysLeft} gün kaldı` : 'Süre doldu'}
          </span>
        </div>
      ) : (
        <span className="text-xs text-amber-300/80">Deneme hesabı</span>
      )}
      <div className="flex-1" />
      <span className="text-[10px] text-amber-500/60 hidden sm:block">
        {tenant.plan} planı
      </span>
    </div>
  );
}
