"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormRow } from "@/components/shared/FormField";
import { useBankAccounts, useCreateBankAccount, useDeleteBankAccount, useUpdateBankAccount } from "@/hooks/useAccounting";
import type { BankAccount } from "@/services/accounting.service";
import { MasterDataSuggestionsPanel } from "@/components/features/onboarding/MasterDataSuggestionsPanel";
import { useMasterDataEnrichment } from "@/hooks/useMasterDataEnrichment";
import type { MasterDataSuggestion } from "@/services/master-data-enrichment.service";
import { ApiErrorState } from "@/components/shared/ApiErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const schema = z.object({
  name: z.string().trim().min(1, "Ad zorunludur").max(200),
  bankName: z.string().trim().max(200).optional(),
  accountNumber: z.string().trim().max(100).optional(),
  iban: z.string().trim().optional(),
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/, "3 harfli para birimi girin").optional(),
});
type FormData = z.infer<typeof schema>;

export function BankAccountsPage() {
  const accountsQuery = useBankAccounts();
  const { data: accounts = [], isLoading } = accountsQuery;
  const createAccount = useCreateBankAccount();
  const deleteAccount = useDeleteBankAccount();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [deleting, setDeleting] = useState<BankAccount | null>(null);
  const updateAccount = useUpdateBankAccount(editing?.id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currencyCode: "TRY" },
  });
  const iban = useWatch({ control, name: "iban" });
  const enrichment = useMasterDataEnrichment();

  const closeCreateModal = () => {
    setCreateOpen(false);
    setEditing(null);
    reset();
    enrichment.reset();
  };

  const applySuggestion = (suggestion: MasterDataSuggestion) => {
    if (suggestion.field === "iban" || suggestion.field === "bankName" || suggestion.field === "currencyCode") {
      setValue(suggestion.field, suggestion.value, { shouldDirty: true, shouldValidate: true });
    }
  };

  const onSubmit = (data: FormData) => {
    const mutation = editing ? updateAccount : createAccount;
    mutation.mutate(data, {
      onSuccess: () => {
        closeCreateModal();
      },
    });
  };

  const openCreate = () => {
    reset({ name: "", bankName: "", accountNumber: "", iban: "", currencyCode: "TRY" });
    setEditing(null);
    setCreateOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    reset({ name: account.name, bankName: account.bankName ?? "", accountNumber: account.accountNumber ?? "", iban: account.iban ?? "", currencyCode: account.currencyCode });
    setEditing(account);
    setCreateOpen(true);
  };

  const columns: ColumnDef<BankAccount>[] = [
    {
      key: "name",
      header: "Ad",
      render: (r) => (
        <span className="text-slate-200 font-medium">{r.name}</span>
      ),
    },
    {
      key: "bankName",
      header: "Banka",
      render: (r) => (
        <span className="text-slate-400">{r.bankName ?? "—"}</span>
      ),
    },
    {
      key: "iban",
      header: "IBAN",
      render: (r) => (
        <span className="font-mono text-slate-400 text-xs">
          {r.iban ?? r.accountNumber ?? "—"}
        </span>
      ),
    },
    {
      key: "currencyCode",
      header: "Para Birimi",
      width: "100px",
      render: (r) => <span className="text-slate-400">{r.currencyCode}</span>,
    },
    {
      key: "isActive",
      header: "Durum",
      width: "80px",
      align: "center",
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
    {
      key: "actions",
      header: "İşlemler",
      width: "110px",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`${r.name} düzenle`} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" aria-label={`${r.name} sil`} onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Banka Hesapları"
        subtitle="Banka hesaplarınızı yönetin."
        action={
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={openCreate}
          >
            Yeni Hesap
          </Button>
        }
      />
      {accountsQuery.isError ? <ApiErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} /> : <DataTable
        columns={columns}
        data={accounts}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Banka hesabı bulunamadı"
      />}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          closeCreateModal();
        }}
        title={editing ? "Banka Hesabını Düzenle" : "Yeni Banka Hesabı"}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                closeCreateModal();
              }}
            >
              İptal
            </Button>
            <Button
              onClick={handleSubmit(onSubmit)}
              loading={createAccount.isPending || updateAccount.isPending}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input
            label="Hesap Adı"
            required
            placeholder="Garanti Vadesiz"
            error={errors.name?.message}
            {...register("name")}
          />
          <FormRow cols={2}>
            <Input
              label="Banka Adı"
              placeholder="Garanti Bankası"
              {...register("bankName")}
            />
            <Input
              label="Para Birimi"
              placeholder="TRY"
              {...register("currencyCode")}
            />
          </FormRow>
          <Input
            label="Hesap No"
            placeholder="1234567890"
            {...register("accountNumber")}
          />
          <Input
            label="IBAN"
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            {...register("iban")}
          />
          <Button
            type="button"
            variant="secondary"
            leftIcon={<Sparkles className="h-4 w-4" />}
            disabled={!iban || enrichment.isPending}
            loading={enrichment.isPending}
            onClick={() => enrichment.mutate({ entityType: "bankAccount", iban })}
          >
            IBAN&apos;ı doğrula ve tamamla
          </Button>
          <MasterDataSuggestionsPanel result={enrichment.data} onApply={applySuggestion} />
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteAccount.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Banka hesabını sil"
        message={<><strong>{deleting?.name}</strong> hesabı pasif hale getirilecek. Geçmiş ödeme bağlantıları korunur.</>}
        confirmLabel="Sil"
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
