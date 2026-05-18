"use client";

import { useState, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Plus,
  Lock,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
  Save,
  X,
  ChevronRight,
  AlertTriangle,
  Check,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { FiscalPeriodStatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormRow } from "@/components/shared/FormField";
import {
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useCloseFiscalPeriod,
} from "@/hooks/useAccounting";
import { apiClient } from "@/lib/api-client";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import type { FiscalPeriod } from "@/services/accounting.service";

const schema = z.object({
  name: z.string().min(1, "Ad zorunludur"),
  startDate: z.string().min(1, "Başlangıç tarihi zorunludur"),
  endDate: z.string().min(1, "Bitiş tarihi zorunludur"),
});
type FormData = z.infer<typeof schema>;

// ─────────────────────────────────────────────
// Period summary sub-component
// ─────────────────────────────────────────────

function PeriodSummary({
  period,
  onClose,
}: {
  period: FiscalPeriod;
  onClose: () => void;
}) {
  const dateFrom = period.startDate.split("T")[0];
  const dateTo = period.endDate.split("T")[0];

  const { data: rev } = useQuery({
    queryKey: ["period-summary", "rev", period.id],
    queryFn: async () => {
      const r = await apiClient.get("/api/reports/revenue-summary", {
        params: { dateFrom, dateTo },
      });
      return r.data?.data as
        | {
            invoiceCount: number;
            totalNet: number;
            totalTax: number;
            totalGross: number;
          }
        | undefined;
    },
  });

  const { data: exp } = useQuery({
    queryKey: ["period-summary", "exp", period.id],
    queryFn: async () => {
      const r = await apiClient.get("/api/reports/expense-summary", {
        params: { dateFrom, dateTo },
      });
      return r.data?.data as
        | {
            invoiceCount: number;
            totalNet: number;
            totalTax: number;
            totalGross: number;
          }
        | undefined;
    },
  });

  const revenue = Number(rev?.totalGross ?? 0);
  const expense = Number(exp?.totalGross ?? 0);
  const profit = revenue - expense;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <CalendarRange className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{period.name}</h3>
            <p className="text-xs text-slate-500">
              {formatDate(period.startDate)} — {formatDate(period.endDate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FiscalPeriodStatusBadge status={period.status} />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Gelir
              </span>
            </div>
            <p className="text-lg font-bold text-emerald-400 tabular-nums">
              {formatCurrency(revenue)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {rev?.invoiceCount ?? 0} satış faturası
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Gider
              </span>
            </div>
            <p className="text-lg font-bold text-red-400 tabular-nums">
              {formatCurrency(expense)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {exp?.invoiceCount ?? 0} alış faturası
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-sky-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Net Kar/Zarar
              </span>
            </div>
            <p
              className={cn(
                "text-lg font-bold tabular-nums",
                profit >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {formatCurrency(profit)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {profit >= 0 ? "Kârlı" : "Zararlı"}
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-violet-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                KDV
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Tahsil</span>
                <span className="text-slate-300 tabular-nums">
                  {formatCurrency(Number(rev?.totalTax ?? 0))}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Ödenen</span>
                <span className="text-slate-300 tabular-nums">
                  {formatCurrency(Number(exp?.totalTax ?? 0))}
                </span>
              </div>
              <div className="h-px bg-slate-700 my-0.5" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Fark</span>
                <span className="text-sky-400 font-bold tabular-nums">
                  {formatCurrency(
                    Number(rev?.totalTax ?? 0) - Number(exp?.totalTax ?? 0),
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profit bar */}
        {(revenue > 0 || expense > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
              <span>Gelir / Gider Oranı</span>
              <span>
                {revenue > 0 ? ((expense / revenue) * 100).toFixed(0) : 0}%
                gider oranı
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
                style={{
                  width: `${revenue + expense > 0 ? (revenue / (revenue + expense)) * 100 : 50}%`,
                }}
              />
              <div
                className="h-full bg-red-500 rounded-r-full transition-all duration-500"
                style={{
                  width: `${revenue + expense > 0 ? (expense / (revenue + expense)) * 100 : 50}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1">
              <span className="text-emerald-400">Gelir</span>
              <span className="text-red-400">Gider</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function FiscalPeriodsPage() {
  const { data: periods = [], isLoading } = useFiscalPeriods();
  const createPeriod = useCreateFiscalPeriod();
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<FiscalPeriod | null>(
    null,
  );
  const closePeriod = useCloseFiscalPeriod(closeTarget?.id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const watchStart = useWatch({ control, name: "startDate" });
  const watchEnd = useWatch({ control, name: "endDate" });

  // Check overlap with existing periods
  const { hasOverlap, overlapPeriod } = useMemo(() => {
    if (!watchStart || !watchEnd)
      return { hasOverlap: false, overlapPeriod: null };
    const found = periods.find((p) => {
      const ps = p.startDate.split("T")[0];
      const pe = p.endDate.split("T")[0];
      return ps <= watchEnd && pe >= watchStart;
    });
    return { hasOverlap: !!found, overlapPeriod: found ?? null };
  }, [watchStart, watchEnd, periods]);

  const onSubmit = (data: FormData) => {
    createPeriod.mutate(data, {
      onSuccess: () => {
        setCreateOpen(false);
        reset();
      },
    });
  };

  const columns: ColumnDef<FiscalPeriod>[] = [
    {
      key: "name",
      header: "Ad",
      render: (r) => (
        <span className="text-slate-200 font-medium">{r.name}</span>
      ),
    },
    {
      key: "startDate",
      header: "Başlangıç",
      width: "120px",
      render: (r) => (
        <span className="text-slate-400">{formatDate(r.startDate)}</span>
      ),
    },
    {
      key: "endDate",
      header: "Bitiş",
      width: "120px",
      render: (r) => (
        <span className="text-slate-400">{formatDate(r.endDate)}</span>
      ),
    },
    {
      key: "status",
      header: "Durum",
      width: "100px",
      render: (r) => <FiscalPeriodStatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      width: "140px",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPeriod(r);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                       text-violet-400 bg-violet-500/10 border border-violet-500/20
                       hover:bg-violet-500/20 transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
            Özet
          </button>
          {r.status === "OPEN" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCloseTarget(r);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                         text-amber-400 bg-amber-500/10 border border-amber-500/20
                         hover:bg-amber-500/20 transition-colors"
            >
              <Lock className="w-3 h-3" />
              Kapat
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mali Dönemler"
        subtitle="Muhasebe dönemlerini yönetin ve dönem bazlı gelir/gider özetini görüntüleyin."
        action={
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setCreateOpen(true);
            }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Dönem
          </Link>
        }
      />

      {/* Period summary panel */}
      {selectedPeriod && (
        <PeriodSummary
          period={selectedPeriod}
          onClose={() => setSelectedPeriod(null)}
        />
      )}

      <DataTable
        columns={columns}
        data={periods}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => setSelectedPeriod(r)}
        emptyTitle="Mali dönem bulunamadı"
        emptyDescription="Yeni bir mali dönem oluşturarak başlayın."
      />

      {/* Create modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          reset();
        }}
        title="Yeni Mali Dönem"
        description="Tarih aralığı mevcut dönemlerle çakışmamalıdır."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={() => {
                setCreateOpen(false);
                reset();
              }}
            >
              İptal
            </Button>
            <Button
              size="sm"
              leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={handleSubmit(onSubmit)}
              loading={createPeriod.isPending}
              disabled={hasOverlap}
              className={
                !hasOverlap
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20"
                  : ""
              }
            >
              {hasOverlap ? "Çakışma Var" : "Dönemi Oluştur"}
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* Quick presets */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 block">
              Hızlı Seçim
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(() => {
                const year = new Date().getFullYear();
                return [
                  {
                    label: "1. Çeyrek",
                    name: `${year} 1. Çeyrek`,
                    start: `${year}-01-01`,
                    end: `${year}-03-31`,
                  },
                  {
                    label: "2. Çeyrek",
                    name: `${year} 2. Çeyrek`,
                    start: `${year}-04-01`,
                    end: `${year}-06-30`,
                  },
                  {
                    label: "3. Çeyrek",
                    name: `${year} 3. Çeyrek`,
                    start: `${year}-07-01`,
                    end: `${year}-09-30`,
                  },
                  {
                    label: "4. Çeyrek",
                    name: `${year} 4. Çeyrek`,
                    start: `${year}-10-01`,
                    end: `${year}-12-31`,
                  },
                ].map((q) => {
                  const isUsed = periods.some((p) => {
                    const ps = p.startDate.split("T")[0];
                    const pe = p.endDate.split("T")[0];
                    return ps <= q.end && pe >= q.start;
                  });
                  return (
                    <button
                      key={q.label}
                      type="button"
                      disabled={isUsed}
                      onClick={() => {
                        setValue("name", q.name);
                        setValue("startDate", q.start);
                        setValue("endDate", q.end);
                      }}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all duration-200",
                        isUsed
                          ? "border-slate-800 bg-slate-800/20 opacity-40 cursor-not-allowed"
                          : "border-slate-800 bg-slate-800/40 hover:border-sky-500/30 hover:bg-sky-500/5 hover:text-sky-400",
                      )}
                    >
                      <Calendar
                        className={cn(
                          "w-4 h-4",
                          isUsed ? "text-slate-600" : "text-slate-400",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isUsed
                            ? "text-slate-600 line-through"
                            : "text-slate-300",
                        )}
                      >
                        {q.label}
                      </span>
                      {isUsed && (
                        <span className="text-[8px] text-slate-600">
                          Kullanılıyor
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Form fields */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <CalendarRange className="w-3 h-3" /> Dönem Bilgileri
            </label>
            <div className="space-y-3">
              <Input
                label="Dönem Adı"
                required
                placeholder="2026 Q1"
                error={errors.name?.message}
                prefixIcon={<CalendarRange className="w-3.5 h-3.5" />}
                {...register("name")}
              />
              <FormRow cols={2}>
                <DatePicker
                  label="Başlangıç Tarihi"
                  required
                  value={watchStart}
                  error={errors.startDate?.message}
                  onValueChange={(value) => setValue("startDate", value ?? "", { shouldDirty: true, shouldValidate: true })}
                  clearable={false}
                />
                <DatePicker
                  label="Bitiş Tarihi"
                  required
                  value={watchEnd}
                  error={errors.endDate?.message}
                  onValueChange={(value) => setValue("endDate", value ?? "", { shouldDirty: true, shouldValidate: true })}
                  clearable={false}
                />
              </FormRow>
            </div>
          </div>

          {/* Overlap warning or OK */}
          {watchStart && watchEnd && (
            <div
              className={cn(
                "flex items-start gap-3 p-3.5 rounded-xl border",
                hasOverlap
                  ? "bg-red-500/5 border-red-500/15"
                  : "bg-emerald-500/5 border-emerald-500/15",
              )}
            >
              <div
                className={cn(
                  "p-2 rounded-lg shrink-0",
                  hasOverlap ? "bg-red-500/10" : "bg-emerald-500/10",
                )}
              >
                {hasOverlap ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    hasOverlap ? "text-red-300" : "text-emerald-300",
                  )}
                >
                  {hasOverlap ? "Tarih çakışması" : "Uygun tarih aralığı"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {hasOverlap
                    ? `"${overlapPeriod?.name}" dönemi ile çakışıyor.`
                    : "Bu tarih aralığında başka dönem bulunmuyor."}
                </p>
              </div>
            </div>
          )}

          {/* Existing periods mini list */}
          {periods.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                Mevcut Dönemler
              </label>
              <div className="space-y-1">
                {periods.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-800/30"
                  >
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        p.status === "OPEN" ? "bg-emerald-400" : "bg-slate-600",
                      )}
                    />
                    <span className="text-slate-400 flex-1">{p.name}</span>
                    <span className="text-slate-600 font-mono text-[10px]">
                      {formatDate(p.startDate)} — {formatDate(p.endDate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        onConfirm={() =>
          closePeriod.mutate(undefined, {
            onSuccess: () => setCloseTarget(null),
          })
        }
        title="Dönemi Kapat"
        message={`"${closeTarget?.name}" dönemini kapatmak istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Kapat"
        isLoading={closePeriod.isPending}
        variant="warning"
      />
    </div>
  );
}
