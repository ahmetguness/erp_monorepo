"use client";

import type {
  AdminDemoRequest,
  DemoProvisioningPreview,
  DemoRequestStatus,
} from "@repo/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MonitorCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { canAdmin } from "@/lib/admin/permissions";
import {
  addDemoRequestNote,
  approveDemoRequest,
  assignDemoRequest,
  listDemoRequests,
  previewDemoRequest,
  rejectDemoRequest,
} from "@/services/demo-operations.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";
import { AdminPageHeader, AdminFilterToolbar } from "@/components/features/admin/ui";

const statuses: Array<DemoRequestStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "APPROVED",
  "PROVISIONING",
  "PROVISIONED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];
const inputClass =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
const buttonClass =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50";

export function DemoRequestOperationsPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const [status, setStatus] = useState<DemoRequestStatus | "ALL">("PENDING");
  const [search, setSearch] = useState("");
  const requests = useQuery({
    queryKey: ["admin", "demo-requests", status, search],
    queryFn: () =>
      listDemoRequests({
        status: status === "ALL" ? undefined : status,
        search: search || undefined,
      }),
  });
  return (
    <div className="space-y-4 pb-10">
      <AdminPageHeader
        title="Demo Talebi Operasyonları"
        description="SLA, mükerrer kayıt, sahiplik, not ve provizyon süreçleri."
        icon={MonitorCheck}
        iconTone="sky"
        badge={
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            {requests.data?.total ?? 0} Talep
          </span>
        }
      />

      <AdminFilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Şirket, kişi veya e-posta ara..."
        totalCount={requests.data?.total ?? 0}
        countLabel="talep"
        filters={
          <select
            className="rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-red-500/50"
            value={status}
            onChange={(event) => setStatus(parseStatus(event.target.value))}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === 'ALL' ? 'Tüm Durumlar' : item}
              </option>
            ))}
          </select>
        }
      />
      {requests.isLoading && (
        <p className="text-slate-400">Talepler yükleniyor…</p>
      )}
      {requests.isError && (
        <p className="text-red-400">Demo talepleri yüklenemedi.</p>
      )}
      <div className="space-y-3">
        {requests.data?.data.map((request) => (
          <DemoRequestCard
            key={request.id}
            request={request}
            adminId={admin?.id ?? ""}
            canApprove={canAdmin(admin, "demo.approve")}
            canReject={canAdmin(admin, "demo.reject")}
          />
        ))}
      </div>
    </div>
  );
}

function parseStatus(value: string): DemoRequestStatus | "ALL" {
  return statuses.find((status) => status === value) ?? "ALL";
}

function DemoRequestCard({
  request,
  adminId,
  canApprove,
  canReject,
}: {
  request: AdminDemoRequest;
  adminId: string;
  canApprove: boolean;
  canReject: boolean;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<DemoProvisioningPreview | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "demo-requests"] });
  const action = useMutation({
    mutationFn: async (
      kind: "preview" | "approve" | "reject" | "assign" | "note",
    ) => {
      if (kind === "preview")
        return setPreview(await previewDemoRequest(request.id));
      if (kind === "approve") await approveDemoRequest(request.id);
      if (kind === "reject") await rejectDemoRequest(request.id, note);
      if (kind === "assign") await assignDemoRequest(request.id, adminId);
      if (kind === "note") await addDemoRequestNote(request.id, note);
    },
    onSuccess: async (_, kind) => {
      if (kind !== "preview") {
        setNote("");
        setPreview(null);
        await refresh();
        toast.success("Demo talebi güncellendi.");
      }
    },
  });
  const noteValid = note.trim().length >= 10;
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">{request.companyName}</h2>
          <p>
            {request.fullName} · {request.email} · {request.plan}
          </p>
        </div>
        <div className="text-right text-xs">
          <p>{request.status}</p>
          <p
            className={request.slaBreached ? "text-red-400" : "text-slate-400"}
          >
            <Clock className="inline h-3 w-3" />{" "}
            {new Date(request.slaDueAt).toLocaleString("tr-TR")}
          </p>
        </div>
      </div>
      {request.duplicateWarnings.map((warning) => (
        <p key={warning.kind} className="mt-2 text-xs text-amber-300">
          <TriangleAlert className="mr-1 inline h-3 w-3" />
          {warning.message}
        </p>
      ))}
      <p className="mt-2 text-xs text-slate-400">
        Sahip: {request.ownerId ?? "Atanmamış"} · Not: {request.notes ?? "—"}
      </p>
      {request.status === "PENDING" && (canApprove || canReject) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={`${inputClass} min-w-72 flex-1`}
            placeholder="Not veya en az 10 karakter red gerekçesi"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {canApprove && request.ownerId !== adminId && (
            <button
              className={buttonClass}
              disabled={action.isPending}
              onClick={() => action.mutate("assign")}
            >
              Üzerime al
            </button>
          )}
          {canApprove && (
            <button
              className={buttonClass}
              disabled={action.isPending}
              onClick={() => action.mutate("preview")}
            >
              Provisioning önizle
            </button>
          )}
          {canApprove && note.trim().length >= 2 && (
            <button
              className={buttonClass}
              disabled={action.isPending}
              onClick={() => action.mutate("note")}
            >
              Not ekle
            </button>
          )}
          {canReject && (
            <button
              className={buttonClass}
              disabled={!noteValid || action.isPending}
              onClick={() => action.mutate("reject")}
            >
              Reddet
            </button>
          )}
        </div>
      )}
      {preview && (
        <section className="mt-4 rounded-lg border border-emerald-800 bg-emerald-950/20 p-3 text-xs">
          <p className="font-semibold text-emerald-300">
            Provisioning önizlemesi
          </p>
          <p>
            Slug: {preview.suggestedSlug} · Deneme: {preview.trialDays} gün
          </p>
          <p>Modüller: {preview.modules.join(", ") || "Temel modüller"}</p>
          <button
            className={`${buttonClass} mt-2`}
            disabled={action.isPending}
            onClick={() => action.mutate("approve")}
          >
            Onayla ve provision et
          </button>
        </section>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-400">
          Durum geçmişi ({request.history.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {request.history.map((event) => (
            <li key={event.id}>
              {new Date(event.createdAt).toLocaleString("tr-TR")} ·{" "}
              {event.action}
              {event.note ? ` · ${event.note}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
