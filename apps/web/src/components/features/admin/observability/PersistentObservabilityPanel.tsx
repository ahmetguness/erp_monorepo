"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlertHistoryItem,
  ObservabilityRange,
  SloDefinition,
} from "@repo/types";
import { canAdmin } from "@/lib/admin/permissions";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import {
  createDeploymentMarker,
  getPersistentObservability,
  saveSlo,
  setAlertOwnership,
  silenceAlert,
} from "@/services/persistent-observability.service";
import { toast } from "@/store/ui.store";

const field =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";
const button =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-40";
const ranges: ObservabilityRange[] = ["1h", "24h", "7d", "30d"];
const emptySlo = (): Omit<SloDefinition, "id"> => ({
  name: "Backend availability",
  scope: "SERVICE",
  scopeId: "backend",
  metricKey: "availability_pct",
  targetPercentage: 99.9,
  windowDays: 30,
  owner: "platform-operations",
  runbookUrl: "https://runbooks.local/backend-availability",
  notificationChannel: "ops-alerts",
  isEnabled: true,
});

export function PersistentObservabilityPanel() {
  const admin = useAdminAuthStore((state) => state.admin);
  const client = useQueryClient();
  const [range, setRange] = useState<ObservabilityRange>("24h");
  const [slo, setSlo] = useState(emptySlo);
  const [deploy, setDeploy] = useState({
    service: "backend",
    version: "",
    environment: "production",
    description: "",
  });
  const [editingAlert, setEditingAlert] = useState<AlertHistoryItem | null>(
    null,
  );
  const query = useQuery({
    queryKey: ["admin", "observability-history", range],
    queryFn: () => getPersistentObservability(range),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["admin", "observability-history"] });
  const sloMutation = useMutation({
    mutationFn: saveSlo,
    onSuccess: async () => {
      await refresh();
      toast.success("SLO kaydedildi.");
    },
  });
  const deploymentMutation = useMutation({
    mutationFn: () =>
      createDeploymentMarker({
        ...deploy,
        description: deploy.description || null,
        deployedAt: new Date().toISOString(),
      }),
    onSuccess: async () => {
      setDeploy({ ...deploy, version: "", description: "" });
      await refresh();
    },
  });
  const ownershipMutation = useMutation({
    mutationFn: (alert: AlertHistoryItem) => setAlertOwnership(alert.id, alert),
    onSuccess: async () => {
      setEditingAlert(null);
      await refresh();
    },
  });
  const silenceMutation = useMutation({
    mutationFn: (id: string) =>
      silenceAlert(
        id,
        new Date(Date.now() + 3600000).toISOString(),
        "Operasyon incelemesi için bir saat susturuldu",
      ),
    onSuccess: refresh,
  });
  const canManage = canAdmin(admin, "operations.manage");

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Kalıcı SLO ve alarm geçmişi
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            PostgreSQL metric store · restart sonrası korunur
          </p>
        </div>
        <div className="flex gap-1">
          {ranges.map((item) => (
            <button
              key={item}
              className={
                range === item
                  ? "rounded bg-violet-600 px-3 py-1 text-xs text-white"
                  : button
              }
              onClick={() => setRange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {query.isError && (
        <p role="alert" className="text-red-400">
          Kalıcı gözlemlenebilirlik geçmişi alınamadı.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {query.data?.slos.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
          >
            <strong className="text-slate-200">{item.name}</strong>
            <p className="mt-2 text-xl text-white">SLI %{item.sliPercentage}</p>
            <p
              className={
                item.errorBudgetRemainingPercentage < 25
                  ? "text-xs text-red-300"
                  : "text-xs text-emerald-300"
              }
            >
              Hata bütçesi %{item.errorBudgetRemainingPercentage}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hedef %{item.targetPercentage} · {item.windowDays} gün ·{" "}
              {item.sampleCount} örnek
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {item.owner} · {item.notificationChannel}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-800 p-3">
        <h3 className="text-xs font-semibold text-slate-300">
          Metrik trendi ve deploy işaretleri
        </h3>
        <div className="mt-2 flex h-24 items-end gap-1 overflow-hidden">
          {query.data?.points
            .filter((item) => item.metricKey === "availability_pct")
            .slice(-120)
            .map((item) => (
              <div
                key={item.bucketAt}
                title={`${item.bucketAt}: ${item.value}`}
                className="min-w-1 flex-1 bg-sky-500/60"
                style={{ height: `${Math.max(2, item.value)}%` }}
              />
            ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {query.data?.deployments.map((item) => (
            <span
              key={item.id}
              className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
            >
              ▲ {item.service} {item.version} ·{" "}
              {new Date(item.deployedAt).toLocaleString("tr-TR")}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Alarm geçmişi</h3>
        {query.data?.alerts.map((alert) => (
          <div
            key={alert.id}
            className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <span
                className={
                  alert.status === "OPEN" ? "text-red-300" : "text-emerald-300"
                }
              >
                {alert.metricKey} · {alert.status}
              </span>
              <span className="text-xs text-slate-500">
                {alert.owner} · {alert.notificationChannel}
              </span>
            </div>
            <a
              href={alert.runbookUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs text-blue-400"
            >
              Runbook
            </a>
            {alert.silencedUntil && (
              <p className="text-xs text-amber-300">
                {new Date(alert.silencedUntil).toLocaleString("tr-TR")} tarihine
                kadar susturuldu
              </p>
            )}
            {canManage && (
              <div className="mt-2 flex gap-2">
                <button
                  className={button}
                  onClick={() => setEditingAlert(alert)}
                >
                  Sahipliği düzenle
                </button>
                <button
                  className={button}
                  disabled={alert.status !== "OPEN"}
                  onClick={() => silenceMutation.mutate(alert.id)}
                >
                  1 saat sustur
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Merkezi hata logları</h3>
        {query.data?.logs.slice(0, 20).map((entry) => (
          <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold text-red-300">{entry.level} · {entry.service}</span>
              <span className="text-slate-500">{new Date(entry.occurredAt).toLocaleString("tr-TR")}</span>
            </div>
            <p className="mt-1 text-slate-300">{entry.message}</p>
            <p className="mt-1 text-slate-500">request: {entry.requestId ?? "—"} · correlation: {entry.correlationId ?? "—"}</p>
          </div>
        ))}
      </div>
      {canManage && (
        <>
          <div className="grid gap-2 md:grid-cols-4">
            <input
              className={field}
              value={slo.name}
              onChange={(e) => setSlo({ ...slo, name: e.target.value })}
            />
            <select
              className={field}
              value={slo.scope}
              onChange={(e) => {
                const nextScope =
                  e.target.value === "TENANT" ? "TENANT" : "SERVICE";
                setSlo({
                  ...slo,
                  scope: nextScope,
                  metricKey:
                    nextScope === "TENANT"
                      ? "operation_health_pct"
                      : "availability_pct",
                });
              }}
            >
              <option value="SERVICE">Servis</option>
              <option value="TENANT">Tenant</option>
            </select>
            <input
              className={field}
              value={slo.scopeId}
              onChange={(e) => setSlo({ ...slo, scopeId: e.target.value })}
              placeholder={slo.scope === "TENANT" ? "Tenant ID" : "Servis"}
            />
            <input
              className={field}
              value={slo.metricKey}
              onChange={(e) => setSlo({ ...slo, metricKey: e.target.value })}
              placeholder="SLI metriği"
            />
            <input
              className={field}
              type="number"
              value={slo.targetPercentage}
              onChange={(e) =>
                setSlo({ ...slo, targetPercentage: Number(e.target.value) })
              }
            />
            <input
              className={field}
              value={slo.owner}
              onChange={(e) => setSlo({ ...slo, owner: e.target.value })}
            />
            <input
              className={field}
              value={slo.notificationChannel}
              onChange={(e) =>
                setSlo({ ...slo, notificationChannel: e.target.value })
              }
            />
            <button className={button} onClick={() => sloMutation.mutate(slo)}>
              SLO kaydet
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <input
              className={field}
              value={deploy.service}
              onChange={(e) =>
                setDeploy({ ...deploy, service: e.target.value })
              }
            />
            <input
              className={field}
              value={deploy.version}
              onChange={(e) =>
                setDeploy({ ...deploy, version: e.target.value })
              }
              placeholder="Sürüm"
            />
            <input
              className={field}
              value={deploy.description}
              onChange={(e) =>
                setDeploy({ ...deploy, description: e.target.value })
              }
              placeholder="Deploy notu"
            />
            <button
              className={button}
              disabled={!deploy.version}
              onClick={() => deploymentMutation.mutate()}
            >
              Deploy işareti ekle
            </button>
          </div>
        </>
      )}
      {editingAlert && (
        <div className="grid gap-2 rounded-lg border border-violet-500/30 p-3 md:grid-cols-4">
          <input
            className={field}
            value={editingAlert.owner}
            onChange={(e) =>
              setEditingAlert({ ...editingAlert, owner: e.target.value })
            }
          />
          <input
            className={field}
            value={editingAlert.runbookUrl}
            onChange={(e) =>
              setEditingAlert({ ...editingAlert, runbookUrl: e.target.value })
            }
          />
          <input
            className={field}
            value={editingAlert.notificationChannel}
            onChange={(e) =>
              setEditingAlert({
                ...editingAlert,
                notificationChannel: e.target.value,
              })
            }
          />
          <button
            className={button}
            onClick={() => ownershipMutation.mutate(editingAlert)}
          >
            Kaydet
          </button>
        </div>
      )}
    </section>
  );
}
