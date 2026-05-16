"use client";

import { useState } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, Minus } from "lucide-react";
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
  useCreateBankTransaction,
} from "@/hooks/useBankTransactions";
import { formatDate, formatCurrency } from "@/lib/utils";
import type {
  BankTransaction,
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

export function BankTransactionsPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
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
