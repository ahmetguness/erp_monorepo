"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormRow } from "@/components/shared/FormField";
import { useCashAccounts, useCreateCashAccount, useDeleteCashAccount, useUpdateCashAccount } from "@/hooks/useAccounting";
import type { CashAccount } from "@/services/accounting.service";
import { ApiErrorState } from "@/components/shared/ApiErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const schema = z.object({
  name: z.string().trim().min(1, "Ad zorunludur").max(200),
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/, "3 harfli para birimi girin").optional(),
});
type FormData = z.infer<typeof schema>;

export function CashAccountsPage() {
  const accountsQuery = useCashAccounts();
  const { data: accounts = [], isLoading } = accountsQuery;
  const createAccount = useCreateCashAccount();
  const deleteAccount = useDeleteCashAccount();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CashAccount | null>(null);
  const [deleting, setDeleting] = useState<CashAccount | null>(null);
  const updateAccount = useUpdateCashAccount(editing?.id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currencyCode: "TRY" },
  });

  const onSubmit = (data: FormData) => {
    const mutation = editing ? updateAccount : createAccount;
    mutation.mutate(data, {
      onSuccess: () => {
        setCreateOpen(false);
        setEditing(null);
        reset();
      },
    });
  };

  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
    reset();
  };

  const openCreate = () => {
    reset({ name: "", currencyCode: "TRY" });
    setEditing(null);
    setCreateOpen(true);
  };

  const openEdit = (account: CashAccount) => {
    reset({ name: account.name, currencyCode: account.currencyCode });
    setEditing(account);
    setCreateOpen(true);
  };

  const columns: ColumnDef<CashAccount>[] = [
    {
      key: "name",
      header: "Ad",
      render: (r) => (
        <span className="text-slate-200 font-medium">{r.name}</span>
      ),
    },
    {
      key: "currencyCode",
      header: "Para Birimi",
      width: "120px",
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
        title="Kasa Hesapları"
        subtitle="Nakit kasa hesaplarınızı yönetin."
        action={
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={openCreate}
          >
            Yeni Kasa
          </Button>
        }
      />
      {accountsQuery.isError ? <ApiErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} /> : <DataTable
        columns={columns}
        data={accounts}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Kasa hesabı bulunamadı"
      />}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          closeModal();
        }}
        title={editing ? "Kasa Hesabını Düzenle" : "Yeni Kasa Hesabı"}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                closeModal();
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
          <FormRow cols={2}>
            <Input
              label="Kasa Adı"
              required
              placeholder="Ana Kasa"
              error={errors.name?.message}
              {...register("name")}
            />
            <Input
              label="Para Birimi"
              placeholder="TRY"
              {...register("currencyCode")}
            />
          </FormRow>
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteAccount.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Kasa hesabını sil"
        message={<><strong>{deleting?.name}</strong> hesabı pasif hale getirilecek. Geçmiş ödeme bağlantıları korunur.</>}
        confirmLabel="Sil"
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
