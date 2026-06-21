"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Mail,
  Phone,
  UserRound,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityActionPanel, type EntityAction } from "@/components/shared/EntityActionPanel";
import { EntityActivityTimeline } from "@/components/shared/EntityActivityTimeline";
import { EntityImageManager } from "@/components/shared/EntityImageManager";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useEmployee } from "@/hooks/useHR";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { RecommendedEntityAction, RecommendedTaskAction } from "@/components/shared/RecommendedActionsPanel";
import type { LeaveRequest, Payroll } from "@/services/hr.service";

type LeaveStatusPresentation = {
  label: string;
  variant: "neutral" | "success" | "warning" | "danger";
};

const LEAVE_STATUS: Record<string, LeaveStatusPresentation> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  APPROVED: { label: "Onaylı", variant: "success" },
  REJECTED: { label: "Reddedildi", variant: "danger" },
  CANCELLED: { label: "İptal", variant: "neutral" },
};

function getLeaveStatusPresentation(status: string): LeaveStatusPresentation {
  return LEAVE_STATUS[status] ?? { label: status, variant: "neutral" };
}

const MAX_HISTORY_ITEMS = 5;
const EMPLOYEE_SIDE_ACTIONS: readonly EntityAction[] = [
  "mail",
  "task",
  "attachment",
  "note",
  "approval",
];

function Panel({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          {typeof count === "number" && <Badge variant="neutral">{count}</Badge>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-slate-100">{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: "slate" | "sky" | "emerald" | "amber";
}) {
  const toneClass = {
    slate: "bg-slate-800 text-slate-300",
    sky: "bg-sky-500/10 text-sky-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
    amber: "bg-amber-500/10 text-amber-300",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          {icon}
        </span>
      </div>
      <div className="truncate text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/45 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function PriorityCue({
  icon,
  title,
  detail,
  tone,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone: "success" | "warning" | "neutral";
}) {
  const toneClass = {
    success: "bg-emerald-500/10 text-emerald-300",
    warning: "bg-amber-500/10 text-amber-300",
    neutral: "bg-slate-800 text-slate-300",
  }[tone];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function EmployeeOperationsPanel({
  pendingLeaves,
  payrolls,
  missingContactFields,
}: {
  pendingLeaves: LeaveRequest[];
  payrolls: Payroll[];
  missingContactFields: string[];
}) {
  const unpaidPayrolls = payrolls.filter((payroll) => !payroll.paidAt).length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">HR Öncelikleri</h3>
          <p className="mt-1 text-xs text-slate-500">Bu kayıt için takip edilmesi gereken işler.</p>
        </div>
        <Badge variant={pendingLeaves.length + unpaidPayrolls + missingContactFields.length > 0 ? "warning" : "success"}>
          {pendingLeaves.length + unpaidPayrolls + missingContactFields.length}
        </Badge>
      </div>

      <div className="space-y-3">
        <PriorityCue
          icon={<ClipboardList className="h-4 w-4" />}
          title={pendingLeaves.length > 0 ? `${pendingLeaves.length} bekleyen izin` : "İzin kuyruğu temiz"}
          detail={pendingLeaves.length > 0 ? "Onay veya ret aksiyonu bekleyen izin talepleri var." : "Bu personelin açık izin aksiyonu bulunmuyor."}
          tone={pendingLeaves.length > 0 ? "warning" : "success"}
        />
        <PriorityCue
          icon={<Wallet className="h-4 w-4" />}
          title={unpaidPayrolls > 0 ? `${unpaidPayrolls} ödenmemiş bordro` : "Bordroda bekleyen ödeme yok"}
          detail={payrolls.length > 0 ? `${payrolls.length} bordro kaydı üzerinden kontrol edildi.` : "Bu personel için henüz bordro kaydı oluşmamış."}
          tone={unpaidPayrolls > 0 ? "warning" : "neutral"}
        />
        <PriorityCue
          icon={<AlertCircle className="h-4 w-4" />}
          title={missingContactFields.length > 0 ? "Profil bilgisi eksik" : "Profil bilgileri tamam"}
          detail={missingContactFields.length > 0 ? `Eksik alanlar: ${missingContactFields.join(", ")}.` : "Temel iletişim alanları kayıtlı görünüyor."}
          tone={missingContactFields.length > 0 ? "warning" : "success"}
        />
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="h-16 animate-pulse rounded-xl bg-slate-900" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="h-56 animate-pulse rounded-xl bg-slate-900" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-44 animate-pulse rounded-xl bg-slate-900" />
            <div className="h-44 animate-pulse rounded-xl bg-slate-900" />
          </div>
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-slate-900" />
      </div>
    </div>
  );
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function buildLeaveApprovalAction({
  id,
  employeeName,
  pendingLeaves,
}: {
  id: string;
  employeeName: string;
  pendingLeaves: LeaveRequest[];
}): RecommendedTaskAction {
  return {
    id: `employee-${id}-leave-approval`,
    kind: "task",
    title: "Bekleyen izin taleplerini değerlendir",
    summary: `${pendingLeaves.length} bekleyen izin talebi var. HR onay/ret akışı için takip görevi açılmalı.`,
    priority: "MEDIUM",
    entityType: "EMPLOYEE",
    entityId: id,
    module: "hr",
    href: `/dashboard/hr/employees/${id}`,
    steps: ["Öneriyi gör", "Görev taslağını incele", "Onayla", "Workflow'da takip et"],
    draft: {
      title: `${employeeName} izin talepleri kontrolü`,
      detail: pendingLeaves
        .map((request) => `${formatDate(request.startDate)} - ${formatDate(request.endDate)} (${request.days} gün) ${request.type}`)
        .join("\n"),
      type: "GENERAL",
      dueAt: addDays(1),
    },
  };
}

function buildDocumentCheckAction({
  id,
  employeeName,
  missingContactFields,
}: {
  id: string;
  employeeName: string;
  missingContactFields: string[];
}): RecommendedTaskAction {
  return {
    id: `employee-${id}-document-check`,
    kind: "task",
    title: "Personel evrak ve iletişim kontrolü",
    summary: `Eksik alanlar: ${missingContactFields.join(", ")}. Evrak/iletişim kontrolü için görev açılması önerilir.`,
    priority: "LOW",
    entityType: "EMPLOYEE",
    entityId: id,
    module: "hr",
    href: `/dashboard/hr/employees/${id}`,
    steps: ["Öneriyi gör", "Görev taslağını incele", "Onayla", "Workflow'da takip et"],
    draft: {
      title: `${employeeName} evrak ve iletişim kontrolü`,
      detail: `${employeeName} için eksik iletişim/evrak bilgilerini tamamla: ${missingContactFields.join(", ")}.`,
      type: "CHECK",
      dueAt: addDays(3),
    },
  };
}

function formatTenure(hireDate: string): string {
  const start = new Date(hireDate);
  if (Number.isNaN(start.getTime())) return "-";

  const months = Math.max(
    0,
    (new Date().getFullYear() - start.getFullYear()) * 12 +
      new Date().getMonth() -
      start.getMonth(),
  );

  if (months < 1) return "1 aydan az";
  if (months < 12) return `${months} ay`;

  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths > 0 ? `${years} yıl ${restMonths} ay` : `${years} yıl`;
}

export function EmployeeDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: emp, isLoading } = useEmployee(id);

  if (isLoading) return <LoadingState />;

  if (!emp) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/45 px-6 text-center">
        <UserRound className="mb-3 h-8 w-8 text-slate-600" />
        <h2 className="text-base font-semibold text-white">Personel bulunamadı</h2>
        <p className="mt-1 text-sm text-slate-500">Bu kayıt silinmiş veya erişim kapsamınız dışında olabilir.</p>
        <Button className="mt-5" variant="secondary" size="sm" onClick={() => router.push("/dashboard/hr/employees")}>
          <ArrowLeft className="h-4 w-4" />
          Personel listesi
        </Button>
      </div>
    );
  }

  const employeeName = `${emp.firstName} ${emp.lastName}`;
  const leaveRequests = emp.leaveRequests ?? [];
  const payrolls = emp.payrolls ?? [];
  const pendingLeaves = leaveRequests.filter((request) => request.status === "PENDING");
  const paidPayrolls = payrolls.filter((payroll) => Boolean(payroll.paidAt)).length;
  const latestPayroll = payrolls[0];
  const missingContactFields = [
    emp.email ? null : "e-posta",
    emp.phone ? null : "telefon",
  ].filter((field): field is string => field !== null);

  const recommendedActions: RecommendedEntityAction[] = [];
  if (pendingLeaves.length > 0) {
    recommendedActions.push(buildLeaveApprovalAction({ id, employeeName, pendingLeaves }));
  }
  if (missingContactFields.length > 0) {
    recommendedActions.push(buildDocumentCheckAction({ id, employeeName, missingContactFields }));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personel Profili"
        subtitle="Kimlik, çalışma bilgileri, izinler ve bordro geçmişi."
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Geri
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="grid gap-5 p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <EntityImageManager
                  entityType="EMPLOYEE"
                  entityId={id}
                  label="Profil fotoğrafı"
                  description=""
                  variant="avatar"
                />
              </div>

              <div className="min-w-0 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={emp.isActive ? "success" : "neutral"} dot>
                        {emp.isActive ? "Aktif personel" : "Pasif personel"}
                      </Badge>
                      {pendingLeaves.length > 0 && <Badge variant="warning">{pendingLeaves.length} bekleyen izin</Badge>}
                    </div>
                    <h2 className="truncate text-2xl font-semibold tracking-tight text-white">{employeeName}</h2>
                    <p className="mt-1 truncate text-sm text-slate-400">
                      {[emp.position, emp.department].filter(Boolean).join(" / ") || "Pozisyon bilgisi girilmemiş"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {emp.email && (
                      <Button variant="secondary" size="sm" onClick={() => window.location.assign(`mailto:${emp.email}`)}>
                        <Mail className="h-4 w-4" />
                        Mail
                      </Button>
                    )}
                    {emp.phone && (
                      <Button variant="outline" size="sm" onClick={() => window.location.assign(`tel:${emp.phone}`)}>
                        <Phone className="h-4 w-4" />
                        Ara
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard icon={<Wallet className="h-4 w-4" />} label="Maaş" value={formatCurrency(emp.salary)} tone="sky" />
                  <StatCard icon={<CalendarDays className="h-4 w-4" />} label="Kıdem" value={formatTenure(emp.hireDate)} tone="emerald" />
                  <StatCard icon={<Clock3 className="h-4 w-4" />} label="İzin" value={`${leaveRequests.length} talep`} tone={pendingLeaves.length > 0 ? "amber" : "slate"} />
                  <StatCard icon={<FileText className="h-4 w-4" />} label="Bordro" value={`${payrolls.length} kayıt`} />
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="İletişim Bilgileri">
              <div className="grid gap-3">
                <InfoRow icon={<Mail className="h-4 w-4" />} label="E-posta" value={emp.email ?? "-"} />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefon" value={emp.phone ?? "-"} />
              </div>
            </Panel>

            <Panel title="Çalışma Bilgileri">
              <div className="grid gap-3">
                <InfoRow icon={<BriefcaseBusiness className="h-4 w-4" />} label="Pozisyon" value={emp.position ?? "-"} />
                <InfoRow icon={<Building2 className="h-4 w-4" />} label="Departman" value={emp.department ?? "-"} />
                <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="İşe giriş" value={formatDate(emp.hireDate)} />
              </div>
            </Panel>
          </div>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <EntityActivityTimeline
              entityType="EMPLOYEE"
              entityId={id}
              title="Son Aktiviteler"
              limit={6}
            />
            <EmployeeOperationsPanel
              pendingLeaves={pendingLeaves}
              payrolls={payrolls}
              missingContactFields={missingContactFields}
            />
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel title="İzin Talepleri" count={leaveRequests.length}>
              {leaveRequests.length > 0 ? (
                <div className="divide-y divide-slate-800/80">
                  {leaveRequests.slice(0, MAX_HISTORY_ITEMS).map((lr) => {
                    const status = getLeaveStatusPresentation(lr.status);
                    return (
                      <div key={lr.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-white">{lr.type}</span>
                            <span className="shrink-0 text-xs text-slate-600">/ {lr.days} gün</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {formatDate(lr.startDate)} - {formatDate(lr.endDate)}
                          </p>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyPanel title="İzin talebi yok" detail="Bu personel için kayıtlı izin hareketi bulunmuyor." />
              )}
            </Panel>

            <Panel title="Bordro Geçmişi" count={payrolls.length}>
              {payrolls.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Son net ödeme</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">
                        {latestPayroll ? formatCurrency(latestPayroll.netSalary) : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Ödenen bordro</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {paidPayrolls}/{payrolls.length}
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/80">
                    {payrolls.slice(0, MAX_HISTORY_ITEMS).map((payroll) => (
                      <div key={payroll.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <span className="font-mono text-sm font-medium text-sky-300">{payroll.period}</span>
                          <span className="block truncate text-xs text-slate-500">
                            Brüt: {formatCurrency(payroll.grossSalary)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-sm font-semibold text-white">{formatCurrency(payroll.netSalary)}</span>
                          {payroll.paidAt ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" />
                              Ödendi
                            </Badge>
                          ) : (
                            <Badge variant="warning">Bekliyor</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyPanel title="Bordro kaydı yok" detail="Bu personel için henüz bordro oluşturulmamış." />
              )}
            </Panel>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-sky-300" />
              <h3 className="text-sm font-semibold text-white">Profil Tamlığı</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: "E-posta", done: Boolean(emp.email) },
                { label: "Telefon", done: Boolean(emp.phone) },
                { label: "Pozisyon", done: Boolean(emp.position) },
                { label: "Departman", done: Boolean(emp.department) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/45 px-3 py-2">
                  <span className="text-xs text-slate-400">{item.label}</span>
                  <Badge variant={item.done ? "success" : "warning"}>{item.done ? "Tamam" : "Eksik"}</Badge>
                </div>
              ))}
            </div>
          </section>

          <EntityActionPanel
            entityType="EMPLOYEE"
            entityId={id}
            displayName={employeeName}
            module="hr"
            primaryEmail={emp.email}
            availableActions={EMPLOYEE_SIDE_ACTIONS}
            recommendedActions={recommendedActions}
          />
        </aside>
      </div>
    </div>
  );
}
