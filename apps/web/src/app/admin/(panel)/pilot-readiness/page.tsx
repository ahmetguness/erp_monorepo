"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleSlash2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AdminPageHeader } from "@/components/features/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn, formatDateTime } from "@/lib/utils";
import { getAdminPilotReadiness, getTenants } from "@/services/admin.service";

const CHECK_SCOPE = {
  stock_integrity: "Tenant verisi",
  retry_safety: "Platform kanıtı",
  tenant_isolation: "Tenant + platform",
  deterministic_flow: "Platform kanıtı",
} as const;

export default function AdminPilotReadinessPage() {
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const tenantsQuery = useQuery({
    queryKey: ["admin", "pilot-readiness", "tenants", search],
    queryFn: () =>
      getTenants({
        limit: 50,
        search: search.trim() || undefined,
        sortBy: "companyName",
        sortDirection: "asc",
      }),
  });
  const tenants = tenantsQuery.data?.data ?? [];

  useEffect(() => {
    if (!tenantsQuery.isSuccess) return;
    if (tenants.length === 0) {
      setSelectedTenantId("");
      return;
    }
    if (!tenants.some((tenant) => tenant.id === selectedTenantId)) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [selectedTenantId, tenants, tenantsQuery.isSuccess]);

  const readinessQuery = useQuery({
    queryKey: ["admin", "pilot-readiness", selectedTenantId],
    queryFn: () => getAdminPilotReadiness(selectedTenantId),
    enabled: Boolean(selectedTenantId),
  });

  const result = readinessQuery.data;
  const report = result?.report;
  const isGo = report?.decision === "GO";
  const passedCount =
    report?.checks.filter((check) => check.status === "PASS").length ?? 0;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Pilot GO / NO-GO"
        description="Pilot açılış kararını tenant verileri ve platform doğrulama kanıtlarıyla değerlendirir."
        icon={ShieldCheck}
        iconTone={isGo ? "emerald" : report ? "red" : "slate"}
        badge={
          report ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-black",
                isGo
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300",
              )}
            >
              {isGo ? "GO" : "NO-GO"}
            </span>
          ) : undefined
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void readinessQuery.refetch()}
            disabled={!selectedTenantId || readinessQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                readinessQuery.isFetching && "animate-spin",
              )}
            />
            Yeniden değerlendir
          </Button>
        }
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)]">
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Tenant ara
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Şirket adı, slug veya e-posta"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10"
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Değerlendirilecek tenant
            </span>
            <select
              value={selectedTenantId}
              onChange={(event) => setSelectedTenantId(event.target.value)}
              disabled={tenantsQuery.isLoading || tenants.length === 0}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10"
            >
              {tenants.length === 0 && (
                <option value="">Tenant bulunamadı</option>
              )}
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.companyName} — {tenant.slug} ({tenant.status})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {readinessQuery.isLoading && (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
          <Loader2 className="h-7 w-7 animate-spin text-red-400" />
        </div>
      )}

      {readinessQuery.isError && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-5 text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5" /> Hazırlık verisi alınamadı
          </div>
          <p className="mt-2 text-sm text-rose-300/80">
            Kanıt üretilemediği için karar güvenli biçimde NO-GO kabul
            edilmelidir.
          </p>
        </div>
      )}

      {!readinessQuery.isLoading && !readinessQuery.isError && !result && (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 text-center">
          <CircleSlash2 className="h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-300">
            Değerlendirmek için bir tenant seçin.
          </p>
        </div>
      )}

      {result && report && (
        <>
          <section
            className={cn(
              "rounded-xl border p-5",
              isGo
                ? "border-emerald-700/70 bg-emerald-950/25"
                : "border-rose-800/70 bg-rose-950/25",
            )}
          >
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "rounded-xl p-2.5",
                    isGo
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400",
                  )}
                >
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {result.tenant.slug}
                  </p>
                  <h2 className="mt-0.5 text-xl font-black text-white">
                    {result.tenant.companyName}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {result.tenant.plan} · {result.tenant.status} · Son
                    hesaplama: {formatDateTime(report.generatedAt)}
                  </p>
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Karar
                </p>
                <p
                  className={cn(
                    "text-4xl font-black",
                    isGo ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {isGo ? "GO" : "NO-GO"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {passedCount}/{report.checks.length} kontrol başarılı
                </p>
              </div>
            </div>
            {!isGo && (
              <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200">
                <strong>{report.blockers.length} blokaj:</strong>{" "}
                {report.checks
                  .filter((check) => check.status === "FAIL")
                  .map((check) => check.label)
                  .join(", ")}
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {report.checks.map((check) => {
              const passed = check.status === "PASS";
              const Icon = passed ? CheckCircle2 : XCircle;
              return (
                <article
                  key={check.key}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-5"
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0",
                        passed ? "text-emerald-400" : "text-rose-400",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-white">{check.label}</h3>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-black",
                            passed
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-rose-500/15 text-rose-300",
                          )}
                        >
                          {check.status}
                        </span>
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                          {CHECK_SCOPE[check.key]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {check.detail}
                      </p>
                      <ul className="mt-3 space-y-1 rounded-lg bg-slate-950/60 p-3 text-xs text-slate-400">
                        {check.evidence.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
