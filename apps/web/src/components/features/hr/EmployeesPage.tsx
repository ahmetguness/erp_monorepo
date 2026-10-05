"use client";

import { useState } from "react";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { EntityImage } from "@/components/shared/EntityImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormRow } from "@/components/shared/FormField";
import { ApiErrorState } from "@/components/shared/ApiErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useEmployees,
  useCreateEmployee,
  useDeleteEmployee,
  useDepartments,
  useUpdateEmployee,
} from "@/hooks/useHR";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { Employee } from "@/services/hr.service";

export function EmployeesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [isActive, setIsActive] = useState("");
  const [deleting, setDeleting] = useState<Employee | null>(null);
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

  const employeesQuery = useEmployees({
    page,
    limit: 20,
    search: search.trim() || undefined,
    department: department || undefined,
    isActive: isActive || undefined,
  });
  const { data, isLoading } = employeesQuery;
  const departments = useDepartments();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
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
          <EntityImage
            entityType="EMPLOYEE"
            entityId={r.id}
            fallback="none"
            className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 text-xs font-bold shrink-0"
            fallbackContent={
              <>
                {r.firstName.charAt(0)}
                {r.lastName.charAt(0)}
              </>
            }
          />
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
      width: "112px",
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
            aria-label={`${r.firstName} ${r.lastName} detayini ac`}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/dashboard/hr/employees/${r.id}`);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label={`${r.firstName} ${r.lastName} personelini duzenle`}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(r);
              setForm({ firstName: r.firstName, lastName: r.lastName, email: r.email ?? "", phone: r.phone ?? "", position: r.position ?? "", department: r.department ?? "", hireDate: r.hireDate.slice(0, 10), salary: String(r.salary) });
              setCreateOpen(true);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label={`${r.firstName} ${r.lastName} personelini sil`}
            onClick={(e) => {
              e.stopPropagation();
              setDeleting(r);
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
              setEditing(null);
              setCreateOpen(true);
              resetForm();
            }}
          >
            <Plus className="w-4 h-4" />
            Yeni Personel
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
        <Input
          aria-label="Personel ara"
          placeholder="Ad, soyad, e-posta veya pozisyon ara"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
        <select
          aria-label="Departman filtresi"
          className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
          value={department}
          onChange={(event) => { setDepartment(event.target.value); setPage(1); }}
        >
          <option value="">Tum departmanlar</option>
          {(departments.data ?? []).map((item) => item.name && <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}
        </select>
        <select
          aria-label="Durum filtresi"
          className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
          value={isActive}
          onChange={(event) => { setIsActive(event.target.value); setPage(1); }}
        >
          <option value="">Tum durumlar</option>
          <option value="true">Aktif</option>
          <option value="false">Pasif</option>
        </select>
      </div>

      {employeesQuery.isError ? (
        <ApiErrorState error={employeesQuery.error} onRetry={() => void employeesQuery.refetch()} />
      ) : <DataTable
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
      />}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Personeli Duzenle" : "Yeni Personel"}
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
              loading={create.isPending || update.isPending}
              disabled={
                !form.firstName.trim() ||
                !form.lastName.trim() ||
                !form.hireDate
              }
              onClick={() => {
                const values = {
                  firstName: form.firstName,
                  lastName: form.lastName,
                  email: form.email || undefined,
                  phone: form.phone || undefined,
                  position: form.position || undefined,
                  department: form.department || undefined,
                  salary: form.salary ? Number(form.salary) : undefined,
                };
                const options = { onSuccess: () => { setCreateOpen(false); setEditing(null); resetForm(); } };
                if (editing) update.mutate({ id: editing.id, data: values }, options);
                else create.mutate({ ...values, hireDate: form.hireDate }, options);
              }}
            >
              {editing ? "Kaydet" : "Oluştur"}
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
            <DatePicker
              label="İşe Giriş Tarihi"
              required
              value={form.hireDate}
              onValueChange={(value) =>
                setForm((p) => ({ ...p, hireDate: value ?? "" }))
              }
              clearable={false}
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

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Personeli sil"
        message={deleting ? `${deleting.firstName} ${deleting.lastName} pasiflestirilip listeden kaldirilacak.` : ""}
        confirmLabel="Sil"
        isLoading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}
