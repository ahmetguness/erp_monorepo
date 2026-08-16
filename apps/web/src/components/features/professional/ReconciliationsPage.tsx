"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CheckCircle, ClipboardCheck, Lock, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useCreateReconciliation, useFinalizeReconciliation, useReconciliations } from "@/hooks/useReconciliation";
import { cn, formatDate } from "@/lib/utils";
import type { Reconciliation } from "@/services/reconciliation.service";

const STATUS_FILTERS = [
  { value: "", label: "Tümü" },
  { value: "false", label: "Açık" },
  { value: "true", label: "Tamamlanan" },
] as const;

export function ReconciliationsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ name: "", description: "", date: today });

  const { data, isFetching, isLoading, refetch } = useReconciliations({
    page,
    limit: 20,
    isFinalized: filter || undefined,
  });
  const createRec = useCreateReconciliation();
  const finalize = useFinalizeReconciliation();
  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const summary = useMemo(
    () => ({
      total: data?.meta.total ?? rows.length,
      open: rows.filter((row) => !row.isFinalized).length,
      finalized: rows.filter((row) => row.isFinalized).length,
      lines: rows.reduce((total, row) => total + (row._count?.lines ?? row.lines?.length ?? 0), 0),
    }),
    [data?.meta.total, rows],
  );

  const columns: ColumnDef<Reconciliation>[] = [
    {
      key: "name",
      header: "Mutabakat",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{row.name}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">{row.description ?? "Açıklama yok"}</span>
        </div>
      ),
    },
    {
      key: "date",
      header: "Tarih",
      width: "115px",
      render: (row) => <span className="text-xs text-slate-400">{formatDate(row.date)}</span>,
    },
    {
      key: "lines",
      header: "Satır",
      width: "80px",
      align: "right",
      render: (row) => <span className="tabular-nums text-slate-300">{row._count?.lines ?? row.lines?.length ?? 0}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "135px",
      render: (row) =>
        row.isFinalized ? (
          <Badge variant="success">
            <Lock className="mr-1 h-3 w-3" />
            Tamamlandı
          </Badge>
        ) : (
          <Badge variant="warning">Açık</Badge>
        ),
    },
    {
      key: "finalizedAt",
      header: "Tamamlanma",
      width: "125px",
      render: (row) => <span className="text-xs text-slate-500">{row.finalizedAt ? formatDate(row.finalizedAt) : "-"}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "120px",
      align: "right",
      render: (row) =>
        !row.isFinalized ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              finalize.mutate(row.id);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <CheckCircle className="h-3 w-3" />
            Tamamla
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mutabakat"
        subtitle="Hesap mutabakatlarını oluşturun, satır durumunu izleyin ve kapanış öncesi tamamlayın."
        className="mb-0"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Yenile
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
              Yeni mutabakat
            </Button>
          </div>
        }
      />

      <SummaryStrip
        metrics={[
          { label: "Toplam Mutabakat", value: summary.total, tone: "text-slate-50" },
          { label: "Açık", value: summary.open, tone: summary.open > 0 ? "text-amber-300" : "text-slate-200" },
          { label: "Tamamlanan", value: summary.finalized, tone: "text-emerald-300" },
          { label: "Satır", value: summary.lines, tone: "text-sky-200" },
        ]}
      />

      <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold text-white">Mutabakat listesi</h2>
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/45 p-1">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.value || "all"}
                  type="button"
                  onClick={() => {
                    setFilter(item.value);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === item.value ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            density="compact"
            emptyTitle="Mutabakat bulunamadı"
            emptyDescription="Yeni bir mutabakat oluşturarak başlayın."
            pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
          />
        </div>
      </section>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni mutabakat"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              İptal
            </Button>
            <Button
              size="sm"
              loading={createRec.isPending}
              disabled={!form.name.trim()}
              onClick={() => {
                createRec.mutate(
                  { name: form.name, description: form.description || undefined, date: form.date },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setForm({ name: "", description: "", date: today });
                    },
                  },
                );
              }}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Mutabakat adı" required value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <Input label="Açıklama" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          <DatePicker label="Tarih" required value={form.date} onValueChange={(value) => setForm((prev) => ({ ...prev, date: value ?? "" }))} clearable={false} />
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
            <span className={cn("font-semibold tabular-nums", metric.tone)}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
