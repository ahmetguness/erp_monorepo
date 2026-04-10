"use client";

import { useState } from "react";
import { LogIn, LogOut, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormRow } from "@/components/shared/FormField";
import { useAttendance, useCheckIn, useCheckOut } from "@/hooks/useHR";
import { formatDate } from "@/lib/utils";
import type { Attendance } from "@/services/hr.service";

function formatTime(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AttendancePage() {
  const [page, setPage] = useState(1);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [form, setForm] = useState({ employeeId: "", notes: "" });
  const [outForm, setOutForm] = useState({ employeeId: "", overtimeHours: "" });

  const { data, isLoading } = useAttendance({
    page,
    limit: 50,
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });
  const doCheckIn = useCheckIn();
  const doCheckOut = useCheckOut();

  const columns: ColumnDef<Attendance>[] = [
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
      key: "date",
      header: "Tarih",
      width: "110px",
      render: (r) => (
        <span className="text-slate-300 text-sm">{formatDate(r.date)}</span>
      ),
    },
    {
      key: "checkIn",
      header: "Giriş",
      width: "90px",
      align: "center",
      render: (r) => (
        <span
          className={`text-sm ${r.checkIn ? "text-emerald-400" : "text-slate-600"}`}
        >
          {formatTime(r.checkIn)}
        </span>
      ),
    },
    {
      key: "checkOut",
      header: "Çıkış",
      width: "90px",
      align: "center",
      render: (r) => (
        <span
          className={`text-sm ${r.checkOut ? "text-sky-400" : "text-slate-600"}`}
        >
          {formatTime(r.checkOut)}
        </span>
      ),
    },
    {
      key: "overtime",
      header: "Mesai",
      width: "80px",
      align: "center",
      render: (r) =>
        Number(r.overtimeHours) > 0 ? (
          <span className="text-amber-400 text-sm font-medium">
            {r.overtimeHours}s
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
    {
      key: "notes",
      header: "Not",
      width: "150px",
      render: (r) => (
        <span className="text-slate-500 text-xs truncate">
          {r.notes ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Puantaj"
        subtitle="Personel giriş/çıkış ve mesai takibi."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCheckOutOpen(true)}
            >
              <LogOut className="w-4 h-4" />
              Çıkış
            </Button>
            <Button size="sm" onClick={() => setCheckInOpen(true)}>
              <LogIn className="w-4 h-4" />
              Giriş
            </Button>
          </div>
        }
      />

      <div className="flex items-end gap-3 mb-5">
        <FormRow cols={2} className="w-auto">
          <Input
            label="Başlangıç"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Bitiş"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </FormRow>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Puantaj kaydı bulunamadı"
        emptyDescription="Giriş/çıkış kaydı oluşturarak başlayın."
        pagination={
          data
            ? {
                page,
                pageSize: 50,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />

      {/* Check-in Modal */}
      <Modal
        isOpen={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        title="Giriş Kaydı"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCheckInOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={doCheckIn.isPending}
              disabled={!form.employeeId}
              onClick={() =>
                doCheckIn.mutate(
                  {
                    employeeId: form.employeeId,
                    notes: form.notes || undefined,
                  },
                  {
                    onSuccess: () => {
                      setCheckInOpen(false);
                      setForm({ employeeId: "", notes: "" });
                    },
                  },
                )
              }
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Personel ID"
            required
            value={form.employeeId}
            onChange={(e) =>
              setForm((p) => ({ ...p, employeeId: e.target.value }))
            }
          />
          <Input
            label="Not"
            placeholder="Opsiyonel"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Check-out Modal */}
      <Modal
        isOpen={checkOutOpen}
        onClose={() => setCheckOutOpen(false)}
        title="Çıkış Kaydı"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCheckOutOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={doCheckOut.isPending}
              disabled={!outForm.employeeId}
              onClick={() =>
                doCheckOut.mutate(
                  {
                    employeeId: outForm.employeeId,
                    overtimeHours: outForm.overtimeHours
                      ? Number(outForm.overtimeHours)
                      : undefined,
                  },
                  {
                    onSuccess: () => {
                      setCheckOutOpen(false);
                      setOutForm({ employeeId: "", overtimeHours: "" });
                    },
                  },
                )
              }
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Personel ID"
            required
            value={outForm.employeeId}
            onChange={(e) =>
              setOutForm((p) => ({ ...p, employeeId: e.target.value }))
            }
          />
          <Input
            label="Mesai Saati"
            type="number"
            placeholder="ör. 2"
            value={outForm.overtimeHours}
            onChange={(e) =>
              setOutForm((p) => ({ ...p, overtimeHours: e.target.value }))
            }
          />
        </div>
      </Modal>
    </div>
  );
}
