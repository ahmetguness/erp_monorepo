"use client";

import { useState } from "react";
import { Plus, Eye, Trash2, CheckCircle, Zap, CheckCircle2, XCircle, Download, BookOpen, Archive, RotateCcw, ShieldCheck, ClipboardCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { EmployeeSelect } from "@/components/shared/EntitySelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormRow } from "@/components/shared/FormField";
import {
  usePayrolls,
  usePayroll,
  useCreatePayroll,
  useGenerateBulkPayroll,
  useMarkPayrollPaid,
  useDeletePayroll,
  useCreatePayrollAccountingVoucher,
  useAdvancedPayroll,
} from "@/hooks/useHR";
import { formatCurrency } from "@/lib/utils";
import { getPayrollBankFile, getPayrollClosingChecks, type Payroll, type PayrollApprovalRequestRow, type PeriodClosingChecksResult } from "@/services/hr.service";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function approvalRequestLabel(status: PayrollApprovalRequestRow["status"]): string {
  switch (status) {
    case "APPROVED":
      return "Onaylandi";
    case "REJECTED":
      return "Reddedildi";
    case "CANCELLED":
      return "Iptal";
    case "ESCALATED":
      return "Eskale";
    case "PENDING":
    default:
      return "Bekliyor";
  }
}

function accountingStatusLabel(status: "posted" | "draft" | "missing" | "unbalanced"): string {
  switch (status) {
    case "posted":
      return "Fislendi";
    case "draft":
      return "Taslak";
    case "unbalanced":
      return "Dengesiz";
    case "missing":
    default:
      return "Eksik";
  }
}

export function PayrollPage() {
  const [page, setPage] = useState(1);
  const [periodFilter, setPeriodFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    period: "",
    grossSalary: "",
    notes: "",
  });
  const [bulkPeriod, setBulkPeriod] = useState("");

  // Integration States
  const [checksOpen, setChecksOpen] = useState(false);
  const [checksResult, setChecksResult] = useState<PeriodClosingChecksResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloadingBankFile, setIsDownloadingBankFile] = useState(false);

  const { data, isLoading } = usePayrolls({
    page,
    limit: 20,
    ...(periodFilter && { period: periodFilter }),
  });
  const advancedPeriod = /^\d{4}-\d{2}$/.test(periodFilter) ? periodFilter : currentPeriod();
  const { data: advancedPayroll, isLoading: advancedLoading } = useAdvancedPayroll(advancedPeriod);
  const { data: detail } = usePayroll(detailId ?? "");
  const create = useCreatePayroll();
  const generateBulk = useGenerateBulkPayroll();
  const markPaid = useMarkPayrollPaid();
  const remove = useDeletePayroll();
  const postVoucher = useCreatePayrollAccountingVoucher();

  const handleRunClosingChecks = async () => {
    try {
      setIsChecking(true);
      const result = await getPayrollClosingChecks(periodFilter);
      setChecksResult(result);
      setChecksOpen(true);
    } catch (err) {
      // Error handled
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadBankFile = async () => {
    try {
      setIsDownloadingBankFile(true);
      const blob = await getPayrollBankFile(periodFilter);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `banka_odeme_listesi_${periodFilter}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      // Handled
    } finally {
      setIsDownloadingBankFile(false);
    }
  };

  const handlePostAccountingVoucher = () => {
    if (confirm(`${periodFilter} dönemi için bordro tahakkuk muhasebe fişini oluşturmak istediğinize emin misiniz?`)) {
      postVoucher.mutate(periodFilter);
    }
  };

  const columns: ColumnDef<Payroll>[] = [
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
      key: "period",
      header: "Dönem",
      width: "100px",
      render: (r) => (
        <span className="text-sky-400 font-mono text-sm">{r.period}</span>
      ),
    },
    {
      key: "grossSalary",
      header: "Brüt",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="text-slate-300 tabular-nums">
          {formatCurrency(r.grossSalary)}
        </span>
      ),
    },
    {
      key: "deductions",
      header: "Kesinti",
      width: "100px",
      align: "right",
      render: (r) => (
        <span className="text-red-400 tabular-nums">
          {Number(r.deductions) > 0 ? `-${formatCurrency(r.deductions)}` : "—"}
        </span>
      ),
    },
    {
      key: "netSalary",
      header: "Net",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="text-white font-medium tabular-nums">
          {formatCurrency(r.netSalary)}
        </span>
      ),
    },
    {
      key: "paidAt",
      header: "Ödeme",
      width: "100px",
      render: (r) =>
        r.paidAt ? (
          <Badge variant="success">Ödendi</Badge>
        ) : (
          <Badge variant="warning">Bekliyor</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "120px",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailId(r.id);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {!r.paidAt && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markPaid.mutate(r.id);
                }}
                className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
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
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bordro"
        subtitle="Personel bordrolarını yönetin."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setBulkOpen(true)}>
              <Zap className="w-4 h-4" />
              Toplu Oluştur
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Yeni Bordro
            </Button>
          </div>
        }
      />

      <div className="flex items-end justify-between gap-3 mb-5">
        <Input
          label="Dönem Filtresi"
          placeholder="ör. 2026-03"
          value={periodFilter}
          onChange={(e) => {
            setPeriodFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        />

        {/^\d{4}-\d{2}$/.test(periodFilter) && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRunClosingChecks}
              loading={isChecking}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Kapanış Kontrolleri
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadBankFile}
              loading={isDownloadingBankFile}
            >
              <Download className="w-4 h-4 text-sky-400" />
              Banka Ödeme Dosyası (.csv)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePostAccountingVoucher}
              loading={postVoucher.isPending}
            >
              <BookOpen className="w-4 h-4 text-violet-400" />
              Muhasebe Fişi Oluştur
            </Button>
          </div>
        )}
      </div>

      <section className="mb-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Bordro ileri seviye</h2>
            <p className="mt-1 text-xs text-slate-500">
              {advancedPeriod} donem kapama, muhasebe entegrasyonu, geriye donuk duzeltme ve arsiv durumu.
            </p>
          </div>
          <Badge variant={advancedPayroll?.summary.closingReady ? "success" : "warning"}>
            {advancedPayroll?.summary.closingReady ? "Kapanisa hazir" : "Kontrol gerekli"}
          </Badge>
        </div>

        {advancedLoading || !advancedPayroll ? (
          <div className="grid gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-slate-800/60" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <AdvancedMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Donem kapama" value={`${advancedPayroll.summary.payrollCount}/${advancedPayroll.summary.activeEmployeeCount}`} tone={advancedPayroll.summary.missingPayrollCount > 0 ? "warning" : "success"} />
              <AdvancedMetric icon={<BookOpen className="h-4 w-4" />} label="Muhasebe fisi" value={advancedPayroll.accounting.journalEntryNumber ?? "Eksik"} tone={advancedPayroll.summary.accountingVoucherCreated ? "success" : "warning"} />
              <AdvancedMetric icon={<ShieldCheck className="h-4 w-4" />} label="Hassas yetki" value={advancedPayroll.summary.sensitiveAccessIssueCount} tone={advancedPayroll.summary.sensitiveAccessIssueCount > 0 ? "warning" : "success"} />
              <AdvancedMetric icon={<ClipboardCheck className="h-4 w-4" />} label="Onay bekleyen" value={advancedPayroll.summary.approvalPendingCount} tone={advancedPayroll.summary.approvalPendingCount > 0 ? "warning" : "success"} />
              <AdvancedMetric icon={<RotateCcw className="h-4 w-4" />} label="Geriye donuk duzeltme" value={advancedPayroll.summary.retroCorrectionCount} tone={advancedPayroll.summary.retroCorrectionCount > 0 ? "warning" : "info"} />
              <AdvancedMetric icon={<Archive className="h-4 w-4" />} label="Onayli arsiv" value={advancedPayroll.summary.archiveReadyCount} tone={advancedPayroll.summary.archiveReadyCount > 0 ? "success" : "info"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Hassas veri yetkisi</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <AccessPill label="Oku" active={advancedPayroll.sensitiveAccess.currentUser.canRead} />
                  <AccessPill label="Guncelle" active={advancedPayroll.sensitiveAccess.currentUser.canUpdate} />
                  <AccessPill label="Onayla" active={advancedPayroll.sensitiveAccess.currentUser.canApprove} />
                  <AccessPill label="Disa aktar" active={advancedPayroll.sensitiveAccess.currentUser.canExport} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <span>Export rol: {advancedPayroll.sensitiveAccess.roleCoverage.exportRoleCount}</span>
                  <span>Onay rol: {advancedPayroll.sensitiveAccess.roleCoverage.approveRoleCount}</span>
                </div>
                {advancedPayroll.sensitiveAccess.warnings.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {advancedPayroll.sensitiveAccess.warnings.slice(0, 2).map((warning) => (
                      <p key={warning} className="flex items-start gap-1.5 text-xs text-amber-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Bordro onay akisi</h3>
                <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Aktif akis / adim</span>
                  <span className="font-medium text-slate-200">
                    {advancedPayroll.approvalWorkflow.activeFlowCount}/{advancedPayroll.approvalWorkflow.approverStepCount}
                  </span>
                </div>
                {advancedPayroll.approvalWorkflow.latestRequests.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {advancedPayroll.approvalWorkflow.activeFlowCount > 0 ? "Bu donem icin onay talebi yok." : "Bordro icin aktif onay akisi yok."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {advancedPayroll.approvalWorkflow.latestRequests.slice(0, 4).map((row) => (
                      <div key={row.requestId} className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-200">{row.flowName}</p>
                          <Badge variant={row.status === "APPROVED" ? "success" : row.status === "PENDING" ? "warning" : "danger"}>
                            {approvalRequestLabel(row.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-slate-500">Adim {row.currentStep} / {formatDate(row.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Muhasebe fis baglantisi</h3>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Durum</span>
                  <Badge variant={advancedPayroll.accounting.integrationStatus === "posted" ? "success" : "warning"}>
                    {accountingStatusLabel(advancedPayroll.accounting.integrationStatus)}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-500">
                  <p>Fis: <span className="font-medium text-slate-200">{advancedPayroll.accounting.journalEntryNumber ?? "-"}</span></p>
                  <p>Satir: {advancedPayroll.accounting.lineCount} / Denge farki: {formatCurrency(advancedPayroll.accounting.balanceDifference)}</p>
                  <p>Post tarihi: {formatDate(advancedPayroll.accounting.postedAt)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Kapama kontrol listesi</h3>
                <div className="space-y-2">
                  {advancedPayroll.closingChecks.map((check) => (
                    <div key={check.name} className="flex items-start gap-2 text-xs">
                      {check.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-400" />}
                      <div>
                        <p className="font-medium text-slate-200">{check.name}</p>
                        <p className="mt-0.5 text-slate-500">{check.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Duzeltme gecmisi</h3>
                <div className="space-y-2">
                  {advancedPayroll.retroCorrections.length === 0 ? (
                    <p className="text-xs text-slate-500">Bu donemde geriye donuk bordro duzeltmesi yok.</p>
                  ) : advancedPayroll.retroCorrections.slice(0, 4).map((row) => (
                    <div key={`${row.payrollId}:${row.correctedAt}`} className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs">
                      <p className="font-medium text-slate-200">{row.employeeName}</p>
                      <p className="mt-0.5 text-slate-500">{formatDate(row.correctedAt)} / {row.reason ?? "-"}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Onayli bordro arsivi</h3>
                <div className="space-y-2">
                  {advancedPayroll.archive.length === 0 ? (
                    <p className="text-xs text-slate-500">Arsivlenebilir odenmis bordro yok.</p>
                  ) : advancedPayroll.archive.slice(0, 4).map((row) => (
                    <div key={row.payrollId} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs">
                      <div>
                        <p className="font-medium text-slate-200">{row.employeeName}</p>
                        <p className="mt-0.5 text-slate-500">{formatDate(row.paidAt)} / {formatCurrency(row.netSalary)}</p>
                      </div>
                      <Badge variant={row.archiveStatus === "approved_archive" ? "success" : "warning"}>
                        {row.archiveStatus === "approved_archive" ? "Arsiv hazir" : "Fis eksik"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => setDetailId(r.id)}
        emptyTitle="Bordro bulunamadı"
        emptyDescription="Yeni bir bordro oluşturarak başlayın."
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

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Bordro"
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
              disabled={!form.employeeId || !form.period || !form.grossSalary}
              onClick={() =>
                create.mutate(
                  {
                    employeeId: form.employeeId,
                    period: form.period,
                    grossSalary: Number(form.grossSalary),
                    notes: form.notes || undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setForm({
                        employeeId: "",
                        period: "",
                        grossSalary: "",
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
          <FormRow cols={2}>
            <Input
              label="Dönem"
              required
              placeholder="2026-03"
              value={form.period}
              onChange={(e) =>
                setForm((p) => ({ ...p, period: e.target.value }))
              }
            />
            <Input
              label="Brüt Maaş"
              required
              type="number"
              value={form.grossSalary}
              onChange={(e) =>
                setForm((p) => ({ ...p, grossSalary: e.target.value }))
              }
            />
          </FormRow>
          <Input
            label="Not"
            placeholder="Opsiyonel"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Bulk Generate Modal */}
      <Modal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Toplu Bordro Oluştur"
        size="sm"
        description="Tüm aktif personeller için seçilen dönemde bordro oluşturur. Mevcut maaş bilgileri kullanılır."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBulkOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={generateBulk.isPending}
              disabled={!bulkPeriod}
              onClick={() =>
                generateBulk.mutate(
                  { period: bulkPeriod },
                  {
                    onSuccess: () => {
                      setBulkOpen(false);
                      setBulkPeriod("");
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
        <Input
          label="Dönem"
          required
          placeholder="2026-03"
          value={bulkPeriod}
          onChange={(e) => setBulkPeriod(e.target.value)}
        />
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        title={
          detail
            ? `${detail.employee?.firstName} ${detail.employee?.lastName} — ${detail.period}`
            : "Bordro Detayı"
        }
        size="md"
        footer={
          <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
            Kapat
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Brüt Maaş</div>
                <div className="text-sm text-white font-medium">
                  {formatCurrency(detail.grossSalary)}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">
                  Kesintiler
                </div>
                <div className="text-sm text-red-400 font-medium">
                  {formatCurrency(detail.deductions)}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Net Maaş</div>
                <div className="text-sm text-emerald-400 font-medium">
                  {formatCurrency(detail.netSalary)}
                </div>
              </div>
            </div>

            {detail.items && detail.items.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-3">
                  Bordro Kalemleri
                </h4>
                <div className="space-y-2">
                  {detail.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-3"
                    >
                      <span className="text-sm text-white">{item.label}</span>
                      <span
                        className={`text-sm font-medium ${item.isDeduction ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {item.isDeduction ? "-" : "+"}
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-600">
              <span>Durum: {detail.paidAt ? `Ödendi` : "Bekliyor"}</span>
              {detail.notes && <span>Not: {detail.notes}</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </Modal>

      {/* Closing Checks Modal */}
      <Modal
        isOpen={checksOpen}
        onClose={() => setChecksOpen(false)}
        title={`${periodFilter} Dönemi Bordro Kapanış Kontrolleri`}
        size="md"
        footer={
          <Button size="sm" onClick={() => setChecksOpen(false)}>
            Tamam
          </Button>
        }
      >
        <div className="space-y-4">
          <div className={`p-4 rounded-xl border ${checksResult?.success ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex items-start gap-3">
              {checksResult?.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className={`text-sm font-semibold ${checksResult?.success ? 'text-emerald-400' : 'text-red-400'}`}>
                  {checksResult?.success ? 'Kontroller Başarıyla Tamamlandı' : 'Kontroller Sırasında Hata Tespit Edildi'}
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  {checksResult?.success
                    ? 'Bu dönem bordrosu kapanış için uygundur. Herhangi bir engel bulunmamaktadır.'
                    : 'Lütfen aşağıda belirtilen hataları düzelttikten sonra tekrar deneyiniz.'}
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-800 border-y border-slate-800">
            {checksResult?.checks.map((check, index) => (
              <div key={index} className="flex items-start justify-between py-3">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-white">{check.name}</span>
                  <span className="block text-xs text-slate-500">{check.message}</span>
                </div>
                <span className="shrink-0 mt-0.5">
                  {check.passed ? (
                    <span className="text-emerald-400 text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Geçti</span>
                  ) : (
                    <span className="text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">Başarısız</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AccessPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`rounded-md border px-2 py-1 ${active ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-slate-800 bg-slate-900/60 text-slate-500"}`}>
      {label}
    </span>
  );
}

function AdvancedMetric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: "success" | "warning" | "info" }) {
  const toneClass = tone === "success" ? "text-emerald-400" : tone === "warning" ? "text-amber-400" : "text-sky-400";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className={toneClass}>{icon}</div>
      <span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 block truncate text-lg font-bold text-white">{value}</span>
    </div>
  );
}
