"use client";

import { useState } from "react";
import { Plus, CheckCircle, XCircle, Ban } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { EmployeeSelect } from "@/components/shared/EntitySelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { FormRow } from "@/components/shared/FormField";
import {
  useLeaveRequests,
  useCreateLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useCancelLeaveRequest,
} from "@/hooks/useHR";
import { formatDate } from "@/lib/utils";
import type { LeaveRequest } from "@/services/hr.service";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "neutral" | "success" | "warning" | "danger" | "info";
  }
> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  APPROVED: { label: "Onaylı", variant: "success" },
  REJECTED: { label: "Reddedildi", variant: "danger" },
  CANCELLED: { label: "İptal", variant: "neutral" },
};

const TYPE_MAP: Record<string, string> = {
  ANNUAL: "Yıllık İzin",
  SICK: "Hastalık",
  MATERNITY: "Doğum",
  PATERNITY: "Babalık",
  UNPAID: "Ücretsiz",
  OTHER: "Diğer",
};

export function LeaveRequestsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    type: "ANNUAL",
    startDate: "",
    endDate: "",
    days: "",
    notes: "",
  });

  const { data, isLoading } = useLeaveRequests({
    page,
    limit: 20,
    ...(statusFilter && { status: statusFilter }),
  });
  const create = useCreateLeaveRequest();
  const approve = useApproveLeaveRequest();
  const reject = useRejectLeaveRequest();
  const cancel = useCancelLeaveRequest();

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      key: "employee",
      header: "Personel",
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">
            {r.employee?.firstName} {r.employee?.lastName}
          </span>
          {r.employee?.department && (
            <span className="block text-xs text-slate-500">
              {r.employee.department}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "type",
      header: "Tür",
      width: "120px",
      render: (r) => (
        <span className="text-slate-300 text-sm">
          {TYPE_MAP[r.type] ?? r.type}
        </span>
      ),
    },
    {
      key: "dates",
      header: "Tarih",
      width: "180px",
      render: (r) => (
        <span className="text-slate-400 text-xs">
          {formatDate(r.startDate)} — {formatDate(r.endDate)}
        </span>
      ),
    },
    {
      key: "days",
      header: "Gün",
      width: "60px",
      align: "center",
      render: (r) => <span className="text-white font-medium">{r.days}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "110px",
      render: (r) => {
        const s = STATUS_MAP[r.status];
        return s ? (
          <Badge variant={s.variant}>{s.label}</Badge>
        ) : (
          <span>{r.status}</span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: "150px",
      align: "right",
      render: (r) =>
        r.status === "PENDING" ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                approve.mutate(r.id);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <CheckCircle className="w-3 h-3" />
              Onayla
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                reject.mutate(r.id);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              Reddet
            </button>
          </div>
        ) : r.status === "APPROVED" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              cancel.mutate(r.id);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:bg-slate-800 transition-colors"
          >
            <Ban className="w-3 h-3" />
            İptal
          </button>
        ) : null,
    },
  ];

  const statuses = ["", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

  return (
    <div>
      <PageHeader
        title="İzin Talepleri"
        subtitle="Personel izin taleplerini yönetin."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Yeni Talep
          </Button>
        }
      />

      <div className="flex items-center gap-1 mb-5 bg-slate-900/50 border border-slate-800/60 rounded-xl p-1 w-fit">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            {s ? (STATUS_MAP[s]?.label ?? s) : "Tümü"}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="İzin talebi bulunamadı"
        emptyDescription="Yeni bir izin talebi oluşturarak başlayın."
        pagination={
          data
            ? {
                page,
                pageSize: 20,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni İzin Talebi"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={
                !form.employeeId ||
                !form.startDate ||
                !form.endDate ||
                !form.days
              }
              onClick={() =>
                create.mutate(
                  {
                    employeeId: form.employeeId,
                    type: form.type,
                    startDate: form.startDate,
                    endDate: form.endDate,
                    days: Number(form.days),
                    notes: form.notes || undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setForm({
                        employeeId: "",
                        type: "ANNUAL",
                        startDate: "",
                        endDate: "",
                        days: "",
                        notes: "",
                      });
                    },
                  },
                )
              }
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <EmployeeSelect
            label="Personel"
            required
            value={form.employeeId}
            onChange={(value) => setForm((p) => ({ ...p, employeeId: value }))}
          />
          <Select
            label="İzin Türü"
            required
            options={Object.entries(TYPE_MAP).map(([k, v]) => ({
              value: k,
              label: v,
            }))}
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
          />
          <FormRow cols={2}>
            <DatePicker
              label="Başlangıç"
              required
              value={form.startDate}
              onValueChange={(value) =>
                setForm((p) => ({ ...p, startDate: value ?? "" }))
              }
              clearable={false}
            />
            <DatePicker
              label="Bitiş"
              required
              value={form.endDate}
              onValueChange={(value) =>
                setForm((p) => ({ ...p, endDate: value ?? "" }))
              }
              clearable={false}
            />
          </FormRow>
          <Input
            label="Gün Sayısı"
            required
            type="number"
            value={form.days}
            onChange={(e) => setForm((p) => ({ ...p, days: e.target.value }))}
          />
          <Input
            label="Not"
            placeholder="Opsiyonel"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
