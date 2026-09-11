"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicStatus } from "@/services/public-status.service";

export function PublicStatusPage() {
  const query = useQuery({
    queryKey: ["public-status"],
    queryFn: getPublicStatus,
    refetchInterval: 60_000,
  });
  const active =
    query.data?.filter((incident) => incident.status !== "RESOLVED") ?? [];
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 bg-slate-950 px-6 py-12 text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">Sistem Durumu</h1>
        <p className="mt-2 text-sm text-slate-400">
          Onaylanmış operasyon güncellemeleri
        </p>
      </header>
      <div
        className={`rounded-xl border p-4 ${active.length ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}
      >
        <strong>
          {active.length
            ? `${active.length} aktif olay bulunuyor`
            : "Tüm sistemler normal çalışıyor"}
        </strong>
      </div>
      {query.isError && (
        <p role="alert" className="text-red-300">
          Durum bilgisi şu anda alınamıyor.
        </p>
      )}
      <section className="space-y-3">
        {query.data?.map((incident) => (
          <article
            key={incident.id}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex justify-between gap-3">
              <h2 className="font-medium">{incident.title}</h2>
              <span className="text-xs text-amber-300">
                {incident.severity} · {incident.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              {incident.latestMessage}
            </p>
            <time className="mt-2 block text-xs text-slate-500">
              {new Date(incident.publishedAt).toLocaleString("tr-TR")}
            </time>
          </article>
        ))}
      </section>
    </main>
  );
}
