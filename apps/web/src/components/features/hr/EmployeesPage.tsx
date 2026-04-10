"use client";

import { useState } from "react";
import { Plus, UserCheck, Eye, Trash2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormRow } from "@/components/shared/FormField";
import {
  useEmployees,
  useCreateEmployee,
  useDeleteEmployee,
} from "@/hooks/useHR";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { Employee } from "@/services/hr.service";

export function EmployeesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    position: "",
    department: "",
    hireDate: "",
    salary: "",
  });

  const { data, isLoading } = useEmployees({ page, limit: 20 });
  const create = useCreateEmployee();
  const remove = useDeleteEmployee();

  const resetForm = () =>
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      position: "",
      department: "",
      hireDate: "",
      salary: "",
    });

  const columns: ColumnDef<Employee>[] = [
    {
      key: "name",
      header: "Personel",
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {r.firstName.charAt(0)}
            {r.lastName.charAt(0)}
          </div>
          <div>
            <span className="text-white font-medium text-sm">
              {r.firstName} {r.lastName}
            </span>
            {r.position && (
              <span className="block text-xs text-slate-500">{r.position}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "department",
      header: "Departman",
      width: "130px",
      render: (r) => (
        <span className="text-slate-300 text-sm">{r.department ?? "—"}</span>
      ),
    },
    {
      key: "email",
      header: "E-posta",
      width: "180px",
      render: (r) => (
        <span className="text-slate-400 text-xs">{r.email ?? "—"}</span>
      ),
    },
    {
      key: "hireDate",
      header: "İşe Giriş",
      width: "100px",
      render: (r) => (
        <span className="text-slate-400 text-xs">{formatDate(r.hireDate)}</span>
      ),
    },
    {
      key: "salary",
      header: "Maaş",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="text-white font-medium tabular-nums">
          {formatCurrency(r.salary)}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "80px",
      render: (r) =>
        r.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="neutral">Pasif</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/dashboard/hr/employees/${r.id}`);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              remove.mutate(r.id);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Personel"
        subtitle="Çalışan bilgilerini yönetin."
        action={
          <Button
            size="sm"
            onClick={() => {
              setCreateOpen(true);
              resetForm();
            }}
          >
            <Plus className="w-4 h-4" />
            Yeni Personel
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/hr/employees/${r.id}`)}
        emptyTitle="Personel bulunamadı"
        emptyDescription="Yeni bir personel ekleyerek başlayın."
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
        title="Yeni Personel"
        size="md"
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
                !form.firstName.trim() ||
                !form.lastName.trim() ||
                !form.hireDate
              }
              onClick={() =>
                create.mutate(
                  {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    email: form.email || undefined,
                    phone: form.phone || undefined,
                    position: form.position || undefined,
                    department: form.department || undefined,
                    hireDate: form.hireDate,
                    salary: form.salary ? Number(form.salary) : undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      resetForm();
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
          <FormRow cols={2}>
            <Input
              label="Ad"
              required
              value={form.firstName}
              onChange={(e) =>
                setForm((p) => ({ ...p, firstName: e.target.value }))
              }
            />
            <Input
              label="Soyad"
              required
              value={form.lastName}
              onChange={(e) =>
                setForm((p) => ({ ...p, lastName: e.target.value }))
              }
            />
          </FormRow>
          <FormRow cols={2}>
            <Input
              label="E-posta"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value }))
              }
            />
            <Input
              label="Telefon"
              value={form.phone}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value }))
              }
            />
          </FormRow>
          <FormRow cols={2}>
            <Input
              label="Pozisyon"
              placeholder="ör. Yazılım Geliştirici"
              value={form.position}
              onChange={(e) =>
                setForm((p) => ({ ...p, position: e.target.value }))
              }
            />
            <Input
              label="Departman"
              placeholder="ör. Bilgi Teknolojileri"
              value={form.department}
              onChange={(e) =>
                setForm((p) => ({ ...p, department: e.target.value }))
              }
            />
          </FormRow>
          <FormRow cols={2}>
            <Input
              label="İşe Giriş Tarihi"
              required
              type="date"
              value={form.hireDate}
              onChange={(e) =>
                setForm((p) => ({ ...p, hireDate: e.target.value }))
              }
            />
            <Input
              label="Maaş"
              type="number"
              placeholder="ör. 25000"
              value={form.salary}
              onChange={(e) =>
                setForm((p) => ({ ...p, salary: e.target.value }))
              }
            />
          </FormRow>
        </div>
      </Modal>
    </div>
  );
}
