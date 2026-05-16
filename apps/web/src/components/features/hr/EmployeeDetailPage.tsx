"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { EntityImage } from "@/components/shared/EntityImage";
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
  APPROVED: { label: "Onaylı", variant: "success" },
  REJECTED: { label: "Reddedildi", variant: "danger" },
  CANCELLED: { label: "İptal", variant: "neutral" },
};

export function EmployeeDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: emp, isLoading } = useEmployee(id);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!emp)
    return (
      <div className="text-center py-20 text-slate-400">
        Personel bulunamadı.
      </div>
    );

  return (
    <div>
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={[emp.position, emp.department].filter(Boolean).join(" — ")}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-4">
          <EntityImage entityType="EMPLOYEE" entityId={id} className="w-20 h-20 rounded-xl shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Profil fotoğrafı</h2>
            <p className="text-xs text-slate-500 mt-1">Personel kartları ve detay ekranlarında kullanılacak görsel.</p>
          </div>
        </div>
        <div className="mt-4">
          <EntityImageManager
            entityType="EMPLOYEE"
            entityId={id}
            label="Profil fotoğrafı"
            description="Personel için tek ana görsel yükleyin, güncelleyin veya kaldırın."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "E-posta", value: emp.email ?? "—" },
          { label: "Telefon", value: emp.phone ?? "—" },
          { label: "İşe Giriş", value: formatDate(emp.hireDate) },
          { label: "Maaş", value: formatCurrency(emp.salary) },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3"
          >
            <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
            <div className="text-sm text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Requests */}
        {emp.leaveRequests && emp.leaveRequests.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">
              İzin Talepleri
            </h3>
            <div className="space-y-3">
              {emp.leaveRequests.map((lr) => {
                const ls = LEAVE_STATUS[lr.status];
                return (
                  <div
                    key={lr.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm text-white">{lr.type}</span>
                      <span className="block text-xs text-slate-500">
                        {formatDate(lr.startDate)} — {formatDate(lr.endDate)} (
                        {lr.days} gün)
                      </span>
                    </div>
                    {ls && <Badge variant={ls.variant}>{ls.label}</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payrolls */}
        {emp.payrolls && emp.payrolls.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">
              Bordro Geçmişi
            </h3>
            <div className="space-y-3">
              {emp.payrolls.map((pr) => (
                <div key={pr.id} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-sky-400 font-mono">
                      {pr.period}
                    </span>
                    <span className="block text-xs text-slate-500">
                      Brüt: {formatCurrency(pr.grossSalary)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-white font-medium">
                      {formatCurrency(pr.netSalary)}
                    </span>
                    {pr.paidAt ? (
                      <Badge variant="success">Ödendi</Badge>
                    ) : (
                      <Badge variant="warning">Bekliyor</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <AttachmentPanel entityType="EMPLOYEE" entityId={id} />
      </div>
    </div>
  );
}
