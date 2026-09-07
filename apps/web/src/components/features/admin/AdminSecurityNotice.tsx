'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listAdminSecurityEvents } from '@/services/admin-session.service';

export function AdminSecurityNotice() {
  const { data } = useQuery({
    queryKey: ['admin', 'security-events'], queryFn: listAdminSecurityEvents, refetchInterval: 60000,
  });
  const recent = data?.[0];
  if (!recent) return null;
  return <div role="status" className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
    <p>{recent.message}</p>
    <Link href="/admin/sessions" className="underline">Cihazları ve güvenlik bildirimlerini incele</Link>
  </div>;
}
