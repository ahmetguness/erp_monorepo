"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Camera, CheckCircle2, ClipboardCheck, CloudOff, MapPinned, RefreshCw, Route, Signature, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateFieldServiceCheckpoint, useFieldServiceMobileFlow } from "@/hooks/useService";
import { cn } from "@/lib/utils";
import type {
  FieldServiceCheckpointKind,
  FieldServiceJobRow,
  FieldServiceRouteStop,
  FieldServiceStep,
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

function priorityLabel(priority: FieldServiceJobRow["priority"]): string {
  if (priority === "CRITICAL") return "Kritik";
  if (priority === "HIGH") return "Yüksek";
  if (priority === "LOW") return "Düşük";
  return "Orta";
}

function routeAddress(stop: FieldServiceRouteStop): string {
  return [stop.address, stop.city].filter(Boolean).join(" / ") || "Adres bekleniyor";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function checkpointTitle(kind: FieldServiceCheckpointKind): string {
  if (kind === "CUSTOMER_APPROVAL") return "Müşteri onayı";
  if (kind === "SERVICE_FORM") return "Servis formu";
  return "Ziyaret notu";
}

function completedStepCount(job: FieldServiceJobRow): number {
  return job.steps.filter((step) => step.status === "complete").length;
}

function progressPct(job: FieldServiceJobRow): number {
  if (job.steps.length === 0) return 0;
  return Math.round((completedStepCount(job) / job.steps.length) * 100);
}

export function FieldServiceMobileFlowPage() {
  const router = useRouter();
  const { data, isLoading, isFetching, refetch } = useFieldServiceMobileFlow();
  const checkpoint = useCreateFieldServiceCheckpoint();
  const [activeCheckpoint, setActiveCheckpoint] = useState<CheckpointState | null>(null);
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");

  const routeRows = useMemo(() => [...(data?.route ?? [])].sort((a, b) => a.sequence - b.sequence), [data?.route]);
  const jobRows = useMemo(
    () => [...(data?.jobs ?? [])].sort((a, b) => Number(b.pendingSyncCount > 0) - Number(a.pendingSyncCount > 0) || progressPct(a) - progressPct(b)),
    [data?.jobs],
  );
  const nextJobs = jobRows.slice(0, 6);

  const routeColumns: ColumnDef<FieldServiceRouteStop>[] = [
    {
      key: "sequence",
      header: "Sıra",
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
      width: "140px",
      render: (row) => <span className="text-slate-300">{row.contactPhone ?? "-"}</span>,
    },
    {
      key: "request",
      header: "Talep",
      width: "115px",
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
          <span className="block text-[11px] text-slate-500">{row.contact?.name ?? row.asset?.name ?? "Cari/varlık yok"}</span>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Öncelik",
      width: "100px",
      render: (row) => <Badge variant={priorityVariant(row.priority)}>{priorityLabel(row.priority)}</Badge>,
    },
    {
      key: "steps",
      header: "Akış",
      width: "140px",
      align: "center",
      render: (row) => <ProgressMini value={progressPct(row)} label={`${completedStepCount(row)}/${row.steps.length}`} />,
    },
    {
      key: "media",
      header: "Medya",
      width: "125px",
      render: (row) => <span className="text-slate-300">{row.photoCount} foto / {row.signatureCount} imza</span>,
    },
    {
      key: "offline",
      header: "Offline",
      width: "120px",
      render: (row) => (
        <div>
          <Badge variant={row.offlineReady ? "success" : "warning"}>{row.offlineReady ? "Hazır" : "Eksik"}</Badge>
          {row.pendingSyncCount > 0 && <span className="mt-1 block text-[11px] text-amber-300">{row.pendingSyncCount} kuyruk</span>}
        </div>
      ),
    },
    {
      key: "approval",
      header: "Onay",
      width: "105px",
      render: (row) => <Badge variant={row.customerApproved ? "success" : "warning"}>{row.customerApproved ? "Alındı" : "Bekliyor"}</Badge>,
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
    <div className="space-y-5">
      <PageHeader
        title="Saha servis mobil akışı"
        subtitle="Teknisyen rotası, mobil form, fotoğraf, imza, müşteri onayı ve offline senkron takibi."
        className="mb-0"
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Yenile
          </Button>
        }
      />

      {isLoading && !data ? (
        <LoadingState />
      ) : (
        <>
          <SummaryStrip
            metrics={[
              { label: "Aktif Servis", value: summary?.totalJobs ?? 0, tone: "text-slate-50" },
              { label: "Atanan İş", value: summary?.assignedJobCount ?? 0, tone: "text-sky-200" },
              { label: "Rota Hazır", value: summary?.routeReadyCount ?? 0, tone: "text-emerald-300" },
              { label: "Foto / İmza", value: `${summary?.photoReadyCount ?? 0}/${summary?.signatureReadyCount ?? 0}`, tone: "text-amber-300" },
              { label: "Müşteri Onayı", value: summary?.customerApprovedCount ?? 0, tone: "text-violet-300" },
              { label: "Senkron Kuyruğu", value: summary?.pendingSyncCount ?? 0, tone: (summary?.pendingSyncCount ?? 0) > 0 ? "text-amber-300" : "text-slate-200" },
            ]}
          />

          {(summary?.pendingSyncCount ?? 0) > 0 && (
            <AttentionBar pendingSync={summary?.pendingSyncCount ?? 0} offlineReady={summary?.offlineReadyCount ?? 0} />
          )}

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel title="Günün rota sırası" subtitle="Duraklar ziyaret sırasına göre listelenir." icon={<MapPinned className="h-4 w-4 text-sky-300" />}>
              <DataTable
                columns={routeColumns}
                data={routeRows}
                keyExtractor={(row) => row.serviceRequestId}
                isLoading={isLoading}
                emptyTitle="Rota oluşmadı"
                emptyDescription="Açık servis talebi veya adres bilgisi bulunmuyor."
              />
            </Panel>

            <Panel title="Öne çıkan saha işleri" subtitle="Senkron bekleyen ve akışı eksik servisler önce gösterilir." icon={<Route className="h-4 w-4 text-emerald-300" />}>
              {nextJobs.length === 0 ? (
                <EmptyText text="Aktif saha işi yok." />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {nextJobs.map((job) => <JobCard key={job.id} job={job} onOpen={() => router.push(job.href)} />)}
                </div>
              )}
            </Panel>
          </section>

          <Panel title="Mobil servis listesi" subtitle="Form, onay, medya ve offline durumları tek tabloda takip edilir." icon={<ClipboardCheck className="h-4 w-4 text-emerald-300" />}>
            <DataTable
              columns={jobColumns}
              data={jobRows}
              keyExtractor={(row) => row.id}
              isLoading={isLoading}
              onRowClick={(row) => router.push(row.href)}
              emptyTitle="Aktif saha işi yok"
              emptyDescription="Açık, devam eden veya beklemede servis talebi bulunmuyor."
            />
          </Panel>
        </>
      )}

      <Modal
        isOpen={activeCheckpoint !== null}
        onClose={() => setActiveCheckpoint(null)}
        title={activeCheckpoint ? checkpointTitle(activeCheckpoint.kind) : "Saha servis adımı"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setActiveCheckpoint(null)}>İptal</Button>
            <Button size="sm" loading={checkpoint.isPending} onClick={submitCheckpoint}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Müşteri adı"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Onay veren kişi"
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

function JobCard({ job, onOpen }: { job: FieldServiceJobRow; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-left transition-colors hover:border-sky-500/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[11px] text-sky-300">{job.number}</span>
          <h3 className="mt-1 truncate text-sm font-semibold text-white">{job.subject}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{job.contact?.name ?? job.asset?.name ?? "Cari/varlık yok"}</p>
        </div>
        <Badge variant={priorityVariant(job.priority)}>{priorityLabel(job.priority)}</Badge>
      </div>

      <div className="mt-3">
        <ProgressMini value={progressPct(job)} label={`${completedStepCount(job)}/${job.steps.length}`} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <JobSignal icon={<Camera className="h-3.5 w-3.5" />} label="Foto" value={job.photoCount} />
        <JobSignal icon={<Signature className="h-3.5 w-3.5" />} label="İmza" value={job.signatureCount} />
        <JobSignal icon={<CloudOff className="h-3.5 w-3.5" />} label="Kuyruk" value={job.pendingSyncCount} />
      </div>

      <div className="mt-3 space-y-1.5">
        {job.steps.slice(0, 4).map((step) => <StepLine key={step.key} step={step} />)}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Son offline senkron: {formatDateTime(job.lastOfflineSyncAt)}</p>
    </button>
  );
}

function StepLine({ step }: { step: FieldServiceStep }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-slate-400">{step.label}</span>
      <Badge variant={statusVariant(step.status)}>{statusLabel(step.status)}</Badge>
    </div>
  );
}

function JobSignal({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/55 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-0.5 font-semibold tabular-nums text-slate-200">{value}</p>
    </div>
  );
}

function ProgressMini({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-[96px]">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>İlerleme</span>
        <span className="font-mono text-slate-300">{label}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800/80" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4">
            <div className="h-5 w-40 animate-pulse rounded bg-slate-800/80" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded bg-slate-800/60" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryStrip({ metrics }: { metrics: Array<{ label: string; value: ReactNode; tone: string }> }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="flex items-center gap-x-4">
            {index > 0 && <span className="h-4 w-px bg-slate-800" />}
            <span className={cn("font-semibold tabular-nums", metric.tone)}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionBar({ pendingSync, offlineReady }: { pendingSync: number; offlineReady: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Mobil akışta senkron bekleyen kayıtlar var:
          <strong className="ml-1 font-semibold">{pendingSync} kuyruk</strong>
          <strong className="ml-1 font-semibold">{offlineReady} offline hazır iş</strong>.
        </span>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
      <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-lg border border-slate-800 bg-slate-950/35 p-4 text-sm text-slate-500">{text}</p>;
}
