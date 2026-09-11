"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformAuditEntry, PlatformAuditFilters, PlatformAuditOutcome } from "@repo/types";
import { canAdmin } from "@/lib/admin/permissions";
import { downloadPlatformAudit, getPlatformAudit, setPlatformAuditRetention } from "@/services/platform-audit.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";

const fieldClass = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";
const buttonClass = "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-40";
const outcomes: Array<PlatformAuditOutcome | ""> = ["", "SUCCESS", "DENIED", "FAILED"];
type AuditFilterState = Omit<PlatformAuditFilters, "page" | "limit">;

export function PlatformAuditPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlatformAuditEntry | null>(null);
  const [filters, setFilters] = useState<AuditFilterState>({});
  const [retentionOverride, setRetentionOverride] = useState<number | null>(null);
  const request = useMemo(() => ({ ...filters, page, limit: 50 }), [filters, page]);
  const query = useQuery({ queryKey: ["platform-audit", request], queryFn: () => getPlatformAudit(request) });
  const retentionDays = retentionOverride ?? query.data?.retentionDays ?? 2555;
  const retentionMutation = useMutation({
    mutationFn: () => setPlatformAuditRetention(retentionDays),
    onSuccess: async () => {
      setRetentionOverride(null);
      await queryClient.invalidateQueries({ queryKey: ["platform-audit"] });
      toast.success("Saklama politikası güncellendi.");
    },
  });
  const exportMutation = useMutation({
    mutationFn: (format: "csv" | "json") => downloadPlatformAudit(filters, format),
    onSuccess: () => toast.success("Denetim kayıtları dışa aktarıldı."),
  });
  const integrityValue = query.isPending
    ? "Kontrol ediliyor"
    : query.data?.integrity.valid
      ? "Doğrulandı"
      : "Bozuk";
  const integrityTone = query.isPending
    ? undefined
    : query.data?.integrity.valid
      ? "good" as const
      : "bad" as const;

  const updateFilter = <K extends keyof AuditFilterState>(key: K, value: AuditFilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  };

  return (
    <div className="space-y-5 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Platform Denetim Kayıtları</h1>
          <p className="mt-1 text-xs text-slate-400">Tenant denetiminden bağımsız, yalnızca eklenebilir ve hash zincirli admin işlem geçmişi</p>
        </div>
        <div className="flex gap-2">
          <button className={buttonClass} onClick={() => exportMutation.mutate("csv")}>CSV</button>
          <button className={buttonClass} onClick={() => exportMutation.mutate("json")}>JSON</button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Toplam kayıt" value={query.data?.meta.total ?? 0} />
        <Metric label="Zincir bütünlüğü" value={integrityValue} tone={integrityTone} />
        <Metric label="Saklama" value={`${query.data?.retentionDays ?? 0} gün`} />
      </div>

      <section className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-4">
        <input className={fieldClass} type="date" value={filters.from ?? ""} onChange={(event) => updateFilter("from", event.target.value)} aria-label="Başlangıç tarihi" />
        <input className={fieldClass} type="date" value={filters.to ?? ""} onChange={(event) => updateFilter("to", event.target.value)} aria-label="Bitiş tarihi" />
        <input className={fieldClass} placeholder="Modül" value={filters.module ?? ""} onChange={(event) => updateFilter("module", event.target.value)} />
        <input className={fieldClass} placeholder="Aktör ID" value={filters.actorId ?? ""} onChange={(event) => updateFilter("actorId", event.target.value)} />
        <input className={fieldClass} placeholder="Hedef türü veya ID" value={filters.target ?? ""} onChange={(event) => updateFilter("target", event.target.value)} />
        <select
          className={fieldClass}
          value={filters.outcome ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            updateFilter("outcome", value === "SUCCESS" || value === "DENIED" || value === "FAILED" ? value : undefined);
          }}
        >
          {outcomes.map((item) => <option key={item || "ALL"} value={item}>{item || "Tüm sonuçlar"}</option>)}
        </select>
        {canAdmin(admin, "audit.manage") && (
          <>
            <input className={fieldClass} type="number" min={365} max={3650} value={retentionDays} aria-label="Saklama süresi (gün)" onChange={(event) => setRetentionOverride(Number(event.target.value))} />
            <button className={buttonClass} disabled={retentionMutation.isPending || retentionDays < 365 || retentionDays > 3650} onClick={() => retentionMutation.mutate()}>Saklamayı güncelle</button>
          </>
        )}
      </section>

      {query.isError && <p role="alert" className="text-red-300">Platform denetim kayıtları alınamadı.</p>}
      <AuditTable entries={query.data?.data ?? []} onSelect={setSelected} />
      <div className="flex justify-between">
        <button className={buttonClass} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Önceki</button>
        <span className="text-xs text-slate-400">{page} / {query.data?.meta.totalPages || 1}</span>
        <button className={buttonClass} disabled={page >= (query.data?.meta.totalPages || 1)} onClick={() => setPage((value) => value + 1)}>Sonraki</button>
      </div>
      {selected && <AuditDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AuditTable({ entries, onSelect }: { entries: PlatformAuditEntry[]; onSelect: (entry: PlatformAuditEntry) => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400"><tr><th className="p-3">Tarih</th><th>Aktör</th><th>İşlem</th><th>Hedef</th><th>Sonuç</th><th>İz</th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="cursor-pointer border-t border-slate-800 text-slate-300 hover:bg-slate-800/50" onClick={() => onSelect(entry)}>
                <td className="p-3">{new Date(entry.createdAt).toLocaleString("tr-TR")}</td>
                <td>{entry.actor?.email ?? "Sistem"}</td>
                <td>{entry.module} · {entry.action}</td>
                <td>{entry.targetType}:{entry.targetId ?? "—"}</td>
                <td className={entry.outcome === "SUCCESS" ? "text-emerald-300" : "text-red-300"}>{entry.outcome}</td>
                <td className="font-mono">{entry.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" }) {
  const valueClass = tone === "good" ? "mt-2 text-xl text-emerald-300" : tone === "bad" ? "mt-2 text-xl text-red-300" : "mt-2 text-xl text-white";
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">{label}</p><p className={valueClass}>{value}</p></div>;
}

function AuditDetail({ entry, onClose }: { entry: PlatformAuditEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex justify-between"><h2 className="font-semibold text-white">Denetim detayı ve alan farkı</h2><button className={buttonClass} onClick={onClose}>Kapat</button></div>
        <dl className="mt-4 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
          <div>Aktör: {entry.actor?.name ?? "Sistem"}</div><div>Sonuç: {entry.outcome}</div>
          <div>IP: {entry.ipAddress ?? "—"}</div><div>Cihaz: {entry.device ?? "—"}</div>
          <div>Request: {entry.requestId ?? "—"}</div><div>Correlation: {entry.correlationId ?? "—"}</div>
          <div>Onay: {entry.approvalId ?? "—"}</div><div>Gerekçe: {entry.reason ?? "—"}</div>
        </dl>
        <div className="mt-4 space-y-2">
          {entry.changes.map((change) => (
            <div key={change.field} className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
              <strong className="text-slate-200">{change.field}</strong>
              <div className="mt-2 grid gap-2 md:grid-cols-2"><pre className="overflow-auto text-red-300">{JSON.stringify(change.before, null, 2)}</pre><pre className="overflow-auto text-emerald-300">{JSON.stringify(change.after, null, 2)}</pre></div>
            </div>
          ))}
        </div>
        <p className="mt-4 break-all font-mono text-[10px] text-slate-500">prev {entry.previousHash ?? "GENESIS"}<br />hash {entry.hash}</p>
      </div>
    </div>
  );
}
