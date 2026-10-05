"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, DatabaseBackup, RefreshCw, Save, ServerCog, type LucideIcon } from "lucide-react";
import type { DeploymentOperationsSettings } from "@/services/settings.service";
import { canAdmin } from "@/lib/admin/permissions";
import { getTenants } from "@/services/admin.service";
import {
  getAdminDeploymentOperations,
  simulateAdminDeploymentBackup,
  updateAdminDeploymentOperations,
} from "@/services/disaster-recovery.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";
import { cn } from "@/lib/utils";

const field = "h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-sky-500";
const button = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 disabled:opacity-40";

export function TenantDeploymentOperationsPanel() {
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = canAdmin(admin, "operations.manage");
  const client = useQueryClient();
  const [tenantId, setTenantId] = useState("");
  const [draft, setDraft] = useState<DeploymentOperationsSettings | null>(null);
  const tenantsQuery = useQuery({
    queryKey: ["admin", "deployment-operations", "tenants"],
    queryFn: () => getTenants({ limit: 100, sortBy: "companyName", sortDirection: "asc" }),
  });
  const tenants = tenantsQuery.data?.data ?? [];

  useEffect(() => {
    if (!tenantId && tenants.length) setTenantId(tenants[0].id);
  }, [tenantId, tenants]);

  const query = useQuery({
    queryKey: ["admin", "deployment-operations", tenantId],
    queryFn: () => getAdminDeploymentOperations(tenantId),
    enabled: Boolean(tenantId),
  });
  const form = draft ?? query.data?.settings;
  const snapshot = query.data?.snapshot;
  const metrics: Array<{ label: string; value: string; icon: LucideIcon }> = snapshot ? [
    { label: "Tenant", value: snapshot.tenant.companyName, icon: Building2 },
    { label: "Deployment", value: snapshot.tenant.deploymentType, icon: ServerCog },
    { label: "Sürüm", value: snapshot.environment.version, icon: ServerCog },
    { label: "Health", value: snapshot.health.status.toUpperCase(), icon: ServerCog },
    { label: "Bekleyen migration", value: String(snapshot.migrations.pendingMigrations.length), icon: DatabaseBackup },
  ] : [];
  const refresh = async () => {
    setDraft(null);
    await client.invalidateQueries({ queryKey: ["admin", "deployment-operations", tenantId] });
  };
  const save = useMutation({
    mutationFn: () => updateAdminDeploymentOperations(tenantId, form!),
    onSuccess: async () => { await refresh(); toast.success("Deployment operasyon ayarları kaydedildi."); },
  });
  const simulate = useMutation({
    mutationFn: () => simulateAdminDeploymentBackup(tenantId),
    onSuccess: async () => { await refresh(); toast.success("Yedek doğrulama simülasyonu tamamlandı."); },
  });

  return (
    <section className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-500/10 p-2 text-teal-400"><ServerCog className="h-4 w-4" /></div>
          <div>
            <h2 className="text-sm font-semibold text-white">Tenant deployment operasyonları</h2>
            <p className="text-xs text-slate-500">Altyapı, migration ve yedek durumu yalnızca platform admin kapsamındadır.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select className={cn(field, "min-w-64")} value={tenantId} onChange={(event) => { setTenantId(event.target.value); setDraft(null); }}>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName} — {tenant.slug}</option>)}
          </select>
          <button className={button} onClick={() => void query.refetch()} disabled={!tenantId || query.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")} /> Yenile
          </button>
        </div>
      </div>

      {query.isError && <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertTriangle className="h-4 w-4" /> Deployment bilgisi alınamadı.</div>}

      {snapshot && (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div>
                <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {snapshot.health.checks.map((check) => (
              <div key={check.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex justify-between gap-3 text-xs"><strong className="text-slate-200">{check.label}</strong><span className={check.status === "fail" ? "text-rose-300" : check.status === "warn" ? "text-amber-300" : "text-emerald-300"}>{check.status}</span></div>
                <p className="mt-1 text-[11px] text-slate-500">{check.message}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {canManage && form && (
        <div className="grid gap-3 border-t border-slate-800 pt-4 md:grid-cols-3">
          <input className={field} aria-label="Ortam adı" value={form.environmentName} onChange={(e) => setDraft({ ...form, environmentName: e.target.value })} placeholder="Ortam adı" />
          <input className={field} aria-label="Release kanalı" value={form.releaseChannel} onChange={(e) => setDraft({ ...form, releaseChannel: e.target.value })} placeholder="Release kanalı" />
          <input className={field} aria-label="Bakım penceresi" value={form.maintenanceWindow} onChange={(e) => setDraft({ ...form, maintenanceWindow: e.target.value })} placeholder="Bakım penceresi" />
          <select className={field} value={form.backupFrequency} onChange={(e) => setDraft({ ...form, backupFrequency: e.target.value as DeploymentOperationsSettings["backupFrequency"] })}>
            <option value="hourly">Saatlik yedek</option><option value="daily">Günlük yedek</option><option value="weekly">Haftalık yedek</option>
          </select>
          <input className={field} type="number" min={1} aria-label="Yedek saklama günü" value={form.backupRetentionDays} onChange={(e) => setDraft({ ...form, backupRetentionDays: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={form.backupEnabled} onChange={(e) => setDraft({ ...form, backupEnabled: e.target.checked })} /> Yedek politikası aktif</label>
          <div className="flex gap-2 md:col-span-3 md:justify-end">
            <button className={button} onClick={() => simulate.mutate()} disabled={simulate.isPending}><DatabaseBackup className="h-3.5 w-3.5" /> Yedek testi</button>
            <button className={button} onClick={() => save.mutate()} disabled={save.isPending || !draft}><Save className="h-3.5 w-3.5" /> Kaydet</button>
          </div>
        </div>
      )}
    </section>
  );
}
