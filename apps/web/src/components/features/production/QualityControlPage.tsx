"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useQualityControl } from "@/hooks/useProduction";
import type {
  QualityActionPriority,
  QualityActionStatus,
  QualityCorrectiveActionRow,
  QualityFormRow,
  QualityFormStatus,
  QualityIssueSeverity,
  QualityIssueType,
  QualityNonconformityRow,
} from "@/services/production.service";

function formatQty(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(value);
}

function formatPct(value: number): string {
  return `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formStatusVariant(status: QualityFormStatus): BadgeVariant {
  if (status === "ready") return "success";
  if (status === "needs_review") return "warning";
  return "danger";
}

function formStatusLabel(status: QualityFormStatus): string {
  if (status === "ready") return "Hazir";
  if (status === "needs_review") return "Kontrol";
  return "Bloke";
}

function severityVariant(severity: QualityIssueSeverity): BadgeVariant {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "low") return "info";
  return "purple";
}

function severityLabel(severity: QualityIssueSeverity): string {
  if (severity === "critical") return "Kritik";
  if (severity === "high") return "Yuksek";
  if (severity === "low") return "Dusuk";
  return "Orta";
}

function issueTypeLabel(type: QualityIssueType): string {
  if (type === "scrap") return "Fire";
  if (type === "under_production") return "Eksik uretim";
  if (type === "material_shortage") return "Girdi eksigi";
  return "Durdurma";
}

function actionStatusVariant(status: QualityActionStatus): BadgeVariant {
  if (status === "done") return "success";
  if (status === "in_progress") return "warning";
  if (status === "suggested") return "purple";
  return "info";
}

function actionStatusLabel(status: QualityActionStatus): string {
  if (status === "done") return "Tamam";
  if (status === "in_progress") return "Devam";
  if (status === "suggested") return "Oneri";
  return "Acik";
}

function priorityVariant(priority: QualityActionPriority): BadgeVariant {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "info";
}

function priorityLabel(priority: QualityActionPriority): string {
  if (priority === "critical") return "Kritik";
  if (priority === "high") return "Yuksek";
  if (priority === "low") return "Dusuk";
  return "Orta";
}

function checklistSummary(row: QualityFormRow): string {
  const passed = row.checklist.filter((item) => item.passed).length;
  return `${passed}/${row.checklist.length}`;
}

export function QualityControlPage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isFetching, refetch } = useQualityControl({ horizonDays });

  const blockedForms = useMemo(
    () => [...(data?.inputForms ?? []), ...(data?.outputForms ?? [])].filter((row) => row.status === "blocked"),
    [data?.inputForms, data?.outputForms],
  );

  const formColumns: ColumnDef<QualityFormRow>[] = [
    {
      key: "workOrder",
      header: "Is Emri",
      width: "130px",
      render: (row) => <span className="font-mono text-sky-300">{row.workOrderNumber}</span>,
    },
    {
      key: "product",
      header: "Urun",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.product.name}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.product.code}</span>
        </div>
      ),
    },
    {
      key: "progress",
      header: "Miktar",
      width: "150px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatQty(row.producedQty)} / {formatQty(row.plannedQty)}</span>,
    },
    {
      key: "completion",
      header: "Tamam",
      width: "100px",
      align: "right",
      render: (row) => <span className="font-semibold text-white">{formatPct(row.completionPct)}</span>,
    },
    {
      key: "checks",
      header: "Kontrol",
      width: "110px",
      align: "center",
      render: (row) => <span className="font-mono text-emerald-300">{checklistSummary(row)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "105px",
      render: (row) => <Badge variant={formStatusVariant(row.status)}>{formStatusLabel(row.status)}</Badge>,
    },
  ];

  const issueColumns: ColumnDef<QualityNonconformityRow>[] = [
    {
      key: "issue",
      header: "Uygunsuzluk",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.title}</span>
          <span className="block text-[11px] text-slate-500">{row.detail}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tip",
      width: "130px",
      render: (row) => <Badge variant="neutral">{issueTypeLabel(row.type)}</Badge>,
    },
    {
      key: "workOrder",
      header: "Is Emri",
      width: "120px",
      render: (row) => <span className="font-mono text-sky-300">{row.workOrderNumber}</span>,
    },
    {
      key: "impact",
      header: "Etki",
      width: "95px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatQty(row.quantityImpact)}</span>,
    },
    {
      key: "detected",
      header: "Tarih",
      width: "100px",
      render: (row) => <span className="text-slate-400">{formatDate(row.detectedAt)}</span>,
    },
    {
      key: "severity",
      header: "Seviye",
      width: "95px",
      render: (row) => <Badge variant={severityVariant(row.severity)}>{severityLabel(row.severity)}</Badge>,
    },
  ];

  const actionColumns: ColumnDef<QualityCorrectiveActionRow>[] = [
    {
      key: "action",
      header: "Duzeltici Faaliyet",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.title}</span>
          {row.detail && <span className="block text-[11px] text-slate-500">{row.detail}</span>}
        </div>
      ),
    },
    {
      key: "workOrder",
      header: "Is Emri",
      width: "120px",
      render: (row) => <span className="font-mono text-sky-300">{row.workOrderNumber}</span>,
    },
    {
      key: "priority",
      header: "Oncelik",
      width: "95px",
      render: (row) => <Badge variant={priorityVariant(row.priority)}>{priorityLabel(row.priority)}</Badge>,
    },
    {
      key: "dueAt",
      header: "Termin",
      width: "95px",
      render: (row) => <span className="text-slate-400">{formatDate(row.dueAt)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "95px",
      render: (row) => <Badge variant={actionStatusVariant(row.status)}>{actionStatusLabel(row.status)}</Badge>,
    },
  ];

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Kalite Kontrol"
        subtitle="Uretim girdi/cikti kalite formlari, uygunsuzluk kayitlari ve duzeltici faaliyet takibi."
        action={
          <>
            <Select
              value={String(horizonDays)}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              options={[
                { value: "14", label: "14 gun" },
                { value: "30", label: "30 gun" },
                { value: "60", label: "60 gun" },
                { value: "90", label: "90 gun" },
              ]}
              className="h-9 py-1.5 text-xs"
            />
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <ClipboardCheck className="mb-2 h-4 w-4 text-sky-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Girdi Formu</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.inputFormCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cikti Formu</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.outputFormCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <AlertTriangle className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Uygunsuzluk</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.nonconformityCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <ShieldCheck className="mb-2 h-4 w-4 text-violet-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Faaliyet</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.correctiveActionCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.blockedFormCount ?? blockedForms.length} bloke form</span>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Girdi Kalite Formlari</h2>
          <DataTable
            columns={formColumns}
            data={data?.inputForms ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Girdi formu yok"
            emptyDescription="Secili pencerede girdi kalite kontrolu bekleyen is emri bulunmuyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Cikti Kalite Formlari</h2>
          <DataTable
            columns={formColumns}
            data={data?.outputForms ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Cikti formu yok"
            emptyDescription="Secili pencerede cikti kalite kontrolu bekleyen is emri bulunmuyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Uygunsuzluk Kayitlari</h2>
          <DataTable
            columns={issueColumns}
            data={data?.nonconformities ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Uygunsuzluk yok"
            emptyDescription="Fire, eksik uretim veya durdurma kaynakli acik kalite riski gorunmuyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Duzeltici Faaliyet Takibi</h2>
          <DataTable
            columns={actionColumns}
            data={data?.correctiveActions ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Faaliyet yok"
            emptyDescription="Uygunsuzluklara bagli acik veya onerilen duzeltici faaliyet bulunmuyor."
          />
        </section>
      </div>
    </div>
  );
}
