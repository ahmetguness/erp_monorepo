"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlertHistoryItem,
  Incident,
  IncidentSeverity,
  IncidentStatus,
} from "@repo/types";
import { canAdmin } from "@/lib/admin/permissions";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import {
  addIncidentUpdate,
  createIncident,
  decideIncidentCommunication,
  getIncidents,
  requestIncidentCommunication,
  updateIncident,
} from "@/services/incident-management.service";
import { toast } from "@/store/ui.store";

const field =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";
const button =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-40";
const initialDraft = {
  alertId: "",
  title: "",
  summary: "",
  severity: "SEV2" as IncidentSeverity,
  owner: "platform-operations",
  runbookUrl: "https://runbooks.local/incidents",
  tenantIds: "",
};

export function IncidentManagementPanel({
  alerts,
}: {
  alerts: AlertHistoryItem[];
}) {
  const admin = useAdminAuthStore((state) => state.admin);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initialDraft);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [communication, setCommunication] = useState("");
  const query = useQuery({
    queryKey: ["admin", "incidents"],
    queryFn: getIncidents,
  });
  const refresh = async (incident?: Incident) => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "incidents"] });
    if (incident) setSelected(incident);
  };
  const createMutation = useMutation({
    mutationFn: () =>
      createIncident({
        alertId: draft.alertId || null,
        title: draft.title,
        summary: draft.summary,
        severity: draft.severity,
        owner: draft.owner,
        runbookUrl: draft.runbookUrl,
        affectedTenantIds: draft.tenantIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      }),
    onSuccess: async (incident) => {
      setDraft(initialDraft);
      await refresh(incident);
      toast.success("Olay kaydı açıldı.");
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      incident,
      status,
    }: {
      incident: Incident;
      status: IncidentStatus;
    }) => updateIncident(incident.id, { status }),
    onSuccess: refresh,
  });
  const timelineMutation = useMutation({
    mutationFn: () => addIncidentUpdate(selected!.id, updateMessage),
    onSuccess: async (incident) => {
      setUpdateMessage("");
      await refresh(incident);
    },
  });
  const communicationMutation = useMutation({
    mutationFn: () => requestIncidentCommunication(selected!.id, communication),
    onSuccess: async (incident) => {
      setCommunication("");
      await refresh(incident);
      toast.success("Mesaj önizlemesi ikinci admin onayına gönderildi.");
    },
  });
  const decisionMutation = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "APPROVE" | "REJECT";
    }) =>
      decideIncidentCommunication(
        id,
        decision,
        decision === "APPROVE"
          ? "İçerik ve alıcı kapsamı doğrulandı."
          : "İçerik revizyon gerektiriyor.",
      ),
    onSuccess: refresh,
  });
  const canManage = canAdmin(admin, "operations.manage");

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div>
        <h2 className="text-sm font-semibold text-white">
          Olay yönetimi ve durum iletişimi
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Alarmdan olaya · zaman çizelgesi · iki kişi onaylı tenant/status-page
          iletişimi
        </p>
      </div>
      {canManage && (
        <div className="grid gap-2 md:grid-cols-3">
          <select
            className={field}
            value={draft.alertId}
            onChange={(event) => {
              const alert = alerts.find(
                (item) => item.id === event.target.value,
              );
              setDraft({
                ...draft,
                alertId: event.target.value,
                title: alert ? `${alert.metricKey} kritik alarmı` : draft.title,
                runbookUrl: alert?.runbookUrl ?? draft.runbookUrl,
              });
            }}
          >
            <option value="">Alarm seçmeden aç</option>
            {alerts
              .filter(
                (alert) =>
                  alert.status === "OPEN" && alert.severity === "critical",
              )
              .map((alert) => (
                <option key={alert.id} value={alert.id}>
                  {alert.metricKey} · {alert.severity}
                </option>
              ))}
          </select>
          <input
            className={field}
            placeholder="Olay başlığı"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
          <select
            className={field}
            value={draft.severity}
            onChange={(event) =>
              setDraft({
                ...draft,
                severity: event.target.value as IncidentSeverity,
              })
            }
          >
            <option>SEV1</option>
            <option>SEV2</option>
            <option>SEV3</option>
          </select>
          <input
            className={field}
            placeholder="Sorumlu ekip"
            value={draft.owner}
            onChange={(event) =>
              setDraft({ ...draft, owner: event.target.value })
            }
          />
          <input
            className={field}
            placeholder="Etkilenen tenant ID’leri, virgülle"
            value={draft.tenantIds}
            onChange={(event) =>
              setDraft({ ...draft, tenantIds: event.target.value })
            }
          />
          <input
            className={field}
            placeholder="Runbook URL"
            value={draft.runbookUrl}
            onChange={(event) =>
              setDraft({ ...draft, runbookUrl: event.target.value })
            }
          />
          <textarea
            className={`${field} md:col-span-2`}
            placeholder="Etki ve ilk bulgular"
            value={draft.summary}
            onChange={(event) =>
              setDraft({ ...draft, summary: event.target.value })
            }
          />
          <button
            className={button}
            disabled={
              draft.title.length < 5 ||
              draft.summary.length < 10 ||
              createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
          >
            Olay aç
          </button>
        </div>
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-red-300">
          Olay kayıtları alınamadı.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {query.data?.map((incident) => (
            <button
              key={incident.id}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left"
              onClick={() => setSelected(incident)}
            >
              <span className="text-xs font-semibold text-red-300">
                {incident.severity} · {incident.status}
              </span>
              <p className="mt-1 text-sm text-white">{incident.title}</p>
              <p className="text-xs text-slate-500">
                {incident.owner} · {incident.affectedTenants.length} tenant
              </p>
            </button>
          ))}
        </div>
        {selected ? (
          <IncidentDetail
            incident={selected}
            canManage={canManage}
            updateMessage={updateMessage}
            communication={communication}
            onUpdateMessage={setUpdateMessage}
            onCommunication={setCommunication}
            onStatus={(status) =>
              updateMutation.mutate({ incident: selected, status })
            }
            onPostmortem={(incident) => setSelected(incident)}
            onAddUpdate={() => timelineMutation.mutate()}
            onRequestCommunication={() => communicationMutation.mutate()}
            onDecision={(id, decision) =>
              decisionMutation.mutate({ id, decision })
            }
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
            Detay için bir olay seçin.
          </div>
        )}
      </div>
    </section>
  );
}

function IncidentDetail({
  incident,
  canManage,
  updateMessage,
  communication,
  onUpdateMessage,
  onCommunication,
  onStatus,
  onPostmortem,
  onAddUpdate,
  onRequestCommunication,
  onDecision,
}: {
  incident: Incident;
  canManage: boolean;
  updateMessage: string;
  communication: string;
  onUpdateMessage: (value: string) => void;
  onCommunication: (value: string) => void;
  onStatus: (status: IncidentStatus) => void;
  onPostmortem: (incident: Incident) => void;
  onAddUpdate: () => void;
  onRequestCommunication: () => void;
  onDecision: (id: string, decision: "APPROVE" | "REJECT") => void;
}) {
  const postmortemMutation = useMutation({
    mutationFn: () =>
      updateIncident(incident.id, {
        rootCause: incident.rootCause,
        resolution: incident.resolution,
      }),
    onSuccess: onPostmortem,
  });
  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white">{incident.title}</h3>
          <p className="text-xs text-slate-400">{incident.summary}</p>
        </div>
        {canManage && (
          <select
            className={field}
            value={incident.status}
            onChange={(event) => onStatus(event.target.value as IncidentStatus)}
          >
            <option>INVESTIGATING</option>
            <option>IDENTIFIED</option>
            <option>MONITORING</option>
            <option>RESOLVED</option>
          </select>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Etkilenenler:{" "}
        {incident.affectedTenants
          .map((tenant) => tenant.tenantName)
          .join(", ") || "Henüz yok"}{" "}
        ·{" "}
        <a className="text-blue-400" href={incident.runbookUrl}>
          Runbook
        </a>
      </p>
      {canManage && (
        <div className="grid gap-2 md:grid-cols-2">
          <textarea
            className={field}
            placeholder="Kök neden"
            value={incident.rootCause ?? ""}
            onChange={(event) =>
              onPostmortem({
                ...incident,
                rootCause: event.target.value || null,
              })
            }
          />
          <textarea
            className={field}
            placeholder="Kalıcı çözüm"
            value={incident.resolution ?? ""}
            onChange={(event) =>
              onPostmortem({
                ...incident,
                resolution: event.target.value || null,
              })
            }
          />
          <button
            className={button}
            disabled={
              (incident.rootCause?.length ?? 0) < 10 ||
              (incident.resolution?.length ?? 0) < 10
            }
            onClick={() => postmortemMutation.mutate()}
          >
            Postmortem kaydet
          </button>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold text-slate-300">
          Zaman çizelgesi
        </h4>
        {incident.timeline.map((entry) => (
          <p
            key={entry.id}
            className="mt-2 border-l border-slate-700 pl-3 text-xs text-slate-400"
          >
            <span className="text-slate-200">{entry.type}</span> ·{" "}
            {entry.message} · {entry.actorName}
          </p>
        ))}
      </div>
      {canManage && (
        <div className="flex gap-2">
          <input
            className={`${field} flex-1`}
            value={updateMessage}
            onChange={(event) => onUpdateMessage(event.target.value)}
            placeholder="Operasyon güncellemesi"
          />
          <button
            className={button}
            disabled={updateMessage.length < 3}
            onClick={onAddUpdate}
          >
            Ekle
          </button>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold text-slate-300">
          Tenant iletişimi ve durum sayfası
        </h4>
        {canManage && (
          <div className="mt-2 flex gap-2">
            <textarea
              className={`${field} flex-1`}
              value={communication}
              onChange={(event) => onCommunication(event.target.value)}
              placeholder="Tenant’lara gösterilecek mesaj önizlemesi"
            />
            <button
              className={button}
              disabled={
                communication.length < 10 ||
                incident.affectedTenants.length === 0
              }
              onClick={onRequestCommunication}
            >
              Onaya gönder
            </button>
          </div>
        )}
        {incident.communications.map((item) => (
          <div
            key={item.id}
            className="mt-2 rounded border border-slate-800 p-2 text-xs text-slate-400"
          >
            <p>{item.message}</p>
            <p className="mt-1">
              {item.status} · {item.recipientCount} alıcı ·{" "}
              {item.requestedByName}
            </p>
            {canManage && item.status === "PENDING_APPROVAL" && (
              <div className="mt-2 flex gap-2">
                <button
                  className={button}
                  onClick={() => onDecision(item.id, "APPROVE")}
                >
                  Onayla ve yayınla
                </button>
                <button
                  className={button}
                  onClick={() => onDecision(item.id, "REJECT")}
                >
                  Reddet
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
