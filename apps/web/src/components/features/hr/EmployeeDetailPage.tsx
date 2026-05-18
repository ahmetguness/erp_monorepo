"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Mail,
  Phone,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { EntityImageManager } from "@/components/shared/EntityImageManager";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useEmployee } from "@/hooks/useHR";
import { formatDate, formatCurrency } from "@/lib/utils";

const LEAVE_STATUS: Record<
  string,
  { label: string; variant: "neutral" | "success" | "warning" | "danger" }
> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  APPROVED: { label: "Onayli", variant: "success" },
  REJECTED: { label: "Reddedildi", variant: "danger" },
  CANCELLED: { label: "Iptal", variant: "neutral" },
};

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="truncate text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center text-xs text-slate-500">
      {title}
    </div>
  );
}

export function EmployeeDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: emp, isLoading } = useEmployee(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="py-20 text-center text-slate-400">
        Personel bulunamadi.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={[emp.position, emp.department].filter(Boolean).join(" - ")}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Geri
          </Button>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Personel</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-white">
                {emp.firstName} {emp.lastName}
              </h2>
            </div>
            <Badge variant={emp.isActive ? "success" : "neutral"}>
              {emp.isActive ? "Aktif" : "Pasif"}
            </Badge>
          </div>

          <EntityImageManager
            entityType="EMPLOYEE"
            entityId={id}
            label="Profil fotografi"
            description=""
            variant="avatar"
          />
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <InfoTile icon={<Mail className="h-3.5 w-3.5" />} label="E-posta" value={emp.email ?? "-"} />
          <InfoTile icon={<Phone className="h-3.5 w-3.5" />} label="Telefon" value={emp.phone ?? "-"} />
          <InfoTile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Ise Giris" value={formatDate(emp.hireDate)} />
          <InfoTile icon={<Wallet className="h-3.5 w-3.5" />} label="Maas" value={formatCurrency(emp.salary)} />
          <InfoTile icon={<BriefcaseBusiness className="h-3.5 w-3.5" />} label="Pozisyon" value={emp.position ?? "-"} />
          <InfoTile icon={<Building2 className="h-3.5 w-3.5" />} label="Departman" value={emp.department ?? "-"} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Izin Talepleri</h3>
            <Badge variant="neutral">{emp.leaveRequests?.length ?? 0}</Badge>
          </div>
          {emp.leaveRequests && emp.leaveRequests.length > 0 ? (
            <div className="space-y-3">
              {emp.leaveRequests.map((lr) => {
                const status = LEAVE_STATUS[lr.status];
                return (
                  <div key={lr.id} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-sm text-white">{lr.type}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {formatDate(lr.startDate)} - {formatDate(lr.endDate)} ({lr.days} gun)
                      </span>
                    </div>
                    {status && <Badge variant={status.variant}>{status.label}</Badge>}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyPanel title="Bu personel icin izin talebi yok." />
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Bordro Gecmisi</h3>
            <Badge variant="neutral">{emp.payrolls?.length ?? 0}</Badge>
          </div>
          {emp.payrolls && emp.payrolls.length > 0 ? (
            <div className="space-y-3">
              {emp.payrolls.map((payroll) => (
                <div key={payroll.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono text-sm text-sky-400">{payroll.period}</span>
                    <span className="block truncate text-xs text-slate-500">
                      Brut: {formatCurrency(payroll.grossSalary)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-medium text-white">
                      {formatCurrency(payroll.netSalary)}
                    </span>
                    {payroll.paidAt ? (
                      <Badge variant="success">Odendi</Badge>
                    ) : (
                      <Badge variant="warning">Bekliyor</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel title="Bu personel icin bordro kaydi yok." />
          )}
        </div>
      </section>

      <AttachmentPanel entityType="EMPLOYEE" entityId={id} />
    </div>
  );
}
