"use client";

import type {
  CreateDataSubjectRequestInput,
  DataSubjectRequestDto,
} from "@repo/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "@/store/ui.store";
import { canAdmin } from "@/lib/admin/permissions";
import {
  createLegalHold,
  createPrivacyRequest,
  decidePrivacyRequest,
  downloadPrivacyExport,
  executePrivacyRequest,
  listPrivacyRequests,
  verifyPrivacyIdentity,
  type CreateLegalHoldInput,
} from "@/services/privacy-operations.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";

const queryKey = ["admin", "privacy"] as const;
const fieldClass =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200";
const buttonClass =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-50";
const initialRequest: CreateDataSubjectRequestInput = {
  tenantId: "",
  subjectEmail: "",
  type: "EXPORT",
  scope: ["IDENTITY", "MEMBERSHIP"],
  reason: "",
  ticketId: "",
};
const initialHold: CreateLegalHoldInput = {
  tenantId: "",
  subjectEmail: "",
  reason: "",
};

export function PrivacyOperationsPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = canAdmin(admin, "privacy.manage");
  const queryClient = useQueryClient();
  const [request, setRequest] = useState(initialRequest);
  const [hold, setHold] = useState(initialHold);
  const requests = useQuery({ queryKey, queryFn: listPrivacyRequests });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const createRequestMutation = useMutation({
    mutationFn: () => createPrivacyRequest(request),
    onSuccess: async () => {
      setRequest(initialRequest);
      await refresh();
      toast.success("Veri sahibi talebi oluşturuldu.");
    },
  });
  const createHoldMutation = useMutation({
    mutationFn: () => createLegalHold(hold),
    onSuccess: async () => {
      setHold(initialHold);
      await refresh();
      toast.success("Legal hold oluşturuldu.");
    },
  });

  return (
    <div className="space-y-5 pb-12">
      <header>
        <h1 className="flex gap-2 text-2xl font-semibold text-white">
          <ShieldCheck />
          Gizlilik ve Veri Sahibi Talepleri
        </h1>
        <p className="text-xs text-slate-400">
          KVKK/GDPR doğrulama, ikinci onay, export ve anonimleştirme
        </p>
      </header>

      {canManage && (
        <>
          <RequestForm
            value={request}
            disabled={createRequestMutation.isPending}
            onChange={setRequest}
            onSubmit={() => createRequestMutation.mutate()}
          />
          <LegalHoldForm
            value={hold}
            disabled={createHoldMutation.isPending}
            onChange={setHold}
            onSubmit={() => createHoldMutation.mutate()}
          />
        </>
      )}

      {requests.isLoading && <p className="text-sm text-slate-400">Yükleniyor…</p>}
      {requests.isError && (
        <p className="text-sm text-red-400">Gizlilik talepleri yüklenemedi.</p>
      )}
      <div className="space-y-3">
        {requests.data?.map((item) => (
          <PrivacyRequestCard
            key={item.id}
            request={item}
            canManage={canManage}
            refresh={refresh}
          />
        ))}
      </div>
    </div>
  );
}

interface RequestFormProps {
  value: CreateDataSubjectRequestInput;
  disabled: boolean;
  onChange: (value: CreateDataSubjectRequestInput) => void;
  onSubmit: () => void;
}

function RequestForm({ value, disabled, onChange, onSubmit }: RequestFormProps) {
  const valid =
    value.tenantId.length > 0 &&
    value.subjectEmail.length > 0 &&
    value.ticketId.trim().length >= 2 &&
    value.reason.trim().length >= 10;
  return (
    <section className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-3">
      <input className={fieldClass} placeholder="Tenant ID" value={value.tenantId} onChange={(event) => onChange({ ...value, tenantId: event.target.value })} />
      <input className={fieldClass} type="email" placeholder="E-posta" value={value.subjectEmail} onChange={(event) => onChange({ ...value, subjectEmail: event.target.value })} />
      <select className={fieldClass} value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value as CreateDataSubjectRequestInput["type"] })}>
        <option value="EXPORT">Export</option>
        <option value="ANONYMIZATION">Anonimleştirme</option>
        <option value="ERASURE">Silme</option>
      </select>
      <input className={fieldClass} placeholder="Ticket" value={value.ticketId} onChange={(event) => onChange({ ...value, ticketId: event.target.value })} />
      <input className={fieldClass} placeholder="En az 10 karakter gerekçe" value={value.reason} onChange={(event) => onChange({ ...value, reason: event.target.value })} />
      <button className={buttonClass} disabled={!valid || disabled} onClick={onSubmit}>Talep oluştur</button>
    </section>
  );
}

interface LegalHoldFormProps {
  value: CreateLegalHoldInput;
  disabled: boolean;
  onChange: (value: CreateLegalHoldInput) => void;
  onSubmit: () => void;
}

function LegalHoldForm({ value, disabled, onChange, onSubmit }: LegalHoldFormProps) {
  const valid = value.tenantId.length > 0 && value.reason.trim().length >= 10;
  return (
    <section className="grid gap-2 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 md:grid-cols-4">
      <strong className="self-center text-sm text-amber-200">Legal hold</strong>
      <input className={fieldClass} placeholder="Tenant ID" value={value.tenantId} onChange={(event) => onChange({ ...value, tenantId: event.target.value })} />
      <input className={fieldClass} type="email" placeholder="E-posta (opsiyonel)" value={value.subjectEmail ?? ""} onChange={(event) => onChange({ ...value, subjectEmail: event.target.value || undefined })} />
      <input className={fieldClass} placeholder="En az 10 karakter gerekçe" value={value.reason} onChange={(event) => onChange({ ...value, reason: event.target.value })} />
      <button className={buttonClass} disabled={!valid || disabled} onClick={onSubmit}>Legal hold oluştur</button>
    </section>
  );
}

type CardAction = "verify" | "approve" | "reject" | "execute" | "download";

function PrivacyRequestCard({ request, canManage, refresh }: { request: DataSubjectRequestDto; canManage: boolean; refresh: () => Promise<unknown> }) {
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: async (action: CardAction) => {
      if (action === "verify") return verifyPrivacyIdentity(request.id, note);
      if (action === "approve" || action === "reject")
        return decidePrivacyRequest(request.id, action === "approve", note);
      if (action === "execute") return executePrivacyRequest(request.id);
      return downloadPrivacyExport(request.id);
    },
    onSuccess: async () => {
      setNote("");
      await refresh();
      toast.success("İşlem tamamlandı.");
    },
  });
  const needsNote =
    request.status === "PENDING_VERIFICATION" ||
    request.status === "PENDING_APPROVAL";
  const noteValid = note.trim().length >= 10;

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-300">
      <div className="flex justify-between gap-3">
        <strong>{request.subjectEmail} · {request.type}</strong>
        <span>{request.status}{request.legalHold ? " · LEGAL HOLD" : ""}</span>
      </div>
      <p>{request.tenantName} · {request.ticketId} · {request.scope.join(", ")}</p>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {needsNote && <input className={`${fieldClass} min-w-64 flex-1`} placeholder="En az 10 karakter kanıt / gerekçe" value={note} onChange={(event) => setNote(event.target.value)} />}
          {request.status === "PENDING_VERIFICATION" && <ActionButton label="Doğrula" disabled={!noteValid || mutation.isPending} run={() => mutation.mutate("verify")} />}
          {request.status === "PENDING_APPROVAL" && (
            <>
              <ActionButton label="Onayla" disabled={!noteValid || mutation.isPending} run={() => mutation.mutate("approve")} />
              <ActionButton label="Reddet" disabled={!noteValid || mutation.isPending} run={() => mutation.mutate("reject")} />
            </>
          )}
          {request.status === "APPROVED" && <ActionButton label="Uygula" disabled={mutation.isPending} run={() => mutation.mutate("execute")} />}
          {request.status === "COMPLETED" && request.type === "EXPORT" && (
            <button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate("download")}>
              <Download className="mr-1 inline h-4 w-4" /> İndir
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function ActionButton({ label, disabled, run }: { label: string; disabled: boolean; run: () => void }) {
  return <button className={buttonClass} disabled={disabled} onClick={run}>{label}</button>;
}
