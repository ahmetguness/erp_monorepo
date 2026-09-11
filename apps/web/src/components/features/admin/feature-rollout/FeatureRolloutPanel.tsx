"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateFeatureRolloutInput,
  FeatureEnvironment,
  FeatureKeyName,
  FeatureRolloutStage,
  PlanName,
} from "@repo/types";
import { PLAN_FEATURE_DEFINITIONS } from "@/lib/plans";
import { canAdmin } from "@/lib/admin/permissions";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import {
  activateFeatureRollout,
  createFeatureRollout,
  getFeatureRollouts,
  reportFeatureRolloutMetric,
  stopFeatureRollout,
} from "@/services/feature-rollout.service";
import { toast } from "@/store/ui.store";

const field =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";
const button =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 disabled:opacity-40";
const initial = (): CreateFeatureRolloutInput => ({
  plan: "STARTER",
  featureKey: PLAN_FEATURE_DEFINITIONS[0]?.featureKey ?? "MAX_USERS",
  environment: "PRODUCTION",
  stage: "PILOT",
  value: "true",
  isEnabled: true,
  rolloutPercentage: 0,
  targetTenantIds: [],
  dependencies: [],
  conflicts: [],
  startsAt: new Date().toISOString(),
  errorThresholdPct: 5,
  reason: "",
});
const split = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const knownFeatureKeys: ReadonlySet<string> = new Set(
  PLAN_FEATURE_DEFINITIONS.map((item) => item.featureKey),
);
const splitFeatureKeys = (value: string): FeatureKeyName[] =>
  split(value).filter((item): item is FeatureKeyName =>
    knownFeatureKeys.has(item),
  );

export function FeatureRolloutPanel() {
  const admin = useAdminAuthStore((state) => state.admin);
  const client = useQueryClient();
  const [form, setForm] = useState<CreateFeatureRolloutInput>(initial);
  const [targets, setTargets] = useState("");
  const [dependencies, setDependencies] = useState("");
  const [conflicts, setConflicts] = useState("");
  const [metric, setMetric] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["admin", "feature-rollouts"],
    queryFn: getFeatureRollouts,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["admin", "feature-rollouts"] });
  const create = useMutation({
    mutationFn: createFeatureRollout,
    onSuccess: async () => {
      setForm(initial());
      setTargets("");
      setDependencies("");
      setConflicts("");
      await refresh();
      toast.success("Rollout taslağı oluşturuldu.");
    },
  });
  const activate = useMutation({
    mutationFn: activateFeatureRollout,
    onSuccess: async () => {
      await refresh();
      toast.success("Aktivasyon ikinci admin onayına gönderildi.");
    },
  });
  const stop = useMutation({
    mutationFn: ({ id, killSwitch }: { id: string; killSwitch: boolean }) =>
      stopFeatureRollout(
        id,
        killSwitch
          ? "Acil kill switch ile rollout durduruldu"
          : "Operasyon ekibi rollout dağıtımını durdurdu",
        killSwitch,
      ),
    onSuccess: refresh,
  });
  const report = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      reportFeatureRolloutMetric(id, value),
    onSuccess: refresh,
  });
  const canUpdate = canAdmin(admin, "feature.update");

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <h2 className="font-semibold text-white">Kontrollü dağıtım</h2>
        <p className="text-xs text-slate-500">
          Sürümlü, hedefli ve hata eşiğiyle otomatik durabilen feature
          rollout’ları.
        </p>
      </div>
      {canUpdate && (
        <div className="grid gap-2 md:grid-cols-4">
          <select
            className={field}
            value={form.plan}
            onChange={(e) =>
              setForm({ ...form, plan: e.target.value as PlanName })
            }
          >
            <option>STARTER</option>
            <option>PROFESSIONAL</option>
            <option>ENTERPRISE</option>
          </select>
          <select
            className={field}
            value={form.featureKey}
            onChange={(e) =>
              setForm({ ...form, featureKey: e.target.value as FeatureKeyName })
            }
          >
            {PLAN_FEATURE_DEFINITIONS.map((item) => (
              <option key={item.featureKey} value={item.featureKey}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={form.environment}
            onChange={(e) =>
              setForm({
                ...form,
                environment: e.target.value as FeatureEnvironment,
              })
            }
          >
            <option>DEVELOPMENT</option>
            <option>STAGING</option>
            <option>PRODUCTION</option>
          </select>
          <select
            className={field}
            value={form.stage}
            onChange={(e) =>
              setForm({ ...form, stage: e.target.value as FeatureRolloutStage })
            }
          >
            <option>DEVELOPMENT</option>
            <option>INTERNAL</option>
            <option>PILOT</option>
            <option>PERCENTAGE</option>
            <option>GENERAL</option>
          </select>
          <input
            className={field}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder="Değer"
          />
          <input
            className={field}
            type="number"
            min="0"
            max="100"
            value={form.rolloutPercentage}
            onChange={(e) =>
              setForm({ ...form, rolloutPercentage: Number(e.target.value) })
            }
            placeholder="Rollout %"
          />
          <input
            className={field}
            type="number"
            min="0"
            max="100"
            value={form.errorThresholdPct}
            onChange={(e) =>
              setForm({ ...form, errorThresholdPct: Number(e.target.value) })
            }
            placeholder="Hata eşiği %"
          />
          <input
            className={field}
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder="Tenant ID’leri, virgülle"
          />
          <input
            className={field}
            value={dependencies}
            onChange={(e) => setDependencies(e.target.value)}
            placeholder="Bağımlı feature key’leri"
          />
          <input
            className={field}
            value={conflicts}
            onChange={(e) => setConflicts(e.target.value)}
            placeholder="Çakışan feature key’leri"
          />
          <input
            className={field}
            type="datetime-local"
            onChange={(e) =>
              setForm({
                ...form,
                startsAt: new Date(e.target.value).toISOString(),
              })
            }
            aria-label="Başlangıç"
          />
          <input
            className={field}
            type="datetime-local"
            onChange={(e) =>
              setForm({
                ...form,
                endsAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            aria-label="Bitiş"
          />
          <input
            className={`${field} md:col-span-3`}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Zorunlu gerekçe"
          />
          <button
            className={button}
            disabled={form.reason.trim().length < 10 || create.isPending}
            onClick={() =>
              create.mutate({
                ...form,
                targetTenantIds: split(targets),
                dependencies: splitFeatureKeys(dependencies),
                conflicts: splitFeatureKeys(conflicts),
                rolloutPercentage:
                  form.stage === "GENERAL" ? 100 : form.rolloutPercentage,
              })
            }
          >
            Taslak oluştur
          </button>
        </div>
      )}
      {query.isError && (
        <p role="alert" className="text-red-400">
          Rollout kayıtları alınamadı.
        </p>
      )}
      <div className="space-y-2">
        {query.data?.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-slate-200">
                {item.plan} · {item.featureKey} · v{item.version}
              </strong>
              <span className="text-xs text-violet-300">
                {item.environment} / {item.stage} / {item.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Dağıtım %{item.rolloutPercentage} · hata eşiği %
              {item.errorThresholdPct} · ölçülen %
              {item.observedErrorRatePct ?? "—"} · hedef{" "}
              {item.targetTenantIds.length} tenant
            </p>
            {canUpdate && (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.status === "DRAFT" && (
                  <button
                    className={button}
                    onClick={() => activate.mutate(item.id)}
                  >
                    İkinci admin onayına gönder
                  </button>
                )}
                {item.status === "ACTIVE" && (
                  <>
                    <input
                      className={field}
                      type="number"
                      min="0"
                      max="100"
                      value={metric[item.id] ?? ""}
                      onChange={(e) =>
                        setMetric({ ...metric, [item.id]: e.target.value })
                      }
                      placeholder="Hata %"
                    />
                    <button
                      className={button}
                      disabled={!metric[item.id]}
                      onClick={() =>
                        report.mutate({
                          id: item.id,
                          value: Number(metric[item.id]),
                        })
                      }
                    >
                      Metriği işle
                    </button>
                    <button
                      className={button}
                      onClick={() =>
                        stop.mutate({ id: item.id, killSwitch: false })
                      }
                    >
                      Durdur
                    </button>
                    <button
                      className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white"
                      onClick={() =>
                        stop.mutate({ id: item.id, killSwitch: true })
                      }
                    >
                      Kill switch
                    </button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
