"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Banknote,
  Landmark,
  Coins,
  CreditCard,
  FileCheck,
  Receipt,
  Save,
  X,
  CalendarDays,
  Hash,
  StickyNote,
  Users,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { PaymentStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormRow } from "@/components/shared/FormField";
import {
  usePayments,
  useCreatePayment,
  useBankAccounts,
  useCashAccounts,
} from "@/hooks/useAccounting";
import { useContacts } from "@/hooks/useContacts";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Payment } from "@/services/accounting.service";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Nakit",
  BANK_TRANSFER: "Havale/EFT",
  CREDIT_CARD: "Kredi Kartı",
  CHECK: "Çek",
  PROMISSORY_NOTE: "Senet",
  OTHER: "Diğer",
};

// ─────────────────────────────────────────────
// Payment method visual config
// ─────────────────────────────────────────────

const METHODS = [
  {
    value: "CASH",
    label: "Nakit",
    icon: Coins,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/20",
  },
  {
    value: "BANK_TRANSFER",
    label: "Havale/EFT",
    icon: Landmark,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    ring: "ring-sky-500/20",
  },
  {
    value: "CREDIT_CARD",
    label: "Kredi Kartı",
    icon: CreditCard,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    ring: "ring-violet-500/20",
  },
  {
    value: "CHECK",
    label: "Çek",
    icon: FileCheck,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    ring: "ring-amber-500/20",
  },
  {
    value: "PROMISSORY_NOTE",
    label: "Senet",
    icon: Receipt,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    ring: "ring-pink-500/20",
  },
  {
    value: "OTHER",
    label: "Diğer",
    icon: Banknote,
    color: "text-slate-400",
    bg: "bg-slate-700/50",
    border: "border-slate-600/50",
    ring: "ring-slate-500/20",
  },
] as const;

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const paymentSchema = z.object({
  contactId: z.string().optional(),
  method: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "CREDIT_CARD",
    "CHECK",
    "PROMISSORY_NOTE",
    "OTHER",
  ]),
  date: z.string().min(1, "Tarih zorunlu"),
  amount: z.string().min(1, "Tutar zorunlu"),
  bankAccountId: z.string().optional(),
  cashAccountId: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type PaymentForm = z.infer<typeof paymentSchema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function PaymentsListPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = usePayments({ page, limit: 20 });
  const createPayment = useCreatePayment();

  const { data: contactsData } = useContacts({ page: 1, limit: 200 });
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: cashAccounts = [] } = useCashAccounts();

  const contacts = contactsData?.data ?? [];
  const contactOptions = [
    { value: "", label: "— Cari seçin (opsiyonel) —" },
    ...contacts.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
  ];
  const bankOptions = [
    { value: "", label: "— Banka hesabı —" },
    ...bankAccounts.map((b) => ({ value: b.id, label: b.name })),
  ];
  const cashOptions = [
    { value: "", label: "— Kasa hesabı —" },
    ...cashAccounts.map((c) => ({ value: c.id, label: c.name })),
  ];

  const today = new Date().toISOString().split("T")[0];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: "CASH", date: today, amount: "" },
  });

  const selectedMethod = watch("method");
  const isBankMethod =
    selectedMethod === "BANK_TRANSFER" || selectedMethod === "CREDIT_CARD";
  const isCashMethod = selectedMethod === "CASH";

  const closeModal = () => {
    setCreateOpen(false);
    reset({ method: "CASH", date: today, amount: "" });
  };

  const onSubmit = (formData: PaymentForm) => {
    createPayment.mutate(
      {
        contactId: formData.contactId || undefined,
        method: formData.method,
        date: formData.date,
        amount: Number(formData.amount),
        bankAccountId: formData.bankAccountId || undefined,
        cashAccountId: formData.cashAccountId || undefined,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      },
      { onSuccess: closeModal },
    );
  };

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  const columns: ColumnDef<Payment>[] = [
    {
      key: "date",
      header: "Tarih",
      width: "100px",
      render: (r) => (
        <span className="text-slate-400 text-xs">{formatDate(r.date)}</span>
      ),
    },
    {
      key: "contact",
      header: "Cari",
      render: (r) =>
        r.contact ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-sky-500/10 flex items-center justify-center text-[10px] font-bold text-sky-400 shrink-0">
              {r.contact.name.charAt(0)}
            </div>
            <span className="text-slate-200 text-sm truncate">
              {r.contact.name}
            </span>
          </div>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
    {
      key: "method",
      header: "Yöntem",
      width: "130px",
      render: (r) => {
        const m = METHODS.find((mt) => mt.value === r.method);
        return m ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              m.bg,
              m.color,
            )}
          >
            <m.icon className="w-3 h-3" />
            {m.label}
          </span>
        ) : (
          <span className="text-slate-400 text-sm">{r.method}</span>
        );
      },
    },
    {
      key: "account",
      header: "Hesap",
      width: "140px",
      render: (r) => {
        const name = r.bankAccount?.name ?? r.cashAccount?.name;
        return name ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            {r.bankAccount ? (
              <Landmark className="w-3 h-3 text-slate-600" />
            ) : (
              <Coins className="w-3 h-3 text-slate-600" />
            )}
            {name}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        );
      },
    },
    {
      key: "reference",
      header: "Referans",
      width: "110px",
      render: (r) => (
        <span className="text-slate-500 text-xs font-mono">
          {r.reference ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Durum",
      width: "110px",
      render: (r) => <PaymentStatusBadge status={r.status} />,
    },
    {
      key: "amount",
      header: "Tutar",
      width: "130px",
      align: "right",
      render: (r) => (
        <span className="font-semibold text-white tabular-nums">
          {formatCurrency(r.amount)}
        </span>
      ),
    },
  ];

  const allPayments = data?.data ?? [];
  const filteredPayments = allPayments.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (methodFilter !== "all" && p.method !== methodFilter) return false;
    return true;
  });

  // Summary stats
  const totalAmount = allPayments.reduce((s, p) => s + Number(p.amount), 0);
  const completedAmount = allPayments
    .filter((p) => p.status === "COMPLETED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const pendingAmount = allPayments
    .filter((p) => p.status === "PENDING")
    .reduce((s, p) => s + Number(p.amount), 0);

  const activeMethod =
    METHODS.find((m) => m.value === selectedMethod) ?? METHODS[0];

  const STATUS_FILTERS = [
    {
      key: "all",
      label: "Tümü",
      active: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    },
    {
      key: "COMPLETED",
      label: "Tamamlanan",
      active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    {
      key: "PENDING",
      label: "Bekleyen",
      active: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
    {
      key: "FAILED",
      label: "Başarısız",
      active: "bg-red-500/15 text-red-400 border-red-500/30",
    },
    {
      key: "CANCELLED",
      label: "İptal",
      active: "bg-slate-700/50 text-slate-300 border-slate-600/50",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ödemeler"
        subtitle="Tahsilat ve ödeme kayıtlarını yönetin."
        action={
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setCreateOpen(true);
            }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500
                       shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Ödeme
          </Link>
        }
      />

      {/* ── Summary cards ───────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10">
              <Banknote className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Toplam
              </p>
              <p className="text-lg font-bold text-white tabular-nums">
                {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Tamamlanan
              </p>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">
                {formatCurrency(completedAmount)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <CalendarDays className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Bekleyen
              </p>
              <p className="text-lg font-bold text-amber-400 tabular-nums">
                {formatCurrency(pendingAmount)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? allPayments.length
              : allPayments.filter((p) => p.status === f.key).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200",
                statusFilter === f.key
                  ? f.active
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  statusFilter === f.key
                    ? "bg-white/10"
                    : "bg-slate-800 text-slate-600",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        <span className="w-px h-5 bg-slate-800 mx-1" />

        {/* Method filter pills */}
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">Tüm Yöntemler</option>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filteredPayments}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Ödeme kaydı bulunamadı"
        emptyDescription="Yeni bir ödeme kaydı oluşturarak başlayın."
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

      {/* ── New payment modal ───────────────────── */}
      <Modal
        isOpen={createOpen}
        onClose={closeModal}
        title="Yeni Ödeme Kaydı"
        description="Tahsilat veya ödeme bilgilerini girin."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={closeModal}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={createPayment.isPending}
              leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={handleSubmit(onSubmit)}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20"
            >
              Ödemeyi Kaydet
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* ── Step 1: Payment method ──────────── */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-violet-500/10">
                <Banknote className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-xs font-semibold text-white">
                Ödeme Yöntemi
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = selectedMethod === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() =>
                      setValue("method", m.value as PaymentForm["method"])
                    }
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200",
                      active
                        ? `${m.bg} ${m.border} ring-2 ${m.ring}`
                        : "border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5",
                        active ? m.color : "text-slate-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        active ? m.color : "text-slate-500",
                      )}
                    >
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Step 2: Amount (prominent) ──────── */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-xs font-semibold text-white">
                Tutar & Tarih
              </span>
            </div>
            <div className="mb-3">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Ödeme Tutarı (₺)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="0"
                className={cn(
                  "w-full bg-slate-800 border rounded-xl text-2xl font-bold text-center tabular-nums py-4 px-4",
                  "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors",
                  errors.amount
                    ? "border-red-500 text-red-400"
                    : "border-slate-700 text-emerald-400",
                )}
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-[10px] text-red-400 mt-1 text-center">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <FormRow cols={2}>
              <Input
                label="Tarih"
                required
                type="date"
                error={errors.date?.message}
                prefixIcon={<CalendarDays className="w-3.5 h-3.5" />}
                {...register("date")}
              />
              <Select
                label="Cari"
                options={contactOptions}
                {...register("contactId")}
              />
            </FormRow>
          </div>

          {/* ── Step 3: Account & reference ─────── */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <Landmark className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <span className="text-xs font-semibold text-white">
                Hesap & Detaylar
              </span>
            </div>
            <div className="space-y-3">
              {isBankMethod && (
                <Select
                  label="Banka Hesabı"
                  options={bankOptions}
                  {...register("bankAccountId")}
                />
              )}
              {isCashMethod && (
                <Select
                  label="Kasa Hesabı"
                  options={cashOptions}
                  {...register("cashAccountId")}
                />
              )}
              {!isBankMethod && !isCashMethod && (
                <FormRow cols={2}>
                  <Select
                    label="Banka Hesabı"
                    options={bankOptions}
                    {...register("bankAccountId")}
                  />
                  <Select
                    label="Kasa Hesabı"
                    options={cashOptions}
                    {...register("cashAccountId")}
                  />
                </FormRow>
              )}
              <FormRow cols={2}>
                <Input
                  label="Referans No"
                  placeholder="Dekont no, çek no…"
                  prefixIcon={<Hash className="w-3.5 h-3.5" />}
                  {...register("reference")}
                />
                <Input
                  label="Notlar"
                  placeholder="Açıklama…"
                  prefixIcon={<StickyNote className="w-3.5 h-3.5" />}
                  {...register("notes")}
                />
              </FormRow>
            </div>
          </div>

          {/* ── Summary card ──────────────────── */}
          <div
            className={cn(
              "flex items-center gap-3 p-4 rounded-xl border",
              activeMethod.bg,
              activeMethod.border,
            )}
          >
            <div className={cn("p-2.5 rounded-lg", activeMethod.bg)}>
              <activeMethod.icon
                className={cn("w-5 h-5", activeMethod.color)}
              />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-400">
                <span className={cn("font-semibold", activeMethod.color)}>
                  {activeMethod.label}
                </span>{" "}
                yöntemiyle ödeme
              </p>
              {Number(watch("amount") || 0) > 0 && (
                <p className="text-lg font-bold text-white tabular-nums mt-0.5">
                  {formatCurrency(Number(watch("amount")))}
                </p>
              )}
            </div>
            {contacts.find((c) => c.id === watch("contactId")) && (
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Cari</p>
                <p className="text-xs text-slate-300 font-medium">
                  {contacts.find((c) => c.id === watch("contactId"))?.name}
                </p>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
