"use client";

import { Award, BookOpenCheck, Boxes, GitBranch, RefreshCw, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAdvancedHr } from "@/hooks/useHR";
import type {
  HrAssetAssignmentRow,
  HrAssetStatus,
  HrReviewStatus,
  HrTrainingStatus,
  OrganizationNode,
  PerformanceReviewRow,
  TrainingMatrixRow,
} from "@/services/hr.service";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function reviewVariant(status: HrReviewStatus): BadgeVariant {
  if (status === "missing") return "danger";
  if (status === "scheduled") return "warning";
  return "success";
}

function reviewLabel(status: HrReviewStatus): string {
  if (status === "missing") return "Eksik";
  if (status === "scheduled") return "Planli";
  return "Hazir";
}

function trainingVariant(status: HrTrainingStatus): BadgeVariant {
  if (status === "complete") return "success";
  if (status === "planned") return "warning";
  return "danger";
}

function trainingLabel(status: HrTrainingStatus): string {
  if (status === "complete") return "Tamam";
  if (status === "planned") return "Planli";
  return "Eksik";
}

function assetVariant(status: HrAssetStatus): BadgeVariant {
  return status === "assigned" ? "success" : "warning";
}

function assetLabel(status: HrAssetStatus): string {
  return status === "assigned" ? "Zimmetli" : "Eksik";
}

function nodeVariant(type: OrganizationNode["type"]): BadgeVariant {
  if (type === "department") return "purple";
  if (type === "position") return "info";
  return "neutral";
}

function employeeSubtitle(employee: { department: string | null; position: string | null }): string {
  return [employee.department, employee.position].filter(Boolean).join(" / ") || "-";
}

export function AdvancedHrPage() {
  const { data, isLoading, isFetching, refetch } = useAdvancedHr();

  const reviewColumns: ColumnDef<PerformanceReviewRow>[] = [
    {
      key: "employee",
      header: "Personel",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.employee.fullName}</span>
          <span className="block text-[11px] text-slate-500">{employeeSubtitle(row.employee)}</span>
        </div>
      ),
    },
    {
      key: "last",
      header: "Son Degerlendirme",
      width: "150px",
      render: (row) => <span className="text-slate-400">{formatDate(row.lastReviewAt)}</span>,
    },
    {
      key: "next",
      header: "Sonraki",
      width: "120px",
      render: (row) => <span className="text-slate-300">{formatDate(row.nextReviewAt)}</span>,
    },
    {
      key: "actions",
      header: "Aksiyon",
      width: "90px",
      align: "right",
      render: (row) => <span className="font-mono text-sky-300">{row.openActionCount}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "105px",
      render: (row) => <Badge variant={reviewVariant(row.status)}>{reviewLabel(row.status)}</Badge>,
    },
  ];

  const trainingColumns: ColumnDef<TrainingMatrixRow>[] = [
    {
      key: "employee",
      header: "Personel",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.employee.fullName}</span>
          <span className="block text-[11px] text-slate-500">{employeeSubtitle(row.employee)}</span>
        </div>
      ),
    },
    {
      key: "completed",
      header: "Tamamlanan",
      width: "110px",
      align: "right",
      render: (row) => <span className="font-mono text-emerald-300">{row.completedCount}</span>,
    },
    {
      key: "planned",
      header: "Planli",
      width: "90px",
      align: "right",
      render: (row) => <span className="font-mono text-amber-300">{row.plannedCount}</span>,
    },
    {
      key: "missing",
      header: "Eksikler",
      render: (row) => <span className="text-xs text-slate-400">{row.missingTopics.join(", ") || "-"}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "105px",
      render: (row) => <Badge variant={trainingVariant(row.status)}>{trainingLabel(row.status)}</Badge>,
    },
  ];

  const assetColumns: ColumnDef<HrAssetAssignmentRow>[] = [
    {
      key: "employee",
      header: "Personel",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.employee.fullName}</span>
          <span className="block text-[11px] text-slate-500">{employeeSubtitle(row.employee)}</span>
        </div>
      ),
    },
    {
      key: "assetCount",
      header: "Zimmet",
      width: "90px",
      align: "right",
      render: (row) => <span className="font-mono text-sky-300">{row.assetCount}</span>,
    },
    {
      key: "documents",
      header: "Dokuman",
      width: "100px",
      align: "right",
      render: (row) => <span className="text-slate-300">{row.documentCount}</span>,
    },
    {
      key: "last",
      header: "Son Zimmet",
      width: "120px",
      render: (row) => <span className="text-slate-400">{formatDate(row.lastAssignedAt)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "105px",
      render: (row) => <Badge variant={assetVariant(row.status)}>{assetLabel(row.status)}</Badge>,
    },
  ];

  const organizationColumns: ColumnDef<OrganizationNode>[] = [
    {
      key: "label",
      header: "Organizasyon",
      render: (row) => (
        <div className={row.type === "employee" ? "pl-8" : row.type === "position" ? "pl-4" : ""}>
          <span className="text-sm font-semibold text-white">{row.label}</span>
          <span className="block text-[11px] text-slate-500">{row.parentId ?? "Kok"}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tip",
      width: "120px",
      render: (row) => <Badge variant={nodeVariant(row.type)}>{row.type}</Badge>,
    },
    {
      key: "count",
      header: "Kisi",
      width: "80px",
      align: "right",
      render: (row) => <span className="font-mono text-sky-300">{row.employeeCount}</span>,
    },
  ];

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Gelismis IK"
        subtitle="Performans degerlendirme, egitim matrisi, zimmet ve organizasyon semasi."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Users className="mb-2 h-4 w-4 text-sky-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Personel</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.employeeCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Award className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Performans Eksik</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.reviewMissingCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <BookOpenCheck className="mb-2 h-4 w-4 text-emerald-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Egitim Eksik</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.trainingMissingCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Boxes className="mb-2 h-4 w-4 text-violet-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Zimmet Eksik</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.assetMissingCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <GitBranch className="mb-2 h-4 w-4 text-cyan-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Org Dugumu</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.organizationNodeCount ?? 0}</span>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Performans Degerlendirme</h2>
          <DataTable columns={reviewColumns} data={data?.performanceReviews ?? []} keyExtractor={(row) => row.employee.id} isLoading={isLoading}
            emptyTitle="Personel bulunamadi" emptyDescription="Performans degerlendirme icin aktif personel kaydi gerekir." />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Egitim Matrisi</h2>
          <DataTable columns={trainingColumns} data={data?.trainingMatrix ?? []} keyExtractor={(row) => row.employee.id} isLoading={isLoading}
            emptyTitle="Egitim matrisi bos" emptyDescription="Aktif personel veya egitim dokumani bulunmuyor." />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Zimmet Takibi</h2>
          <DataTable columns={assetColumns} data={data?.assetAssignments ?? []} keyExtractor={(row) => row.employee.id} isLoading={isLoading}
            emptyTitle="Zimmet kaydi yok" emptyDescription="Personel dokumanlarina asset-assignment tagli zimmet ekleyin." />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Organizasyon Semasi</h2>
          <DataTable columns={organizationColumns} data={data?.organization ?? []} keyExtractor={(row) => row.id} isLoading={isLoading}
            emptyTitle="Organizasyon semasi yok" emptyDescription="Departman ve pozisyon bilgisi olan personel ekleyin." />
        </section>
      </div>
    </div>
  );
}
