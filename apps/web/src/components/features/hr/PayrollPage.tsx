"use client";

import { useState } from "react";
import { Plus, Eye, Trash2, DollarSign, CheckCircle, Zap, CheckCircle2, XCircle, Download, BookOpen } from "lucide-react";
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
} from "@/hooks/useHR";
import { formatCurrency } from "@/lib/utils";
import { getPayrollBankFile, getPayrollClosingChecks, type Payroll, type PeriodClosingChecksResult } from "@/services/hr.service";

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
