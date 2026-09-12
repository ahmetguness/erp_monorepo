"use client";

import type {
  CreateDataSubjectRequestInput,
  DataSubjectRequestDto,
} from "@repo/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  RefreshCw,
  FileCheck2,
  Lock,
  PlusCircle,
  AlertTriangle,
} from "lucide-react";
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
import { AdminPageHeader, AdminKpiGrid, AdminKpiCard } from "../ui";

const queryKey = ["admin", "privacy"] as const;

const fieldClass =
  "rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors";
const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-slate-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-3.5 py-2 text-xs font-semibold text-indigo-300 transition-all hover:bg-indigo-500/30 hover:border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const amberButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3.5 py-2 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/30 hover:border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

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

  const items = requests.data ?? [];
  const pendingCount = items.filter(
    (r) => r.status === "PENDING_VERIFICATION" || r.status === "PENDING_APPROVAL"
  ).length;
  const legalHoldCount = items.filter((r) => r.legalHold).length;
  const completedCount = items.filter((r) => r.status === "COMPLETED").length;

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Gizlilik ve Veri Sahibi Talepleri"
        description="KVKK / GDPR kimlik doğrulama, çift aşamalı onay, export ve anonimleştirme operasyonları"
        icon={ShieldCheck}
        iconTone="indigo"
        badge={
          pendingCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
              {pendingCount} Onay Bekliyor
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
              Tüm Talepler Güncel
            </span>
          )
        }
        actions={
          <button
            type="button"
            onClick={() => requests.refetch()}
            disabled={requests.isFetching}
            className={buttonClass}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${requests.isFetching ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>
        }
      />

      {/* KPI Overview Grid */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Toplam Talep"
          value={items.length}
          subtext="Kayıtlı veri sahibi talebi"
          icon={FileCheck2}
          iconTone="indigo"
        />
        <AdminKpiCard
          label="Bekleyen Onaylar"
          value={pendingCount}
          subtext="Kimlik veya işlem onayı bekleyen"
          icon={Clock}
          iconTone={pendingCount > 0 ? "amber" : "slate"}
        />
        <AdminKpiCard
          label="Yasal Dondurma (Legal Hold)"
          value={legalHoldCount}
          subtext="Durdurulan hesap / veri sayısı"
          icon={Lock}
          iconTone={legalHoldCount > 0 ? "red" : "slate"}
        />
        <AdminKpiCard
          label="Tamamlanan"
          value={completedCount}
          subtext="Başarıyla icra edilen talepler"
          icon={CheckCircle2}
          iconTone="emerald"
        />
      </AdminKpiGrid>

      {/* Forms Section */}
      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
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
        </div>
      )}

      {requests.isError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>Gizlilik talepleri listesi yüklenemedi. Lütfen bağlantınızı kontrol edin.</span>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Talep ve İşlem Kayıtları ({items.length})
          </h2>
        </div>

        {requests.isLoading && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
            Talepler taranıyor...
          </div>
        )}

        {!requests.isLoading && items.length === 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-12 text-center text-xs text-slate-500">
            Henüz oluşturulmuş veri sahibi talebi bulunmuyor.
          </div>
        )}

        {items.map((item) => (
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
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm shadow-inner">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4 text-indigo-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Yeni Veri Sahibi Talebi (DSR)
          </h2>
        </div>
        <span className="text-[11px] text-slate-400">KVKK / GDPR Md. 11</span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          className={fieldClass}
          placeholder="Tenant ID *"
          value={value.tenantId}
          onChange={(event) => onChange({ ...value, tenantId: event.target.value })}
        />
        <input
          className={fieldClass}
          type="email"
          placeholder="İlgili Kişi E-posta *"
          value={value.subjectEmail}
          onChange={(event) => onChange({ ...value, subjectEmail: event.target.value })}
        />
        <select
          className={fieldClass}
          value={value.type}
          onChange={(event) =>
            onChange({ ...value, type: event.target.value as CreateDataSubjectRequestInput["type"] })
          }
        >
          <option value="EXPORT">Veri İndirme (Export)</option>
          <option value="ANONYMIZATION">Anonimleştirme (Anonymization)</option>
          <option value="ERASURE">Veri Silme (Erasure)</option>
        </select>
        <input
          className={fieldClass}
          placeholder="Ticket ID (min 2 krk) *"
          value={value.ticketId}
          onChange={(event) => onChange({ ...value, ticketId: event.target.value })}
        />
        <div className="sm:col-span-2">
          <input
            className={`${fieldClass} w-full`}
            placeholder="Yasal gerekçe ve açıklama (en az 10 karakter) *"
            value={value.reason}
            onChange={(event) => onChange({ ...value, reason: event.target.value })}
          />
        </div>
        <div className="sm:col-span-2 flex justify-end pt-1">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!valid || disabled}
            onClick={onSubmit}
          >
            {disabled ? "Oluşturuluyor..." : "Talebi Kaydet"}
          </button>
        </div>
      </div>
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
    <section className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-5 backdrop-blur-sm shadow-inner">
      <div className="mb-3 flex items-center justify-between border-b border-amber-900/40 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-200">
            Yasal Dondurma Emri (Legal Hold)
          </h2>
        </div>
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
          Kritik
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          className={fieldClass}
          placeholder="Tenant ID *"
          value={value.tenantId}
          onChange={(event) => onChange({ ...value, tenantId: event.target.value })}
        />
        <input
          className={fieldClass}
          type="email"
          placeholder="E-posta (Opsiyonel / Belirli Kişi)"
          value={value.subjectEmail ?? ""}
          onChange={(event) => onChange({ ...value, subjectEmail: event.target.value || undefined })}
        />
        <div className="sm:col-span-2">
          <input
            className={`${fieldClass} w-full`}
            placeholder="Dondurma yasal gerekçesi / dava / tebligat ref (en az 10 karakter) *"
            value={value.reason}
            onChange={(event) => onChange({ ...value, reason: event.target.value })}
          />
        </div>
        <div className="sm:col-span-2 flex justify-end pt-1">
          <button
            type="button"
            className={amberButtonClass}
            disabled={!valid || disabled}
            onClick={onSubmit}
          >
            {disabled ? "Oluşturuluyor..." : "Legal Hold Uygula"}
          </button>
        </div>
      </div>
    </section>
  );
}

type CardAction = "verify" | "approve" | "reject" | "execute" | "download";

function PrivacyRequestCard({
  request,
  canManage,
  refresh,
}: {
  request: DataSubjectRequestDto;
  canManage: boolean;
  refresh: () => Promise<unknown>;
}) {
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

  const statusTone =
    request.status === "COMPLETED"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : request.status === "REJECTED"
      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
      : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <article className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs backdrop-blur-sm transition-all hover:border-slate-700/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-white">{request.subjectEmail}</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
            {request.type}
          </span>
          {request.legalHold && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400">
              <Lock className="h-3 w-3" />
              LEGAL HOLD
            </span>
          )}
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusTone}`}>
          {request.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-slate-400 sm:grid-cols-3">
        <div>
          <span className="text-slate-500">Tenant: </span>
          <span className="text-slate-200 font-medium">{request.tenantName}</span>
        </div>
        <div>
          <span className="text-slate-500">Destek Bileti: </span>
          <span className="font-mono text-slate-200">{request.ticketId}</span>
        </div>
        <div>
          <span className="text-slate-500">Kapsam: </span>
          <span className="text-slate-200">{request.scope.join(", ")}</span>
        </div>
      </div>

      {canManage && (
        <div className="mt-4 border-t border-slate-800/60 pt-3 flex flex-wrap items-center gap-2">
          {needsNote && (
            <input
              className={`${fieldClass} min-w-[280px] flex-1`}
              placeholder="En az 10 karakter kanıt / gerekçe notu girin *"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
          {request.status === "PENDING_VERIFICATION" && (
            <button
              type="button"
              className={buttonClass}
              disabled={!noteValid || mutation.isPending}
              onClick={() => mutation.mutate("verify")}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Kimliği Doğrula</span>
            </button>
          )}
          {request.status === "PENDING_APPROVAL" && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                disabled={!noteValid || mutation.isPending}
                onClick={() => mutation.mutate("approve")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Onayla</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                disabled={!noteValid || mutation.isPending}
                onClick={() => mutation.mutate("reject")}
              >
                <span>Reddet</span>
              </button>
            </>
          )}
          {request.status === "APPROVED" && (
            <button
              type="button"
              className={primaryButtonClass}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("execute")}
            >
              <span>İşlemi Uygula</span>
            </button>
          )}
          {request.status === "COMPLETED" && request.type === "EXPORT" && (
            <button
              type="button"
              className={buttonClass}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("download")}
            >
              <Download className="h-3.5 w-3.5 text-sky-400" />
              <span>Export Dosyasını İndir</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}
