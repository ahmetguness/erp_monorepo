"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DomainEventFailureSnapshot,
  RecentWorkerJobSnapshot,
} from "@/services/admin.service";
import type {
  OperationInterventionAction,
  OperationItemKind,
} from "@repo/types";
import { canAdmin } from "@/lib/admin/permissions";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import {
  getOperationItem,
  interveneOperations,
} from "@/services/operation-intervention.service";
import { toast } from "@/store/ui.store";
import { SensitiveDataRevealButton } from "@/components/features/admin/sensitive-data/SensitiveDataRevealButton";

type ItemRef = {
  id: string;
  kind: OperationItemKind;
  label: string;
  status: string;
  attempts: number;
};
const button =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-40";

export function OperationInterventionPanel({
  events,
  jobs,
}: {
  events: DomainEventFailureSnapshot[];
  jobs: RecentWorkerJobSnapshot[];
}) {
  const admin = useAdminAuthStore((state) => state.admin);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [detailRef, setDetailRef] = useState<{
    id: string;
    kind: OperationItemKind;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<OperationInterventionAction>("RETRY");
  const items: ItemRef[] = [
    ...events.map((item) => ({
      id: item.id,
      kind: "DOMAIN_EVENT" as const,
      label: item.name,
      status: item.status,
      attempts: item.attempts,
    })),
    ...jobs.map((item) => ({
      id: item.id,
      kind: "MARKETPLACE_JOB" as const,
      label: item.jobType,
      status: item.status,
      attempts: item.attempts,
    })),
  ];
  const chosen = items.filter((item) =>
    selected.includes(`${item.kind}:${item.id}`),
  );
  const detail = useQuery({
    queryKey: ["admin", "operation-item", detailRef?.kind, detailRef?.id],
    queryFn: () => {
      if (!detailRef) throw new Error("Operasyon kaydı seçilmedi.");
      return getOperationItem(detailRef.id, detailRef.kind);
    },
    enabled: Boolean(detailRef),
  });
  const intervention = useMutation({
    mutationFn: (dryRun: boolean) =>
      interveneOperations({
        items: chosen.map(({ id, kind }) => ({ id, kind })),
        action,
        reason,
        dryRun,
      }),
    onSuccess: async (preview, dryRun) => {
      if (dryRun)
        toast.success(
          preview.allowed
            ? "Dry-run başarılı; işlem uygulanabilir."
            : "Dry-run engel tespit etti.",
        );
      else {
        setSelected([]);
        await queryClient.invalidateQueries({
          queryKey: ["admin", "observability"],
        });
        toast.success(
          "Operasyon müdahalesi uygulandı ve audit kaydı oluşturuldu.",
        );
      }
    },
  });
  const canManage = canAdmin(admin, "operations.manage");
  const canRevealSensitiveData = canAdmin(admin, "sensitive-data.reveal");

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div>
        <h2 className="text-sm font-semibold text-white">
          Güvenli müdahale merkezi
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Payload’lar PII maskeli gösterilir. En fazla 50 kayıt dry-run
          sonrasında topluca işlenebilir.
        </p>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {items.map((item) => {
          const key = `${item.kind}:${item.id}`;
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3"
            >
              {canManage && (
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, key]
                        : selected.filter((value) => value !== key),
                    )
                  }
                  aria-label={`${item.label} seç`}
                />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setDetailRef({ id: item.id, kind: item.kind })}
              >
                <span className="block truncate text-sm text-slate-200">
                  {item.label}
                </span>
                <span className="text-xs text-slate-500">
                  {item.kind} · {item.status} · {item.attempts} deneme
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <select
            className={button}
            value={action}
            onChange={(event) =>
              setAction(event.target.value as OperationInterventionAction)
            }
          >
            <option value="RETRY">Yeniden dene</option>
            <option value="QUARANTINE">Karantina</option>
            <option value="RESOLVE">Çözüldü</option>
          </select>
          <input
            className="min-w-64 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Zorunlu çözüm/müdahale gerekçesi"
          />
          <button
            className={button}
            disabled={
              !chosen.length ||
              reason.trim().length < 10 ||
              intervention.isPending
            }
            onClick={() => intervention.mutate(true)}
          >
            Dry-run
          </button>
          <button
            className={button}
            disabled={
              !chosen.length ||
              reason.trim().length < 10 ||
              intervention.isPending
            }
            onClick={() => intervention.mutate(false)}
          >
            Uygula
          </button>
        </div>
      )}
      {intervention.data && (
        <div className="rounded-lg border border-slate-800 p-3 text-xs text-slate-300">
          {intervention.data.items.map((item) => (
            <p
              key={`${item.kind}:${item.id}`}
              className={item.allowed ? "text-emerald-300" : "text-red-300"}
            >
              {item.id}: {item.reason} (sonraki deneme {item.nextAttempt})
            </p>
          ))}
        </div>
      )}
      {intervention.isError && (
        <p role="alert" className="text-sm text-red-400">
          Müdahale uygulanamadı. Kayıtları yenileyip dry-run çalıştırın.
        </p>
      )}
      {detail.data && (
        <div className="rounded-lg border border-violet-500/20 bg-slate-950 p-4">
          <div className="flex justify-between gap-3">
            <strong className="text-slate-100">{detail.data.name}</strong>
            <button
              className="text-xs text-slate-400"
              onClick={() => setDetailRef(null)}
            >
              Kapat
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {detail.data.idempotencyKey} · {detail.data.status} ·{" "}
            {detail.data.attempts}/{detail.data.maxAttempts}
          </p>
          <p className="mt-2 text-xs text-red-300">
            {detail.data.lastError ?? "Hata mesajı yok"}
          </p>
          {canRevealSensitiveData && detail.data.lastError === "Hata ayrıntısı maskelendi." && (
            <div className="mt-2"><SensitiveDataRevealButton tenantId={detail.data.tenantId} fields={["errorDetails"]} onGranted={() => { void detail.refetch(); }} /></div>
          )}
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-slate-300">
            {JSON.stringify(
              { payload: detail.data.payload, context: detail.data.context },
              null,
              2,
            )}
          </pre>
          {detail.data.resolutionNote && (
            <p className="mt-2 text-xs text-emerald-300">
              Çözüm: {detail.data.resolutionNote}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
