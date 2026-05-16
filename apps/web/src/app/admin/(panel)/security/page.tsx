'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { getSecurityChecklist, type SecurityCheckStatus } from '@/services/admin.service';

const STATUS_META: Record<SecurityCheckStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pass: { label: 'Geçti', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25', icon: CheckCircle2 },
  warn: { label: 'Uyarı', className: 'text-amber-300 bg-amber-500/10 border-amber-500/25', icon: AlertTriangle },
  fail: { label: 'Kritik', className: 'text-red-300 bg-red-500/10 border-red-500/25', icon: XCircle },
};

export default function AdminSecurityPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'security-checklist'],
    queryFn: getSecurityChecklist,
  });

  const counts = useMemo(() => {
    const checks = data?.checks ?? [];
    return {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: checks.filter((check) => check.status === 'warn').length,
      fail: checks.filter((check) => check.status === 'fail').length,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-100">
        Güvenlik kontrol listesi alınamadı.
      </div>
    );
  }

  const summaryMeta = STATUS_META[data.summary];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/45 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Platform güvenliği</p>
            <h1 className="text-xl font-semibold text-white">Security Checklist</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">{counts.pass} geçti</Badge>
          <Badge variant="warning">{counts.warn} uyarı</Badge>
          <Badge variant="danger">{counts.fail} kritik</Badge>
        </div>
      </div>

      <div className={`rounded-lg border p-4 ${summaryMeta.className}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <summaryMeta.icon className="h-4 w-4" />
          Genel durum: {summaryMeta.label}
        </div>
      </div>

      <div className="grid gap-3">
        {data.checks.map((check) => {
          const meta = STATUS_META[check.status];
          return (
            <div key={check.key} className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <meta.icon className={`h-4 w-4 ${meta.className.split(' ')[0]}`} />
                    <h2 className="text-sm font-semibold text-white">{check.label}</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{check.message}</p>
                  {check.details && check.details.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {check.details.map((detail) => (
                        <code key={detail} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-400">
                          {detail}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                  {meta.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
