"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormRow } from "@/components/shared/FormField";
import { useBankAccounts, useCreateBankAccount } from "@/hooks/useAccounting";
import type { BankAccount } from "@/services/accounting.service";

const schema = z.object({
  name: z.string().min(1, "Ad zorunludur"),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  iban: z.string().optional(),
  currencyCode: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function BankAccountsPage() {
  const { data: accounts = [], isLoading } = useBankAccounts();
  const createAccount = useCreateBankAccount();
  const [createOpen, setCreateOpen] = useState(false);

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
    createAccount.mutate(data, {
      onSuccess: () => {
        setCreateOpen(false);
        reset();
      },
    });
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
  ];

  return (
    <div>
      <PageHeader
        title="Banka Hesapları"
        subtitle="Banka hesaplarınızı yönetin."
        action={
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateOpen(true)}
          >
            Yeni Hesap
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={accounts}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Banka hesabı bulunamadı"
      />
      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          reset();
        }}
        title="Yeni Banka Hesabı"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                reset();
              }}
            >
              İptal
            </Button>
            <Button
              onClick={handleSubmit(onSubmit)}
              loading={createAccount.isPending}
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
        </form>
      </Modal>
    </div>
  );
}
