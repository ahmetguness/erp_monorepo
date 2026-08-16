"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Plus, RefreshCw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { SavedViewControls } from "@/components/shared/SavedViewControls";
import { ContactSelect, CustomerAssetSelect } from "@/components/shared/EntitySelect";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useServiceRequests, useCreateServiceRequest } from "@/hooks/useService";
import { formatDate } from "@/lib/utils";
import type { ServiceRequest } from "@/services/service.service";
import { getSavedViewFilterString, type SavedViewState } from "@/services/saved-view.service";

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  OPEN: { label: "Açık", variant: "info" },
  IN_PROGRESS: { label: "Devam ediyor", variant: "warning" },
  WAITING_PARTS: { label: "Parça bekliyor", variant: "neutral" },
  WAITING_CUSTOMER: { label: "Müşteri bekliyor", variant: "neutral" },
  COMPLETED: { label: "Tamamlandı", variant: "success" },
  CANCELLED: { label: "İptal", variant: "danger" },
};

const PRIORITY_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  LOW: { label: "Düşük", variant: "neutral" },
  MEDIUM: { label: "Orta", variant: "info" },
  HIGH: { label: "Yüksek", variant: "warning" },
  CRITICAL: { label: "Kritik", variant: "danger" },
};

const STATUS_FILTERS = ["", "OPEN", "IN_PROGRESS", "WAITING_PARTS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"];

function parseServiceStatus(value: string): string {
  return STATUS_MAP[value] ? value : "";
}

function parseServicePriority(value: string): string {
  return PRIORITY_MAP[value] ? value : "";
}

function statusLabel(value: string): string {
  return STATUS_MAP[value]?.label ?? value;
}

function priorityLabel(value: string): string {
  return PRIORITY_MAP[value]?.label ?? value;
}

function assetLabel(row: ServiceRequest): string {
  if (!row.customerAsset) return "-";
  return [row.customerAsset.name, row.customerAsset.serialNo].filter(Boolean).join(" / ");
}

export function ServiceRequestsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "MEDIUM", contactId: "", customerAssetId: "" });

  const { data, isLoading, isFetching, refetch } = useServiceRequests({
    page,
    limit: 20,
    ...(statusFilter && { status: statusFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
  });
  const create = useCreateServiceRequest();

  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const pageCounts = useMemo(() => ({
    total: data?.meta.total ?? rows.length,
    open: rows.filter((row) => row.status === "OPEN").length,
    waiting: rows.filter((row) => row.status === "WAITING_PARTS" || row.status === "WAITING_CUSTOMER").length,
    critical: rows.filter((row) => row.priority === "CRITICAL" || row.priority === "HIGH").length,
  }), [data?.meta.total, rows]);

  const viewState = useMemo<SavedViewState>(() => ({
    filters: { statusFilter, priorityFilter },
    pageSize: 20,
  }), [priorityFilter, statusFilter]);

  const applyView = (state: SavedViewState) => {
    setStatusFilter(parseServiceStatus(getSavedViewFilterString(state, "statusFilter")));
    setPriorityFilter(parseServicePriority(getSavedViewFilterString(state, "priorityFilter")));
    setPage(1);
  };

  const columns: ColumnDef<ServiceRequest>[] = [
    {
      key: "number",
      header: "Talep",
      width: "125px",
      render: (row) => (
        <div>
          <span className="font-mono text-sm font-semibold text-sky-300">{row.number}</span>
          <span className="mt-1 block text-[11px] text-slate-500">{formatDate(row.createdAt)}</span>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Konu / Müşteri",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{row.subject}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">{row.contact?.name ?? "Müşteri seçilmemiş"}</span>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Varlık",
      width: "190px",
      render: (row) => (
        <span className={row.customerAsset ? "block truncate text-xs text-slate-300" : "text-slate-600"}>
          {assetLabel(row)}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Öncelik",
      width: "105px",
      render: (row) => {
        const priority = PRIORITY_MAP[row.priority];
        return priority ? <Badge variant={priority.variant}>{priority.label}</Badge> : <span className="text-slate-400">{row.priority}</span>;
      },
    },
    {
      key: "status",
      header: "Durum",
      width: "145px",
      render: (row) => {
        const status = STATUS_MAP[row.status];
        return status ? <Badge variant={status.variant}>{status.label}</Badge> : <span className="text-slate-400">{row.status}</span>;
      },
    },
    {
      key: "activity",
      header: "Kapsam",
      width: "130px",
      align: "right",
      render: (row) => (
        <div className="text-right text-xs">
          <span className="text-slate-300">{row._count?.items ?? row.items?.length ?? 0} kalem</span>
          <span className="block text-slate-500">{row._count?.activities ?? row.activities?.length ?? 0} aktivite</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "52px",
      align: "right",
      render: (row) => (
        <button
          onClick={(event) => {
            event.stopPropagation();
            router.push(`/dashboard/service/requests/${row.id}`);
          }}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
          aria-label="Detay"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Servis talepleri"
        subtitle="Müşteri servis taleplerini, öncelikleri ve açık aksiyonları tek listede yönetin."
        className="mb-0"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Yenile
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
              Yeni talep
            </Button>
          </div>
        }
      />

      <SummaryStrip
        metrics={[
          { label: "Toplam Talep", value: pageCounts.total, tone: "text-slate-50" },
          { label: "Bu Sayfa Açık", value: pageCounts.open, tone: pageCounts.open > 0 ? "text-sky-200" : "text-slate-200" },
          { label: "Bekleyen", value: pageCounts.waiting, tone: pageCounts.waiting > 0 ? "text-amber-300" : "text-slate-200" },
          { label: "Yüksek Öncelik", value: pageCounts.critical, tone: pageCounts.critical > 0 ? "text-red-300" : "text-slate-200" },
        ]}
      />

      {pageCounts.critical > 0 && (
        <AttentionBar count={pageCounts.critical} />
      )}

      <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold text-white">Talep listesi</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                options={[
                  { value: "", label: "Tüm öncelikler" },
                  { value: "LOW", label: priorityLabel("LOW") },
                  { value: "MEDIUM", label: priorityLabel("MEDIUM") },
                  { value: "HIGH", label: priorityLabel("HIGH") },
                  { value: "CRITICAL", label: priorityLabel("CRITICAL") },
                ]}
                value={priorityFilter}
                onChange={(event) => {
                  setPriorityFilter(parseServicePriority(event.target.value));
                  setPage(1);
                }}
                className="h-9 w-44 py-1.5 text-xs"
              />
              <SavedViewControls module="service" listKey="service.requests" currentState={viewState} onApply={applyView} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/45 p-1">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status || "all"}
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === status ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                {status ? statusLabel(status) : "Tümü"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            density="compact"
            onRowClick={(row) => router.push(`/dashboard/service/requests/${row.id}`)}
            emptyTitle="Servis talebi bulunamadı"
            emptyDescription="Yeni bir servis talebi oluşturarak başlayın."
            pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
          />
        </div>
      </section>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni servis talebi"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.subject.trim()}
              onClick={() => create.mutate({
                subject: form.subject,
                description: form.description || undefined,
                priority: form.priority || undefined,
                contactId: form.contactId || undefined,
                customerAssetId: form.customerAssetId || undefined,
              }, {
                onSuccess: () => {
                  setCreateOpen(false);
                  setForm({ subject: "", description: "", priority: "MEDIUM", contactId: "", customerAssetId: "" });
                },
              })}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Konu" required placeholder="Ör. Ekran arızası" value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))} />
          <Textarea label="Açıklama" placeholder="Detaylı açıklama" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          <Select
            label="Öncelik"
            options={[
              { value: "LOW", label: "Düşük" },
              { value: "MEDIUM", label: "Orta" },
              { value: "HIGH", label: "Yüksek" },
              { value: "CRITICAL", label: "Kritik" },
            ]}
            value={form.priority}
            onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
          />
          <ContactSelect
            label="Müşteri"
            value={form.contactId}
            onChange={(value) => setForm((prev) => ({ ...prev, contactId: value, customerAssetId: "" }))}
          />
          <CustomerAssetSelect
            label="Varlık"
            value={form.customerAssetId}
            contactId={form.contactId || undefined}
            onChange={(value) => setForm((prev) => ({ ...prev, customerAssetId: value }))}
          />
        </div>
      </Modal>
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
            <span className={`${metric.tone} font-semibold tabular-nums`}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionBar({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Bu sayfada öncelikli takip isteyen <strong className="font-semibold">{count} yüksek/kritik talep</strong> var.
        </span>
      </div>
    </div>
  );
}
