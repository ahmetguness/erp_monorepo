"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Tag, X, Save } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormRow, FormSection } from "@/components/shared/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  useContact,
  useCreateContact,
  useUpdateContact,
} from "@/hooks/useContacts";

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const contactSchema = z.object({
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]),
  name: z.string().min(1, "Ad zorunludur").max(200, "Maksimum 200 karakter"),
  code: z.string().optional(),
  taxNumber: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{10,11}$/.test(v), {
      message: "Vergi no 10 veya 11 haneli olmalıdır",
    }),
  taxOffice: z.string().optional(),
  email: z
    .string()
    .email("Geçerli bir e-posta adresi girin")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || /^[\d\s\+\-\(\)]{7,20}$/.test(v), {
      message: "Geçerli bir telefon numarası girin",
    }),
  website: z.string().url("Geçerli bir URL girin").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  creditLimit: z.string().optional(),
  paymentTermDays: z.string().optional(),
  notes: z.string().max(1000, "Maksimum 1000 karakter").optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const TYPE_OPTIONS = [
  { value: "CUSTOMER", label: "Müşteri" },
  { value: "SUPPLIER", label: "Tedarikçi" },
  { value: "BOTH", label: "Her İkisi" },
];

const PAYMENT_TERM_PRESETS = [
  { value: "", label: "Özel giriş" },
  { value: "0", label: "Peşin" },
  { value: "7", label: "7 gün" },
  { value: "15", label: "15 gün" },
  { value: "30", label: "30 gün" },
  { value: "45", label: "45 gün" },
  { value: "60", label: "60 gün" },
  { value: "90", label: "90 gün" },
];

const SUGGESTED_TAGS = ["VIP", "Riskli", "Yeni", "Kamu", "İhracat", "İthalat"];

const TYPE_HINTS: Record<string, string> = {
  CUSTOMER: "Satış yapılan müşteri hesabı",
  SUPPLIER: "Satın alma yapılan tedarikçi hesabı",
  BOTH: "Hem müşteri hem tedarikçi olarak kullanılır",
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props {
  editId?: string;
}

export function ContactFormPage({ editId }: Props) {
  const router = useRouter();
  const isEdit = !!editId;

  const { data: existing, isLoading: loadingExisting } = useContact(
    editId ?? "",
  );
  const createContact = useCreateContact();
  const updateContact = useUpdateContact(editId ?? "");

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [paymentTermMode, setPaymentTermMode] = useState<"preset" | "custom" | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { type: "CUSTOMER", country: "TR", paymentTermDays: "30" },
  });

  const watchType = useWatch({ control, name: "type" });
  const watchPaymentTerm = useWatch({ control, name: "paymentTermDays" });
  const isPresetPaymentTerm = PAYMENT_TERM_PRESETS.some((p) => p.value === (watchPaymentTerm ?? ""));
  const usePresetTerm = paymentTermMode ? paymentTermMode === "preset" : isPresetPaymentTerm;

  // Populate form when editing
  useEffect(() => {
    if (existing) {
      const termStr =
        existing.paymentTermDays != null
          ? String(existing.paymentTermDays)
          : "";

      reset({
        type: existing.type,
        name: existing.name,
        code: existing.code ?? "",
        taxNumber: existing.taxNumber ?? "",
        taxOffice: existing.taxOffice ?? "",
        email: existing.email ?? "",
        phone: existing.phone ?? "",
        website: existing.website ?? "",
        address: existing.address ?? "",
        city: existing.city ?? "",
        country: existing.country,
        creditLimit:
          existing.creditLimit != null ? String(existing.creditLimit) : "",
        paymentTermDays: termStr,
        notes: existing.notes ?? "",
      });
    }
  }, [existing, reset]);

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const onSubmit = (data: ContactFormData) => {
    const payload = {
      type: data.type,
      name: data.name,
      code: data.code || undefined,
      taxNumber: data.taxNumber || undefined,
      taxOffice: data.taxOffice || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      website: data.website || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      country: data.country || "TR",
      creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
      paymentTermDays: data.paymentTermDays
        ? Number(data.paymentTermDays)
        : undefined,
      notes: data.notes || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    if (isEdit) {
      updateContact.mutate(payload, {
        onSuccess: () => router.push(`/dashboard/contacts/${editId}`),
      });
    } else {
      createContact.mutate(payload, {
        onSuccess: (c) => router.push(`/dashboard/contacts/${c.id}`),
      });
    }
  };

  if (isEdit && loadingExisting) return <FullPageSpinner />;

  const isPending = createContact.isPending || updateContact.isPending;

  return (
    <div>
      <PageHeader
        title={isEdit ? "Cari Hesap Düzenle" : "Yeni Cari Hesap"}
        action={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => router.back()}
            >
              Geri
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-5xl">
        {/* Two-column master layout: form left, sidebar right */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Main form — 3 cols */}
          <div className="lg:col-span-3 space-y-5">
            {/* Basic Info */}
            <FormSection
              title="Temel Bilgiler"
              description="Cari hesap tipi ve kimlik bilgileri"
            >
              <FormRow cols={3}>
                <div>
                  <Select
                    label="Tip"
                    required
                    options={TYPE_OPTIONS}
                    error={errors.type?.message}
                    {...register("type")}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {TYPE_HINTS[watchType] ?? ""}
                  </p>
                </div>
                <Input
                  label="Ad / Ünvan"
                  required
                  placeholder="Şirket veya kişi adı"
                  error={errors.name?.message}
                  {...register("name")}
                />
                <Input
                  label="Hesap Kodu"
                  placeholder={isEdit ? "" : "Otomatik oluşturulur"}
                  helperText={
                    !isEdit
                      ? "Boş bırakırsanız otomatik atanır (ör: MUS00001)"
                      : undefined
                  }
                  error={errors.code?.message}
                  {...register("code")}
                />
              </FormRow>
              <FormRow cols={2}>
                <Input
                  label="Vergi / TC Kimlik No"
                  placeholder="1234567890"
                  error={errors.taxNumber?.message}
                  {...register("taxNumber")}
                />
                <Input
                  label="Vergi Dairesi"
                  placeholder="Kadıköy"
                  error={errors.taxOffice?.message}
                  {...register("taxOffice")}
                />
              </FormRow>
            </FormSection>

            {/* Contact Info */}
            <FormSection title="İletişim Bilgileri">
              <FormRow cols={3}>
                <Input
                  label="E-posta"
                  type="email"
                  placeholder="info@sirket.com"
                  error={errors.email?.message}
                  {...register("email")}
                />
                <Input
                  label="Telefon"
                  placeholder="+90 (555) 000 00 00"
                  error={errors.phone?.message}
                  {...register("phone")}
                />
                <Input
                  label="Website"
                  placeholder="https://sirket.com"
                  error={errors.website?.message}
                  {...register("website")}
                />
              </FormRow>
              <Input
                label="Adres"
                placeholder="Mahalle, Sokak, No, Bina"
                error={errors.address?.message}
                {...register("address")}
              />
              <FormRow cols={2}>
                <Input
                  label="Şehir"
                  placeholder="İstanbul"
                  error={errors.city?.message}
                  {...register("city")}
                />
                <Input
                  label="Ülke"
                  placeholder="TR"
                  error={errors.country?.message}
                  {...register("country")}
                />
              </FormRow>
            </FormSection>

            {/* Commercial Terms */}
            <FormSection
              title="Ticari Koşullar"
              description="Kredi limiti ve ödeme vade bilgileri"
            >
              <FormRow cols={2}>
                <Input
                  label="Kredi Limiti (₺)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="50000"
                  error={errors.creditLimit?.message}
                  {...register("creditLimit")}
                />
                <div>
                  {usePresetTerm ? (
                    <Select
                      label="Ödeme Vadesi"
                      options={PAYMENT_TERM_PRESETS}
                      value={watchPaymentTerm ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setPaymentTermMode("custom");
                          setValue("paymentTermDays", "", {
                            shouldDirty: true,
                          });
                        } else {
                          setValue("paymentTermDays", v, { shouldDirty: true });
                        }
                      }}
                    />
                  ) : (
                    <div>
                      <Input
                        label="Ödeme Vadesi (gün)"
                        type="number"
                        min="0"
                        placeholder="45"
                        error={errors.paymentTermDays?.message}
                        {...register("paymentTermDays")}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentTermMode("preset");
                          if (!isPresetPaymentTerm) {
                            setValue("paymentTermDays", "30", { shouldDirty: true });
                          }
                        }}
                        className="text-[10px] text-sky-400 hover:text-sky-300 mt-1"
                      >
                        Hazır seçeneklerden seç →
                      </button>
                    </div>
                  )}
                </div>
              </FormRow>
            </FormSection>

            {/* Notes */}
            <FormSection title="Notlar">
              <Textarea
                placeholder="Ek notlar, özel anlaşmalar, dikkat edilecek hususlar…"
                rows={3}
                {...register("notes")}
              />
              {errors.notes && (
                <p className="text-xs text-red-400">{errors.notes.message}</p>
              )}
            </FormSection>
          </div>

          {/* Sidebar — 1 col */}
          <div className="space-y-5">
            {/* Tags */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Etiketler
              </h3>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="info" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Input
                  placeholder="Etiket ekle…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  className="text-xs !py-1.5"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addTag(tagInput)}
                  className="shrink-0"
                >
                  <Tag className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Info (edit mode) */}
            {isEdit && existing && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Hesap Bilgisi
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Durum</span>
                    <span
                      className={
                        existing.isActive
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }
                    >
                      {existing.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  {existing.financials && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Bakiye</span>
                        <span
                          className={
                            existing.financials.currentBalance >= 0
                              ? "text-emerald-400 font-medium"
                              : "text-red-400 font-medium"
                          }
                        >
                          {existing.financials.currentBalance >= 0 ? "+" : ""}
                          {existing.financials.currentBalance.toLocaleString(
                            "tr-TR",
                            { style: "currency", currency: "TRY" },
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Açık Fatura</span>
                        <span className="text-slate-300">
                          {existing.financials.openInvoiceCount}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Save actions — sticky on sidebar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2 lg:sticky lg:top-6">
              <Button
                type="submit"
                loading={isPending}
                className="w-full"
                leftIcon={<Save className="w-4 h-4" />}
              >
                {isEdit ? "Güncelle" : "Kaydet"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => router.back()}
              >
                İptal
              </Button>
              {isDirty && (
                <p className="text-[10px] text-amber-400 text-center">
                  Kaydedilmemiş değişiklikler var
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
