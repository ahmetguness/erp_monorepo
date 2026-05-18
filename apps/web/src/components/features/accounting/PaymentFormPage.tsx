"use client";

import { useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Coins,
  CreditCard,
  FileText,
  Landmark,
  ReceiptText,
  Save,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  BankAccountSelect,
  CashAccountSelect,
  ContactSelect,
  InvoiceSelect,
} from "@/components/shared/EntitySelect";
import { FormField, FormRow } from "@/components/shared/FormField";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useCreatePayment } from "@/hooks/useAccounting";
import { useInvoices } from "@/hooks/useSales";
import { cn, formatCurrency, formatDate, todayInputDate } from "@/lib/utils";
import type {
  CreatePaymentDTO,
  PaymentDirection,
  PaymentMethod,
} from "@/services/accounting.service";
import type { ContactType } from "@/services/contact.service";
import type { InvoiceStatus, InvoiceType } from "@/services/sales.service";

const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
  icon: typeof Coins;
}> = [
  { value: "CASH", label: "Nakit", icon: Coins },
  { value: "BANK_TRANSFER", label: "Havale/EFT", icon: Landmark },
  { value: "CREDIT_CARD", label: "Kredi Kartı", icon: CreditCard },
  { value: "CHECK", label: "Çek", icon: ReceiptText },
  { value: "PROMISSORY_NOTE", label: "Senet", icon: FileText },
  { value: "OTHER", label: "Diğer", icon: Banknote },
];

const OPEN_INVOICE_STATUSES: InvoiceStatus[] = [
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
];

const PAYMENT_DIRECTIONS: Array<{
  value: PaymentDirection;
  label: string;
  icon: typeof ArrowDownLeft;
}> = [
  { value: "RECEIVE", label: "Tahsilat", icon: ArrowDownLeft },
  { value: "SEND", label: "Ödeme", icon: ArrowUpRight },
];

const ACCOUNT_TYPES: Array<{
  value: "CASH" | "BANK";
  label: string;
  icon: typeof Coins;
}> = [
  { value: "CASH", label: "Kasa", icon: Coins },
  { value: "BANK", label: "Banka", icon: Landmark },
];

const paymentFormSchema = z
  .object({
    direction: z.enum(["RECEIVE", "SEND"]),
    contactId: z.string().min(1, "Cari seçimi zorunlu"),
    invoiceId: z.string().optional(),
    accountType: z.enum(["CASH", "BANK"]),
    cashAccountId: z.string().optional(),
    bankAccountId: z.string().optional(),
    method: z.enum([
      "CASH",
      "BANK_TRANSFER",
      "CREDIT_CARD",
      "CHECK",
      "PROMISSORY_NOTE",
      "OTHER",
    ]),
    date: z.string().min(1, "Tarih zorunlu"),
    amount: z
      .string()
      .min(1, "Tutar zorunlu")
      .refine((value) => Number(value) > 0, "Tutar 0'dan büyük olmalı"),
    allocationAmount: z
      .string()
      .optional()
      .refine(
        (value) => !value || Number(value) > 0,
        "Tahsis tutarı 0'dan büyük olmalı",
      ),
    reference: z.string().max(80, "Referans en fazla 80 karakter olabilir").optional(),
    notes: z.string().max(500, "Not en fazla 500 karakter olabilir").optional(),
  })
  .superRefine((values, ctx) => {
    if (values.accountType === "CASH" && !values.cashAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["cashAccountId"],
        message: "Kasa hesabı seçin",
      });
    }

    if (values.accountType === "BANK" && !values.bankAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["bankAccountId"],
        message: "Banka hesabı seçin",
      });
    }

    const amount = Number(values.amount);
    const allocationAmount = values.allocationAmount
      ? Number(values.allocationAmount)
      : undefined;

    if (values.invoiceId && allocationAmount !== undefined && allocationAmount > amount) {
      ctx.addIssue({
        code: "custom",
        path: ["allocationAmount"],
        message: "Tahsis tutarı ödeme tutarını aşamaz",
      });
    }
  });

type PaymentFormValues = z.infer<typeof paymentFormSchema>;
type AccountType = PaymentFormValues["accountType"];

function getInitialDirection(type: string | null): PaymentDirection {
  return type === "send" ? "SEND" : "RECEIVE";
}

function invoiceTypeForDirection(direction: PaymentDirection): InvoiceType {
  return direction === "SEND" ? "PURCHASE" : "SALES";
}

function contactTypesForDirection(direction: PaymentDirection): ContactType[] {
  return direction === "SEND" ? ["SUPPLIER", "BOTH"] : ["CUSTOMER", "BOTH"];
}

function accountTypeForMethod(method: PaymentMethod): AccountType {
  return method === "CASH" ? "CASH" : "BANK";
}

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function PaymentFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createPayment = useCreatePayment();
  const didMount = useRef(false);

  const initialDirection = getInitialDirection(searchParams.get("type"));
  const initialContactId = searchParams.get("contactId") ?? "";
  const initialInvoiceId = searchParams.get("invoiceId") ?? "";

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      direction: initialDirection,
      contactId: initialContactId,
      invoiceId: initialInvoiceId,
      accountType: "CASH",
      cashAccountId: "",
      bankAccountId: "",
      method: "CASH",
      date: todayInputDate(),
      amount: "",
      allocationAmount: "",
      reference: "",
      notes: "",
    },
  });

  const direction = useWatch({ control, name: "direction" });
  const contactId = useWatch({ control, name: "contactId" });
  const invoiceId = useWatch({ control, name: "invoiceId" }) ?? "";
  const accountType = useWatch({ control, name: "accountType" });
  const method = useWatch({ control, name: "method" });
  const date = useWatch({ control, name: "date" });
  const amount = useWatch({ control, name: "amount" });
  const allocationAmount = useWatch({ control, name: "allocationAmount" }) ?? "";
  const cashAccountId = useWatch({ control, name: "cashAccountId" }) ?? "";
  const bankAccountId = useWatch({ control, name: "bankAccountId" }) ?? "";
  const invoiceType = invoiceTypeForDirection(direction);

  const { data: invoicesData } = useInvoices({
    page: 1,
    limit: 200,
    type: invoiceType,
    ...(contactId ? { contactId } : {}),
  });

  const selectedInvoice = useMemo(
    () => invoicesData?.data.find((invoice) => invoice.id === invoiceId),
    [invoiceId, invoicesData],
  );

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setValue("invoiceId", "", { shouldDirty: true, shouldValidate: true });
  }, [direction, setValue]);

  useEffect(() => {
    const nextAccountType = accountTypeForMethod(method);
    setValue("accountType", nextAccountType, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (nextAccountType === "CASH") {
      setValue("bankAccountId", "", { shouldDirty: true, shouldValidate: true });
    } else {
      setValue("cashAccountId", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [method, setValue]);

  useEffect(() => {
    if (selectedInvoice && selectedInvoice.contactId !== contactId) {
      setValue("contactId", selectedInvoice.contactId, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [contactId, selectedInvoice, setValue]);

  const directionConfig =
    direction === "RECEIVE"
      ? {
          title: "Tahsilat Al",
          subtitle: "Cari, fatura ve kasa/banka bilgisiyle tahsilat kaydedin.",
          icon: ArrowDownLeft,
          invoiceLabel: "Satış faturası",
        }
      : {
          title: "Ödeme Yap",
          subtitle: "Tedarikçi, fatura ve kasa/banka bilgisiyle ödeme kaydedin.",
          icon: ArrowUpRight,
          invoiceLabel: "Alış faturası",
        };
  const DirectionIcon = directionConfig.icon;

  const numericAmount = Number(amount || 0);
  const numericAllocation = invoiceId
    ? Number(allocationAmount || amount || 0)
    : 0;

  const onSubmit = (values: PaymentFormValues) => {
    const paymentAmount = Number(values.amount);
    const paymentAllocationAmount = values.invoiceId
      ? Number(values.allocationAmount || values.amount)
      : undefined;

    const payload: CreatePaymentDTO = {
      direction: values.direction,
      contactId: values.contactId,
      date: values.date,
      amount: paymentAmount,
      method: values.method,
      reference: trimToUndefined(values.reference),
      notes: trimToUndefined(values.notes),
      bankAccountId:
        values.accountType === "BANK" ? values.bankAccountId : undefined,
      cashAccountId:
        values.accountType === "CASH" ? values.cashAccountId : undefined,
      allocations:
        values.invoiceId && paymentAllocationAmount
          ? [{ invoiceId: values.invoiceId, amount: paymentAllocationAmount }]
          : undefined,
    };

    createPayment.mutate(payload, {
      onSuccess: () => router.push("/dashboard/payments"),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={directionConfig.title}
        subtitle={directionConfig.subtitle}
        action={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => router.back()}
          >
            Geri
          </Button>
        }
      />

      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="space-y-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  direction === "RECEIVE"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-rose-500/10 text-rose-400",
                )}
              >
                <DirectionIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  İşlem yönü
                </h2>
                <p className="text-xs text-slate-500">
                  Tahsilat müşteri borcunu, ödeme tedarikçi borcunu kapatır.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_DIRECTIONS.map((item) => {
                const Icon = item.icon;
                const active = direction === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setValue("direction", item.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                      active
                        ? "border-sky-500/50 bg-sky-500/10 text-white"
                        : "border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-700 hover:text-slate-200",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Cari ve fatura
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ID yazmadan cari ve açık faturayı seçin; kısmi ödeme için tahsis tutarını düşürün.
              </p>
            </div>

            <FormRow cols={2}>
              <ContactSelect
                label="Cari"
                required
                type={contactTypesForDirection(direction)}
                value={contactId}
                error={errors.contactId?.message}
                onChange={(value) =>
                  setValue("contactId", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              <InvoiceSelect
                label={directionConfig.invoiceLabel}
                value={invoiceId}
                contactId={contactId || undefined}
                type={invoiceType}
                statuses={OPEN_INVOICE_STATUSES}
                onChange={(value) =>
                  setValue("invoiceId", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </FormRow>

            {selectedInvoice && (
              <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/35 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] text-slate-500">Fatura</p>
                  <p className="text-sm font-medium text-white">
                    {selectedInvoice.number}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Tarih</p>
                  <p className="text-sm text-slate-300">
                    {formatDate(selectedInvoice.date)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Durum</p>
                  <p className="text-sm text-slate-300">
                    {selectedInvoice.status}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Toplam</p>
                  <p className="text-sm font-semibold text-white">
                    {formatCurrency(selectedInvoice.totalGross)}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Tutar ve yöntem
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dekont veya referans bilgisini aynı kayıt üzerinde tutun.
              </p>
            </div>

            <FormRow cols={3}>
              <Input
                label="Tutar"
                required
                type="number"
                min="0"
                step="0.01"
                error={errors.amount?.message}
                prefixIcon={<Banknote className="h-4 w-4" />}
                {...register("amount")}
              />
              <DatePicker
                label="Tarih"
                required
                value={date}
                error={errors.date?.message}
                onValueChange={(value) =>
                  setValue("date", value ?? "", {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                clearable={false}
              />
              <Input
                label="Dekont / Referans"
                placeholder="Dekont no"
                error={errors.reference?.message}
                prefixIcon={<ReceiptText className="h-4 w-4" />}
                {...register("reference")}
              />
            </FormRow>

            {invoiceId && (
              <Input
                label="Faturaya tahsis edilecek tutar"
                type="number"
                min="0"
                step="0.01"
                helperText="Boş bırakılırsa ödeme tutarının tamamı faturaya tahsis edilir."
                error={errors.allocationAmount?.message}
                {...register("allocationAmount")}
              />
            )}

            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {PAYMENT_METHODS.map((item) => {
                const Icon = item.icon;
                const active = method === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setValue("method", item.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-colors",
                      active
                        ? "border-sky-500/50 bg-sky-500/10 text-white"
                        : "border-slate-800 bg-slate-950/35 text-slate-500 hover:border-slate-700 hover:text-slate-200",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Banka / kasa</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nakit işlemler kasa, diğer yöntemler banka hesabına bağlanır.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((item) => {
                const Icon = item.icon;
                const active = accountType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setValue("accountType", item.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                      active
                        ? "border-sky-500/50 bg-sky-500/10 text-white"
                        : "border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-700 hover:text-slate-200",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {accountType === "CASH" ? (
              <CashAccountSelect
                label="Kasa hesabı"
                required
                value={cashAccountId}
                error={errors.cashAccountId?.message}
                onChange={(value) =>
                  setValue("cashAccountId", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            ) : (
              <BankAccountSelect
                label="Banka hesabı"
                required
                value={bankAccountId}
                error={errors.bankAccountId?.message}
                onChange={(value) =>
                  setValue("bankAccountId", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            )}

            <Textarea
              label="Not"
              placeholder="Ödeme açıklaması"
              error={errors.notes?.message}
              {...register("notes")}
            />
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  direction === "RECEIVE"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-rose-500/10 text-rose-400",
                )}
              >
                <DirectionIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">İşlem özeti</p>
                <h3 className="text-base font-semibold text-white">
                  {directionConfig.title}
                </h3>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/35 p-4">
              <SummaryRow
                label="Tutar"
                value={numericAmount > 0 ? formatCurrency(numericAmount) : "-"}
              />
              <SummaryRow
                label="Tahsis"
                value={
                  numericAllocation > 0 ? formatCurrency(numericAllocation) : "-"
                }
              />
              <SummaryRow
                label="Yöntem"
                value={
                  PAYMENT_METHODS.find((item) => item.value === method)?.label ??
                  method
                }
              />
              <SummaryRow
                label="Hesap"
                value={accountType === "CASH" ? "Kasa" : "Banka"}
              />
              <SummaryRow
                label="Tarih"
                value={date ? formatDate(date) : "-"}
              />
            </div>

            <FormField error={errors.root?.message}>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => router.push("/dashboard/payments")}
                >
                  Vazgeç
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  loading={createPayment.isPending}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Kaydet
                </Button>
              </div>
            </FormField>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 text-slate-500" />
              <p className="text-xs leading-5 text-slate-500">
                Kayıt tamamlandığında ödeme muhasebe hareketine yazılır; seçili
                fatura varsa tahsis kaydı aynı işlemde oluşturulur.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-200 text-right">{value}</span>
    </div>
  );
}
