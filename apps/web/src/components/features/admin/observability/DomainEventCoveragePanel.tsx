"use client";

import { useQuery } from "@tanstack/react-query";
import { GitBranch, RefreshCw } from "lucide-react";
import { getAdminDomainEventCoverage } from "@/services/admin.service";

export function DomainEventCoveragePanel() {
  const query = useQuery({
    queryKey: ["admin", "domain-event-coverage"],
    queryFn: getAdminDomainEventCoverage,
    staleTime: 5 * 60 * 1000,
  });
  const coverage = query.data;
  const covered = coverage?.publishCoverage.filter((item) => item.status === "covered").length ?? 0;
  const planned = coverage?.publishCoverage.filter((item) => item.status === "planned").length ?? 0;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-sky-300" /><h2 className="text-sm font-semibold text-white">Platform event-kataloğu kapsamı</h2></div>
          <p className="mt-1 text-xs text-slate-500">Üretici, outbox ve listener idempotency envanteri; tenant kullanıcılarına açık değildir.</p>
        </div>
        <button type="button" onClick={() => void query.refetch()} className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300" aria-label="Event kapsamını yenile"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300">{covered} tamamlandı</span>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-300">{planned} planlandı</span>
        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-300">Şema v{coverage?.schemaVersion ?? "—"}</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {coverage?.publishCoverage.map((item) => (
          <div key={item.eventName} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between gap-2"><code className="truncate text-xs text-slate-200">{item.eventName}</code><span className={item.status === "covered" ? "text-[10px] text-emerald-300" : "text-[10px] text-amber-300"}>{item.status}</span></div>
            <p className="mt-1 truncate text-[11px] text-slate-500">{item.workflow}</p>
          </div>
        ))}
      </div>
      {coverage && <div className="mt-3 flex flex-wrap gap-2">{coverage.listenerIdempotency.map((item) => <span key={item.listener} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1 text-[10px] text-slate-400">{item.listener}: {item.strategy}</span>)}</div>}
    </section>
  );
}
