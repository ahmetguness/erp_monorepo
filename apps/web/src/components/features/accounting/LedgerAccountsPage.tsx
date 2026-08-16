"use client";

import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BookOpen,
  CreditCard,
  Hash,
  Landmark,
  PiggyBank,
  Plus,
  Save,
  Search,
  TrendingDown,
  TrendingUp,
  Type,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useLedgerAccounts, useCreateLedgerAccount } from "@/hooks/useAccounting";
import { cn } from "@/lib/utils";
import type { AccountType, LedgerAccount } from "@/services/accounting.service";

type AccountTypeConfig = {
  value: AccountType;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  ring: string;
};

const ACCOUNT_TYPES: AccountTypeConfig[] = [
  { value: "ASSET", label: "Varlık", icon: Landmark, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30", ring: "ring-sky-500/20" },
  { value: "LIABILITY", label: "Yükümlülük", icon: CreditCard, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", ring: "ring-red-500/20" },
  { value: "EQUITY", label: "Özkaynak", icon: PiggyBank, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30", ring: "ring-violet-500/20" },
  { value: "REVENUE", label: "Gelir", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "ring-emerald-500/20" },
  { value: "EXPENSE", label: "Gider", icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "ring-amber-500/20" },
];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Varlık",
  LIABILITY: "Yükümlülük",
  EQUITY: "Özkaynak",
  REVENUE: "Gelir",
  EXPENSE: "Gider",
};

const TYPE_BADGE_COLORS: Record<AccountType, string> = {
  ASSET: "bg-sky-500/10 text-sky-300",
  LIABILITY: "bg-red-500/10 text-red-300",
  EQUITY: "bg-violet-500/10 text-violet-300",
  REVENUE: "bg-emerald-500/10 text-emerald-300",
  EXPENSE: "bg-amber-500/10 text-amber-300",
};

const schema = z.object({
  code: z.string().min(1, "Kod zorunludur"),
  name: z.string().min(1, "Ad zorunludur"),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  parentId: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type TypeFilter = "ALL" | AccountType;

export function LedgerAccountsPage() {
  const { data: accounts = [], isLoading } = useLedgerAccounts();
  const createAccount = useCreateLedgerAccount();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "ASSET" },
  });

  const selectedType = useWatch({ control, name: "type" });

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return accounts.filter((account) => {
      const matchesType = typeFilter === "ALL" || account.accountType === typeFilter;
      const matchesSearch =
        !query ||
        account.code.toLocaleLowerCase("tr-TR").includes(query) ||
        account.name.toLocaleLowerCase("tr-TR").includes(query) ||
        account.parent?.name.toLocaleLowerCase("tr-TR").includes(query);
      return matchesType && matchesSearch;
    });
  }, [accounts, search, typeFilter]);

  const summary = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((account) => account.isActive).length,
    passive: accounts.filter((account) => !account.isActive).length,
    parent: accounts.filter((account) => !account.parentId).length,
    child: accounts.filter((account) => Boolean(account.parentId)).length,
  }), [accounts]);

  const parentOptions = useMemo(
    () => [
      { value: "", label: "- Üst hesap yok -" },
      ...accounts.map((account) => ({ value: account.id, label: `${account.code} - ${account.name}` })),
    ],
    [accounts],
  );

  const closeModal = () => {
    setCreateOpen(false);
    reset({ type: "ASSET" });
  };

  const onSubmit = (data: FormData) => {
    createAccount.mutate(
      {
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: data.parentId || undefined,
      },
      { onSuccess: closeModal },
    );
  };

  const columns: ColumnDef<LedgerAccount>[] = [
    {
      key: "code",
      header: "Kod",
      width: "115px",
      render: (account) => <span className="font-mono text-sm font-semibold text-sky-300">{account.code}</span>,
    },
    {
      key: "name",
      header: "Hesap",
      render: (account) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{account.name}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">
            {account.parent ? `${account.parent.code} - ${account.parent.name}` : "Ana hesap"}
          </span>
        </div>
      ),
    },
    {
      key: "accountType",
      header: "Tip",
      width: "135px",
      render: (account) => (
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TYPE_BADGE_COLORS[account.accountType])}>
          {ACCOUNT_TYPE_LABELS[account.accountType]}
        </span>
      ),
    },
    {
      key: "children",
      header: "Alt Hesap",
      width: "95px",
      align: "right",
      render: (account) => <span className="tabular-nums text-slate-300">{account.children?.length ?? 0}</span>,
    },
    {
      key: "isActive",
      header: "Durum",
      width: "90px",
      align: "center",
      render: (account) => <ActiveBadge isActive={account.isActive} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hesap planı"
        subtitle="Muhasebe hesaplarını tip, hiyerarşi ve aktiflik durumuna göre yönetin."
        className="mb-0"
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Yeni hesap
          </Button>
        }
      />

      <SummaryStrip
        metrics={[
          { label: "Toplam Hesap", value: summary.total, tone: "text-slate-50" },
          { label: "Aktif", value: summary.active, tone: "text-emerald-300" },
          { label: "Pasif", value: summary.passive, tone: summary.passive > 0 ? "text-amber-300" : "text-slate-200" },
          { label: "Ana Hesap", value: summary.parent, tone: "text-sky-200" },
          { label: "Alt Hesap", value: summary.child, tone: "text-violet-300" },
        ]}
      />

      <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold text-white">Hesap listesi</h2>
            </div>
            <div className="grid w-full gap-2 md:w-auto md:grid-cols-[240px_170px]">
              <Input
                placeholder="Kod, ad veya üst hesap ara"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                prefixIcon={<Search className="h-4 w-4" />}
                className="h-9 py-1.5 text-xs"
              />
              <Select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                options={[
                  { value: "ALL", label: "Tüm tipler" },
                  ...ACCOUNT_TYPES.map((type) => ({ value: type.value, label: type.label })),
                ]}
                className="h-9 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/45 p-1">
            {(["ALL", ...ACCOUNT_TYPES.map((type) => type.value)] as TypeFilter[]).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  typeFilter === type ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300",
                )}
              >
                {type === "ALL" ? "Tümü" : ACCOUNT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          <DataTable
            columns={columns}
            data={filteredAccounts}
            keyExtractor={(account) => account.id}
            isLoading={isLoading}
            density="compact"
            emptyTitle="Hesap bulunamadı"
            emptyDescription="Arama veya filtre kriterlerini değiştirin ya da yeni bir hesap oluşturun."
          />
        </div>
      </section>

      <Modal
        isOpen={createOpen}
        onClose={closeModal}
        title="Yeni hesap oluştur"
        description="Hesap planınıza yeni bir muhasebe hesabı ekleyin."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={closeModal}>
              İptal
            </Button>
            <Button size="sm" loading={createAccount.isPending} leftIcon={<Save className="h-3.5 w-3.5" />} onClick={handleSubmit(onSubmit)}>
              Hesabı kaydet
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          <div>
            <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Hesap tipi</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ACCOUNT_TYPES.map((type) => {
                const Icon = type.icon;
                const active = selectedType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setValue("type", type.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors",
                      active ? `${type.bg} ${type.border} ring-2 ${type.ring}` : "border-slate-800 bg-slate-900/60 hover:border-slate-700",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? type.color : "text-slate-500")} />
                    <span className={cn("text-[10px] font-medium", active ? type.color : "text-slate-500")}>{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          <div>
            <label className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <BookOpen className="h-3 w-3" /> Hesap bilgileri
            </label>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Hesap kodu" required placeholder="100" error={errors.code?.message} prefixIcon={<Hash className="h-3.5 w-3.5" />} {...register("code")} />
                <div className="sm:col-span-2">
                  <Input label="Hesap adı" required placeholder="Kasa hesabı" error={errors.name?.message} prefixIcon={<Type className="h-3.5 w-3.5" />} {...register("name")} />
                </div>
              </div>
              <Select label="Üst hesap" options={parentOptions} {...register("parentId")} />
              <p className="text-[11px] text-slate-500">Üst hesap seçerek hiyerarşik hesap planı oluşturabilirsiniz.</p>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SummaryStrip({ metrics }: { metrics: Array<{ label: string; value: ReactNode; tone: string }> }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="flex items-center gap-x-4">
            {index > 0 && <span className="h-4 w-px bg-slate-800" />}
            <span className={cn("font-semibold tabular-nums", metric.tone)}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
