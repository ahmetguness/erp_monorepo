"use client";

import { useState } from "react";
import { Camera, ClipboardCheck, CloudOff, MapPinned, RefreshCw, Route, Signature, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateFieldServiceCheckpoint, useFieldServiceMobileFlow } from "@/hooks/useService";
import type {
  FieldServiceCheckpointKind,
  FieldServiceJobRow,
  FieldServiceRouteStop,
  FieldServiceStepStatus,
} from "@/services/service.service";

interface CheckpointState {
  job: FieldServiceJobRow;
  kind: FieldServiceCheckpointKind;
}

function statusVariant(status: FieldServiceStepStatus): BadgeVariant {
  if (status === "complete") return "success";
  if (status === "blocked") return "neutral";
  return "warning";
}

function statusLabel(status: FieldServiceStepStatus): string {
  if (status === "complete") return "Tamam";
  if (status === "blocked") return "Bloke";
  return "Bekliyor";
}

function priorityVariant(priority: FieldServiceJobRow["priority"]): BadgeVariant {
  if (priority === "CRITICAL") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "neutral";
  return "info";
}

function routeAddress(stop: FieldServiceRouteStop): string {
  return [stop.address, stop.city].filter(Boolean).join(" / ") || "Adres bekleniyor";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function checkpointTitle(kind: FieldServiceCheckpointKind): string {
  if (kind === "CUSTOMER_APPROVAL") return "Musteri Onayi";
  if (kind === "SERVICE_FORM") return "Servis Formu";
  return "Ziyaret Notu";
}

function completedStepCount(job: FieldServiceJobRow): number {
  return job.steps.filter((step) => step.status === "complete").length;
}

export function FieldServiceMobileFlowPage() {
  const router = useRouter();
  const { data, isLoading, isFetching, refetch } = useFieldServiceMobileFlow();
  const checkpoint = useCreateFieldServiceCheckpoint();
  const [activeCheckpoint, setActiveCheckpoint] = useState<CheckpointState | null>(null);
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");

  const routeColumns: ColumnDef<FieldServiceRouteStop>[] = [
    {
      key: "sequence",
      header: "Sira",
      width: "70px",
      align: "center",
      render: (row) => <span className="font-mono text-sky-300">#{row.sequence}</span>,
    },
    {
      key: "title",
      header: "Durak",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.title}</span>
          <span className="block text-[11px] text-slate-500">{routeAddress(row)}</span>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Telefon",
      width: "130px",
      render: (row) => <span className="text-slate-300">{row.contactPhone ?? "-"}</span>,
    },
    {
      key: "request",
      header: "Talep",
      width: "110px",
      render: (row) => <span className="font-mono text-sky-300">{row.serviceRequestNumber}</span>,
    },
  ];

  const jobColumns: ColumnDef<FieldServiceJobRow>[] = [
    {
      key: "job",
      header: "Servis",
      render: (row) => (
        <div>
          <span className="font-mono text-[11px] text-sky-300">{row.number}</span>
          <span className="block text-sm font-semibold text-white">{row.subject}</span>
          <span className="block text-[11px] text-slate-500">{row.contact?.name ?? row.asset?.name ?? "Cari/varlik yok"}</span>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Oncelik",
      width: "95px",
      render: (row) => <Badge variant={priorityVariant(row.priority)}>{row.priority}</Badge>,
    },
    {
      key: "steps",
      header: "Akis",
      width: "120px",
      align: "center",
      render: (row) => <span className="font-mono text-emerald-300">{completedStepCount(row)}/{row.steps.length}</span>,
    },
    {
      key: "media",
      header: "Medya",
      width: "120px",
      render: (row) => <span className="text-slate-300">{row.photoCount} foto / {row.signatureCount} imza</span>,
    },
    {
      key: "offline",
      header: "Offline",
      width: "115px",
      render: (row) => (
        <div>
          <Badge variant={row.offlineReady ? "success" : "warning"}>{row.offlineReady ? "Hazir" : "Eksik"}</Badge>
          {row.pendingSyncCount > 0 && <span className="mt-1 block text-[11px] text-amber-300">{row.pendingSyncCount} kuyruk</span>}
        </div>
      ),
    },
    {
      key: "approval",
      header: "Onay",
      width: "105px",
      render: (row) => <Badge variant={row.customerApproved ? "success" : "warning"}>{row.customerApproved ? "Alindi" : "Bekliyor"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      width: "185px",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setActiveCheckpoint({ job: row, kind: "SERVICE_FORM" }); }}>
            Form
          </Button>
          <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setActiveCheckpoint({ job: row, kind: "CUSTOMER_APPROVAL" }); }}>
            Onay
          </Button>
        </div>
      ),
    },
  ];

  const submitCheckpoint = () => {
    if (!activeCheckpoint) return;
    checkpoint.mutate({
      serviceRequestId: activeCheckpoint.job.id,
      data: {
        kind: activeCheckpoint.kind,
        note: note || undefined,
        customerName: customerName || undefined,
      },
    }, {
      onSuccess: () => {
        setActiveCheckpoint(null);
        setNote("");
        setCustomerName("");
      },
    });
  };

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Saha Servis Mobil Akisi"
        subtitle="Teknisyen atama, rota, fotograf/imza, servis formu ve musteri onayi."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <UserCheck className="mb-2 h-4 w-4 text-sky-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Atanan Is</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.assignedJobCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.totalJobs ?? 0} aktif servis</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Route className="mb-2 h-4 w-4 text-emerald-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Rota Hazir</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.routeReadyCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Camera className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Foto / Imza</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.photoReadyCount ?? 0}/{summary?.signatureReadyCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Signature className="mb-2 h-4 w-4 text-violet-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Musteri Onayi</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.customerApprovedCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.formSubmittedCount ?? 0} servis formu</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <CloudOff className="mb-2 h-4 w-4 text-cyan-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Offline Hazir</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.offlineReadyCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.pendingSyncCount ?? 0} senkron kuyrugu</span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.jobs ?? []).slice(0, 6).map((job) => (
          <button
            key={job.id}
            onClick={() => router.push(job.href)}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition-colors hover:border-sky-500/40"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-[11px] text-sky-300">{job.number}</span>
                <h3 className="mt-1 text-sm font-semibold text-white">{job.subject}</h3>
                <p className="mt-1 text-[11px] text-slate-500">Son offline senkron: {formatDateTime(job.lastOfflineSyncAt)}</p>
              </div>
              <Badge variant={priorityVariant(job.priority)}>{job.priority}</Badge>
            </div>
            <div className="space-y-2">
              {job.steps.map((step) => (
                <div key={step.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400">{step.label}</span>
                  <Badge variant={statusVariant(step.status)}>{statusLabel(step.status)}</Badge>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <MapPinned className="h-4 w-4 text-sky-400" />
            Rota
          </h2>
          <DataTable
            columns={routeColumns}
            data={data?.route ?? []}
            keyExtractor={(row) => row.serviceRequestId}
            isLoading={isLoading}
            emptyTitle="Rota olusmadi"
            emptyDescription="Acik servis talebi veya adres bilgisi bulunmuyor."
          />
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardCheck className="h-4 w-4 text-emerald-400" />
            Mobil Servis Listesi
          </h2>
          <DataTable
            columns={jobColumns}
            data={data?.jobs ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            onRowClick={(row) => router.push(row.href)}
            emptyTitle="Aktif saha isi yok"
            emptyDescription="Acik, devam eden veya beklemede servis talebi bulunmuyor."
          />
        </section>
      </div>

      <Modal
        isOpen={activeCheckpoint !== null}
        onClose={() => setActiveCheckpoint(null)}
        title={activeCheckpoint ? checkpointTitle(activeCheckpoint.kind) : "Saha servis adimi"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setActiveCheckpoint(null)}>Iptal</Button>
            <Button size="sm" loading={checkpoint.isPending} onClick={submitCheckpoint}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Musteri adi"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Onay veren kisi"
          />
          <Textarea
            label="Not"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Servis formu, imza veya onay notu"
          />
        </div>
      </Modal>
    </div>
  );
}
