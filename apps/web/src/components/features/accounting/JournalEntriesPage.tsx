"use client";
"use no memo";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Save,
  X,
  FileText,
  StickyNote,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Check,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { FeaturePageShell } from "@/components/shared/FeaturePageShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  useJournalEntries,
  useCreateJournalEntry,
  useLedgerAccounts,
} from "@/hooks/useAccounting";
import {
  postJournalEntry,
  updateJournalEntry,
  reverseJournalEntry,
} from "@/services/accounting.service";
import { cn, formatCurrency } from "@/lib/utils";
import {
  applyServerFieldErrors,
  isSubmitLocked,
  useDirtyStateWarning,
} from "@/lib/form-standard";
import { useUIStore } from "@/store/ui.store";
import { getErrorMessage } from "@/types/api.types";
import type { JournalEntry } from "@/services/accounting.service";
import {
  JournalEntryStatusFilters,
  filterJournalEntries,
} from "./journal-entries/JournalEntryStatusFilters";
import {
  JournalEntryTable,
  createJournalEntryColumns,
} from "./journal-entries/columns";
import {
  JOURNAL_ENTRY_FORM_DEFAULT_VALUES,
  JOURNAL_ENTRY_SERVER_FIELDS,
  journalEntryToFormDefaults,
  journalEntrySchema,
  toJournalEntryPayload,
  type JournalEntryForm,
  type JournalEntryStatusFilter,
} from "./journal-entries/schema";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function JournalEntriesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useJournalEntries({ page, limit: 20 });
  const createEntry = useCreateJournalEntry();
  const { data: accounts = [] } = useLedgerAccounts();
  const { toast } = useUIStore();
  const queryClient = useQueryClient();

  const postEntry = useMutation({
    mutationFn: (id: string) => postJournalEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["accounting", "journal-entries"],
      });
      toast.success("Fiş onaylandı.");
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const updateEntry = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        date: string;
        description?: string;
        lines: {
          accountId: string;
          debit: number;
          credit: number;
          description?: string;
        }[];
      };
    }) => updateJournalEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["accounting", "journal-entries"],
      });
      toast.success("Fiş güncellendi.");
      setEditEntry(null);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const reverseEntry = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reverseJournalEntry(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["accounting", "journal-entries"],
      });
      toast.success("Ters kayıt oluşturuldu.");
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);

  const accountOptions = [
    { value: "", label: "— Hesap seçin —" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ];

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JournalEntryForm>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: JOURNAL_ENTRY_FORM_DEFAULT_VALUES,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = useWatch({ control, name: "lines" }) ?? [];
  const watchedDate = useWatch({ control, name: "date" });
  useDirtyStateWarning(createOpen && isDirty && !createEntry.isSuccess);

  const totalDebit = watchedLines.reduce(
    (s, l) => s + (Number(l.debit) || 0),
    0,
  );
  const totalCredit = watchedLines.reduce(
    (s, l) => s + (Number(l.credit) || 0),
    0,
  );
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.001 && (totalDebit > 0 || totalCredit > 0);

  const closeModal = () => {
    setCreateOpen(false);
    reset();
  };

  const onSubmit = (data: JournalEntryForm) => {
    if (isSubmitLocked(isSubmitting, createEntry.isPending)) return;
    createEntry.mutate(
      toJournalEntryPayload(data),
      {
        onSuccess: closeModal,
        onError: (error) => {
          applyServerFieldErrors<JournalEntryForm>(error, setError, JOURNAL_ENTRY_SERVER_FIELDS);
        },
      },
    );
  };

  const [statusFilter, setStatusFilter] = useState<JournalEntryStatusFilter>("all");
  const allEntries = data?.data ?? [];
  const filteredEntries = filterJournalEntries(allEntries, statusFilter);
  const columns = createJournalEntryColumns({
    onEdit: setEditEntry,
    onPost: (id) => postEntry.mutate(id),
    onReverse: (id, reason) => reverseEntry.mutate({ id, reason }),
    onReverseReasonMissing: () => toast.error("Ters kayit nedeni zorunludur."),
  });
  return (
    <FeaturePageShell
        title="Yevmiye Fişleri"
        subtitle="Manuel muhasebe kayıtlarını yönetin."
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
            Yeni Fiş
          </Link>
        }
    >

      <JournalEntryStatusFilters
        entries={allEntries}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      <JournalEntryTable
        columns={columns}
        entries={filteredEntries}
        isLoading={isLoading}
        page={page}
        total={data?.meta.total ?? 0}
        totalPages={data?.meta.totalPages ?? 1}
        onPageChange={setPage}
      />
      {/* ── New journal entry modal ─────────────── */}
      <Modal
        isOpen={createOpen}
        onClose={closeModal}
        title="Yeni Yevmiye Fişi"
        description="Borç ve alacak toplamları eşit olmalıdır."
        size="lg"
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
              loading={createEntry.isPending}
              disabled={!isBalanced}
              leftIcon={
                isBalanced ? (
                  <Save className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )
              }
              onClick={handleSubmit(onSubmit)}
              className={
                isBalanced
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20"
                  : ""
              }
            >
              {isBalanced
                ? "Fişi Kaydet"
                : `Dengesiz (${formatCurrency(diff)})`}
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* ── Entry info ─────────────────────── */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <FileText className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <span className="text-xs font-semibold text-white">
                Fiş Bilgileri
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker
                label="Tarih"
                required
                value={watchedDate}
                error={errors.date?.message}
                onValueChange={(value) => setValue("date", value ?? "", { shouldDirty: true, shouldValidate: true })}
                clearable={false}
              />
              <Input
                label="Açıklama"
                placeholder="Fiş açıklaması…"
                prefixIcon={<StickyNote className="w-3.5 h-3.5" />}
                {...register("description")}
              />
            </div>
          </div>

          {/* ── Lines ──────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-violet-500/10">
                  <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-xs font-semibold text-white">
                  Fiş Satırları
                </span>
              </div>
              <span className="text-[10px] font-medium text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
                {fields.length} satır
              </span>
            </div>

            <div className="space-y-2">
              {fields.map((field, idx) => {
                const debit = Number(watchedLines[idx]?.debit || 0);
                const credit = Number(watchedLines[idx]?.credit || 0);
                const isDebit = debit > 0;
                const isCredit = credit > 0;

                return (
                  <div
                    key={field.id}
                    className={cn(
                      "relative bg-slate-800/30 border rounded-xl p-3.5 transition-colors",
                      isDebit
                        ? "border-emerald-500/10"
                        : isCredit
                          ? "border-red-500/10"
                          : "border-slate-800",
                    )}
                  >
                    {/* Row number */}
                    <div className="absolute -left-0 top-3.5 w-5 h-5 rounded-r-md bg-slate-800 flex items-center justify-center">
                      <span className="text-[9px] font-bold text-slate-500">
                        {idx + 1}
                      </span>
                    </div>

                    <div className="grid grid-cols-12 gap-2.5 items-start ml-3">
                      {/* Account */}
                      <div className="col-span-4">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                          Hesap
                        </label>
                        <select
                          className={cn(
                            "w-full bg-slate-800 border rounded-lg text-sm text-white px-2.5 py-2",
                            "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-colors",
                            errors.lines?.[idx]?.accountId
                              ? "border-red-500"
                              : "border-slate-700",
                          )}
                          {...register(`lines.${idx}.accountId`)}
                        >
                          {accountOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {errors.lines?.[idx]?.accountId && (
                          <p className="text-[10px] text-red-400 mt-0.5">
                            {errors.lines?.[idx]?.accountId?.message}
                          </p>
                        )}
                      </div>
                      {/* Debit */}
                      <div className="col-span-2">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                          Borç
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          className={cn(
                            "w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-right tabular-nums px-2.5 py-2",
                            "focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors",
                            isDebit ? "text-emerald-400" : "text-white",
                          )}
                          {...register(`lines.${idx}.debit`)}
                        />
                      </div>
                      {/* Credit */}
                      <div className="col-span-2">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <ArrowDownRight className="w-2.5 h-2.5 text-red-500" />
                          Alacak
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          className={cn(
                            "w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-right tabular-nums px-2.5 py-2",
                            "focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors",
                            isCredit ? "text-red-400" : "text-white",
                          )}
                          {...register(`lines.${idx}.credit`)}
                        />
                      </div>
                      {/* Description */}
                      <div className="col-span-3">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                          Açıklama
                        </label>
                        <input
                          placeholder="Satır notu…"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                          {...register(`lines.${idx}.description`)}
                        />
                      </div>
                      {/* Delete */}
                      <div className="col-span-1 flex justify-end pt-5">
                        {fields.length > 2 && (
                          <button
                            type="button"
                            onClick={() => remove(idx)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add line */}
              <button
                type="button"
                onClick={() =>
                  append({ accountId: "", debit: "0", credit: "0" })
                }
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-700/50 rounded-xl text-xs font-medium text-slate-400 hover:text-violet-400 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Satır Ekle
              </button>
            </div>
          </div>

          {/* ── Balance summary ────────────────── */}
          <div
            className={cn(
              "flex items-center gap-4 p-3.5 rounded-xl border transition-colors",
              isBalanced
                ? "bg-emerald-500/5 border-emerald-500/15"
                : "bg-red-500/5 border-red-500/15",
            )}
          >
            <div
              className={cn(
                "p-2 rounded-lg",
                isBalanced ? "bg-emerald-500/10" : "bg-red-500/10",
              )}
            >
              {isBalanced ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Scale className="w-4 h-4 text-red-400" />
              )}
            </div>
            <div className="flex-1 grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Toplam Borç
                </p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">
                  {formatCurrency(totalDebit)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Toplam Alacak
                </p>
                <p className="text-sm font-bold text-red-400 tabular-nums">
                  {formatCurrency(totalCredit)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Fark
                </p>
                <p
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    isBalanced ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {isBalanced ? "✓ Dengeli" : formatCurrency(diff)}
                </p>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Edit draft modal ────────────────────── */}
      {editEntry && (
        <EditJournalEntryModal
          entry={editEntry}
          accounts={accounts}
          onClose={() => setEditEntry(null)}
          onSave={(data) => updateEntry.mutate({ id: editEntry.id, data })}
          isPending={updateEntry.isPending}
        />
      )}
    </FeaturePageShell>
  );
}

// ─────────────────────────────────────────────
// Edit modal sub-component
// ─────────────────────────────────────────────

function EditJournalEntryModal({
  entry,
  accounts,
  onClose,
  onSave,
  isPending,
}: {
  entry: JournalEntry;
  accounts: { id: string; code: string; name: string }[];
  onClose: () => void;
  onSave: (data: {
    date: string;
    description?: string;
    lines: {
      accountId: string;
      debit: number;
      credit: number;
      description?: string;
    }[];
  }) => void;
  isPending: boolean;
}) {
  const accountOptions = [
    { value: "", label: "— Hesap seçin —" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ];

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<JournalEntryForm>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: journalEntryToFormDefaults(entry),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = useWatch({ control, name: "lines" }) ?? [];
  const watchedDate = useWatch({ control, name: "date" });

  const totalDebit = watchedLines.reduce(
    (s, l) => s + (Number(l.debit) || 0),
    0,
  );
  const totalCredit = watchedLines.reduce(
    (s, l) => s + (Number(l.credit) || 0),
    0,
  );
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.001 && (totalDebit > 0 || totalCredit > 0);

  const handleSave = (data: JournalEntryForm) => {
    onSave(toJournalEntryPayload(data));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Fiş Düzenle — ${entry.number}`}
      description="Taslak fişi düzenleyin."
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<X className="w-3.5 h-3.5" />}
            onClick={onClose}
          >
            İptal
          </Button>
          <Button
            size="sm"
            loading={isPending}
            disabled={!isBalanced}
            leftIcon={
              isBalanced ? (
                <Save className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )
            }
            onClick={handleSubmit(handleSave)}
            className={
              isBalanced
                ? "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20"
                : ""
            }
          >
            {isBalanced ? "Güncelle" : `Dengesiz (${formatCurrency(diff)})`}
          </Button>
        </>
      }
    >
      <form className="space-y-5">
        {/* ── Entry info card ──────────────────── */}
        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-sky-500/10">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <span className="text-xs font-semibold text-white">
              Fiş Bilgileri
            </span>
            <Badge variant="warning" className="ml-auto">
              Taslak
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="Tarih"
              required
              value={watchedDate}
              error={errors.date?.message}
              onValueChange={(value) => setValue("date", value ?? "", { shouldDirty: true, shouldValidate: true })}
              clearable={false}
            />
            <Input
              label="Açıklama"
              placeholder="Fiş açıklaması…"
              prefixIcon={<StickyNote className="w-3.5 h-3.5" />}
              {...register("description")}
            />
          </div>
        </div>

        {/* ── Lines section ────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10">
                <BookOpen className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-xs font-semibold text-white">
                Fiş Satırları
              </span>
            </div>
            <span className="text-[10px] font-medium text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
              {fields.length} satır
            </span>
          </div>

          <div className="space-y-2">
            {fields.map((field, idx) => {
              const debit = Number(watchedLines[idx]?.debit || 0);
              const credit = Number(watchedLines[idx]?.credit || 0);
              const isDebit = debit > 0;
              const isCredit = credit > 0;

              return (
                <div
                  key={field.id}
                  className={cn(
                    "relative bg-slate-800/30 border rounded-xl p-4 transition-colors",
                    isDebit
                      ? "border-emerald-500/15"
                      : isCredit
                        ? "border-red-500/15"
                        : "border-slate-800",
                  )}
                >
                  {/* Row number + type indicator */}
                  <div className="absolute -left-0 top-4 w-6 h-6 rounded-r-lg bg-slate-800 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-500">
                      {idx + 1}
                    </span>
                  </div>

                  <div className="ml-4 space-y-3">
                    {/* Top: account + delete */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                          Hesap
                        </label>
                        <select
                          className={cn(
                            "w-full bg-slate-800 border rounded-lg text-sm text-white px-3 py-2.5",
                            "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-colors",
                            errors.lines?.[idx]?.accountId
                              ? "border-red-500"
                              : "border-slate-700",
                          )}
                          {...register(`lines.${idx}.accountId`)}
                        >
                          {accountOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {errors.lines?.[idx]?.accountId && (
                          <p className="text-[10px] text-red-400 mt-0.5">
                            {errors.lines?.[idx]?.accountId?.message}
                          </p>
                        )}
                      </div>
                      {fields.length > 2 && (
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          className="mt-6 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Bottom: debit, credit, description */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                          Borç
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          className={cn(
                            "w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-right tabular-nums px-3 py-2",
                            "focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors",
                            isDebit
                              ? "text-emerald-400 border-emerald-500/20"
                              : "text-white",
                          )}
                          {...register(`lines.${idx}.debit`)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <ArrowDownRight className="w-2.5 h-2.5 text-red-500" />
                          Alacak
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          className={cn(
                            "w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-right tabular-nums px-3 py-2",
                            "focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors",
                            isCredit
                              ? "text-red-400 border-red-500/20"
                              : "text-white",
                          )}
                          {...register(`lines.${idx}.credit`)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <StickyNote className="w-2.5 h-2.5" />
                          Açıklama
                        </label>
                        <input
                          placeholder="Satır notu…"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                          {...register(`lines.${idx}.description`)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => append({ accountId: "", debit: "0", credit: "0" })}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700/50 rounded-xl text-xs font-medium text-slate-400 hover:text-violet-400 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Satır Ekle
            </button>
          </div>
        </div>

        {/* ── Balance summary ──────────────────── */}
        <div
          className={cn(
            "flex items-center gap-4 p-4 rounded-xl border transition-colors",
            isBalanced
              ? "bg-emerald-500/5 border-emerald-500/15"
              : "bg-red-500/5 border-red-500/15",
          )}
        >
          <div
            className={cn(
              "p-2.5 rounded-lg",
              isBalanced ? "bg-emerald-500/10" : "bg-red-500/10",
            )}
          >
            {isBalanced ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <Scale className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Toplam Borç
              </p>
              <p className="text-base font-bold text-emerald-400 tabular-nums">
                {formatCurrency(totalDebit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Toplam Alacak
              </p>
              <p className="text-base font-bold text-red-400 tabular-nums">
                {formatCurrency(totalCredit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Fark
              </p>
              <p
                className={cn(
                  "text-base font-bold tabular-nums",
                  isBalanced ? "text-emerald-400" : "text-red-400",
                )}
              >
                {isBalanced ? "✓ Dengeli" : formatCurrency(diff)}
              </p>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
