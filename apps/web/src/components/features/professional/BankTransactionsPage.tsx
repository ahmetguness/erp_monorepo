"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ListChecks, Plus, Sparkles, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { BankAccountSelect } from "@/components/shared/EntitySelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import {
  useBankTransactions,
  useApproveBankTransactionMatch,
  useBankTransactionMatchingWorkbench,
  useBankTransactionMatchSuggestions,
  useBulkApproveBankTransactionMatches,
  useCreateBankTransaction,
} from "@/hooks/useBankTransactions";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import type {
  BankTransaction,
  BankTransactionMatchSuggestion,
  BankTransactionType,
} from "@/services/bank-transaction.service";

const TYPE_MAP: Record<
  string,
  {
    label: string;
    variant: "success" | "danger" | "info" | "warning" | "neutral";
  }
> = {
  DEPOSIT: { label: "Yatırma", variant: "success" },
  WITHDRAWAL: { label: "Çekme", variant: "danger" },
  TRANSFER: { label: "Transfer", variant: "info" },
  FEE: { label: "Masraf", variant: "warning" },
  INTEREST: { label: "Faiz", variant: "success" },
  OTHER: { label: "Diğer", variant: "neutral" },
};

const MATCH_LABELS: Record<string, string> = {
  PAYMENT: "Odeme",
  INVOICE: "Fatura",
  CONTACT: "Cari",
  RECONCILIATION: "Mutabakat",
  OTHER: "Cari/Diğer",
};

const STRENGTH_MAP: Record<
  BankTransactionMatchSuggestion["strength"],
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  HIGH: { label: "Yuksek", variant: "success" },
  MEDIUM: { label: "Orta", variant: "warning" },
  LOW: { label: "Dusuk", variant: "neutral" },
};

export function BankTransactionsPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    bankAccountId: "",
    type: "DEPOSIT" as BankTransactionType,
    amount: "",
    balanceAfter: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    reference: "",
  });

  const { data, isLoading } = useBankTransactions({
    page,
    limit: 20,
    type: typeFilter || undefined,
  });
  const createTx = useCreateBankTransaction();
  const workbenchQuery = useBankTransactionMatchingWorkbench();
  const bulkApprove = useBulkApproveBankTransactionMatches();
  const suggestionsQuery = useBankTransactionMatchSuggestions(selectedTransaction?.id);
  const approveMatch = useApproveBankTransactionMatch();
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const pendingMatchCount = data?.data.filter((transaction) => !transaction.refType || !transaction.refId).length ?? 0;
  const workbench = workbenchQuery.data;
  const readyQueueIds = useMemo(
    () => workbench?.queue.filter((item) => item.status === "READY_FOR_APPROVAL").map((item) => item.transactionId) ?? [],
    [workbench?.queue],
  );
  const selectedReadyCount = selectedQueueIds.filter((id) => readyQueueIds.includes(id)).length;

  const columns: ColumnDef<BankTransaction>[] = [
    {
      key: "date",
      header: "Tarih",
      width: "100px",
      render: (r) => (
        <span className="text-slate-400 text-xs">{formatDate(r.date)}</span>
      ),
    },
    {
      key: "type",
      header: "Tip",
      width: "100px",
      render: (r) => {
        const t = TYPE_MAP[r.type];
        return t ? (
          <Badge variant={t.variant}>{t.label}</Badge>
        ) : (
          <span>{r.type}</span>
        );
      },
    },
    {
      key: "bankAccount",
      header: "Hesap",
      render: (r) => (
        <span className="text-slate-300 text-sm">
          {r.bankAccount?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "description",
      header: "Açıklama",
      render: (r) => (
        <span className="text-slate-400 text-xs truncate max-w-[200px] block">
          {r.description ?? "—"}
        </span>
      ),
    },
    {
      key: "reference",
      header: "Referans",
      width: "120px",
      render: (r) => (
        <span className="font-mono text-slate-500 text-xs">
          {r.reference ?? "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Tutar",
      width: "130px",
      align: "right",
      render: (r) => {
        const isIn = r.type === "DEPOSIT" || r.type === "INTEREST";
        return (
          <span
            className={`tabular-nums font-medium ${isIn ? "text-emerald-400" : "text-red-400"}`}
          >
            {isIn ? "+" : "-"}
            {formatCurrency(r.amount)}
          </span>
        );
      },
    },
    {
      key: "balanceAfter",
      header: "Bakiye",
      width: "130px",
      align: "right",
      render: (r) => (
        <span className="text-slate-200 tabular-nums">
          {formatCurrency(r.balanceAfter)}
        </span>
      ),
    },
    {
      key: "refType",
      header: "Eşleştirme",
      width: "150px",
      render: (r) => {
        if (r.refType && r.refId) {
          return (
            <Badge variant="success" dot>
              {MATCH_LABELS[r.refType] ?? r.refType}
            </Badge>
          );
        }
        return (
          <button
            type="button"
            onClick={() => setSelectedTransaction(r)}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            <Sparkles className="h-3 w-3" />
            Öner
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Banka Hareketleri"
        subtitle="Banka hesap hareketlerini takip edin ve yönetin."
        action={
          <button
            onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Hareket
          </button>
        }
      />
      <div className="flex items-center gap-3 mb-4">
        <Select
          label=""
          options={[
            { value: "", label: "Tüm Tipler" },
            ...Object.entries(TYPE_MAP).map(([k, v]) => ({
              value: k,
              label: v.label,
            })),
          ]}
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Banka hareketi eşleştirme otomasyonu</p>
              <p className="mt-1 text-xs text-slate-400">
                Ödeme, fatura ve cari hesap adayları tutar, tarih, referans ve açıklama sinyalleriyle skorlanır.
              </p>
            </div>
            <Badge variant={pendingMatchCount > 0 ? "warning" : "success"}>{pendingMatchCount} bekleyen</Badge>
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Manuel onay</p>
          <p className="mt-1 text-sm text-slate-300">
            Öneri butonuyla adayları açın, güven skorunu kontrol edip uygun eşleşmeyi onaylayın.
          </p>
        </div>
      </div>
      {workbench && (
        <section className="mb-4 space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Otomatik eslestirme kurallari</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Tutar, tarih, referans, cari ve banka hesabi sinyalleri birlikte skorlanir; sadece yuksek guvenli adaylar toplu onaya girer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">{workbench.summary.unmatched} eslesmeyen</Badge>
              <Badge variant="success">{workbench.summary.readyForBulkApproval} toplu onaya hazir</Badge>
              <Badge variant="warning">{workbench.summary.needsReview} inceleme</Badge>
              <Badge variant="neutral">{workbench.summary.noCandidate} adaysiz</Badge>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Eslesmeyen hareket kuyrugu</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={readyQueueIds.length === 0}
                  onClick={() => setSelectedQueueIds(readyQueueIds)}
                >
                  Hazir olanlari sec
                </Button>
              </div>
              <div className="max-h-80 divide-y divide-slate-800 overflow-y-auto">
                {workbench.queue.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">Eslesmeyen banka hareketi bulunmuyor.</div>
                ) : (
                  workbench.queue.map((item) => {
                    const isSelected = selectedQueueIds.includes(item.transactionId);
                    const isReady = item.status === "READY_FOR_APPROVAL";
                    return (
                      <label key={item.transactionId} className="flex cursor-pointer gap-3 p-3 hover:bg-slate-900/50">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isReady}
                          onChange={(event) => {
                            setSelectedQueueIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, item.transactionId])]
                                : current.filter((id) => id !== item.transactionId),
                            );
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={isReady ? "success" : item.status === "NEEDS_REVIEW" ? "warning" : "neutral"}>
                              {isReady ? "Toplu onay" : item.status === "NEEDS_REVIEW" ? "Manuel inceleme" : "Aday yok"}
                            </Badge>
                            {item.bestSuggestion && (
                              <span className="text-xs font-semibold text-slate-300">%{item.bestSuggestion.confidenceScore}</span>
                            )}
                            <span className="text-xs text-slate-500">{formatDate(item.date)}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium text-slate-200">{item.description ?? "Aciklamasiz hareket"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.bankAccountName ?? "Banka hesabi yok"} · {formatCurrency(item.amount)}
                          </p>
                          {item.bestSuggestion && (
                            <p className="mt-1 truncate text-xs text-sky-300">
                              {MATCH_LABELS[item.bestSuggestion.refType]}: {item.bestSuggestion.label}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Toplu onay politikasi</p>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-sm font-semibold text-white">
                  %{workbench.bulkApprovalPolicy.minConfidence}+ ve {STRENGTH_MAP[workbench.bulkApprovalPolicy.allowedStrength].label} guven
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Bu esigin altindaki hareketler kuyrukta kalir ve manuel oneriler modalindan onaylanir.
                </p>
              </div>
              <div className="space-y-2">
                {workbench.rules.map((rule) => (
                  <div key={rule.key} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-200">{rule.label}</p>
                      <Badge variant="info">{rule.weight} puan</Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{rule.minimumSignal}</p>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
                loading={bulkApprove.isPending}
                disabled={selectedReadyCount === 0}
                onClick={() => {
                  bulkApprove.mutate(
                    {
                      transactionIds: selectedQueueIds,
                      minConfidence: workbench.bulkApprovalPolicy.minConfidence,
                    },
                    { onSuccess: () => setSelectedQueueIds([]) },
                  );
                }}
              >
                {selectedReadyCount} hareketi toplu onayla
              </Button>
            </div>
          </div>
        </section>
      )}
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Banka hareketi bulunamadı"
        emptyDescription="Yeni bir hareket ekleyerek başlayın."
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

      <Modal
        isOpen={Boolean(selectedTransaction)}
        onClose={() => setSelectedTransaction(null)}
        title="Otomatik eşleştirme önerileri"
        size="lg"
      >
        {selectedTransaction && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{selectedTransaction.description ?? "Açıklamasız hareket"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(selectedTransaction.date)} · {selectedTransaction.reference ?? "Referans yok"}
                  </p>
                </div>
                <p className="text-sm font-bold text-white tabular-nums">{formatCurrency(selectedTransaction.amount)}</p>
              </div>
            </div>

            {suggestionsQuery.isLoading ? (
              <p className="text-sm text-slate-400">Öneriler hesaplanıyor...</p>
            ) : suggestions.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                Bu hareket için güvenilir aday bulunamadı. Referans, açıklama veya tutar bilgilerini kontrol edin.
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.map((suggestion) => {
                  const strength = STRENGTH_MAP[suggestion.strength];
                  return (
                    <div key={`${suggestion.refType}-${suggestion.refId}`} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="info">{MATCH_LABELS[suggestion.refType]}</Badge>
                            <Badge variant={strength.variant}>{strength.label} güven</Badge>
                            <span className="text-xs font-semibold text-slate-300">%{suggestion.confidenceScore}</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-white">{suggestion.label}</p>
                          <p className="mt-1 text-xs text-slate-400">{suggestion.detail}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            {suggestion.amount !== null && <span>{formatCurrency(suggestion.amount)}</span>}
                            {suggestion.date && <span>{formatDate(suggestion.date)}</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<CheckCircle2 className="h-4 w-4" />}
                          loading={approveMatch.isPending}
                          onClick={() => {
                            approveMatch.mutate(
                              { id: selectedTransaction.id, refType: suggestion.refType, refId: suggestion.refId },
                              { onSuccess: () => setSelectedTransaction(null) },
                            );
                          }}
                        >
                          Onayla
                        </Button>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            suggestion.strength === "HIGH" && "bg-emerald-400",
                            suggestion.strength === "MEDIUM" && "bg-amber-400",
                            suggestion.strength === "LOW" && "bg-slate-500",
                          )}
                          style={{ width: `${suggestion.confidenceScore}%` }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {suggestion.reasons.map((reason) => (
                          <span key={reason} className="rounded-md bg-slate-950 px-2 py-1 text-[11px] text-slate-400">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Banka Hareketi"
        size="md"
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
              loading={createTx.isPending}
              onClick={() => {
                createTx.mutate(
                  {
                    bankAccountId: form.bankAccountId,
                    type: form.type,
                    amount: Number(form.amount),
                    balanceAfter: Number(form.balanceAfter),
                    date: form.date,
                    description: form.description || undefined,
                    reference: form.reference || undefined,
                  },
                  { onSuccess: () => setCreateOpen(false) },
                );
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <BankAccountSelect
            label="Banka Hesabı"
            required
            value={form.bankAccountId}
            onChange={(value) => setForm((p) => ({ ...p, bankAccountId: value }))}
          />
          <Select
            label="İşlem Tipi"
            required
            options={Object.entries(TYPE_MAP).map(([k, v]) => ({
              value: k,
              label: v.label,
            }))}
            value={form.type}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                type: e.target.value as BankTransactionType,
              }))
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tutar"
              required
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((p) => ({ ...p, amount: e.target.value }))
              }
            />
            <Input
              label="İşlem Sonrası Bakiye"
              required
              type="number"
              step="0.01"
              value={form.balanceAfter}
              onChange={(e) =>
                setForm((p) => ({ ...p, balanceAfter: e.target.value }))
              }
            />
          </div>
          <DatePicker
            label="Tarih"
            required
            value={form.date}
            onValueChange={(value) =>
              setForm((p) => ({ ...p, date: value ?? "" }))
            }
            clearable={false}
          />
          <Input
            label="Açıklama"
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
          />
          <Input
            label="Referans"
            value={form.reference}
            onChange={(e) =>
              setForm((p) => ({ ...p, reference: e.target.value }))
            }
          />
        </div>
      </Modal>
    </div>
  );
}
