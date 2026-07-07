import { CheckCircle, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { JournalEntry } from "@/services/accounting.service";
import {
  getJournalEntrySourceInfo,
  getJournalEntryTypeLabel,
  getJournalEntryTypeVariant,
} from "./display";

interface JournalEntryColumnActions {
  onEdit: (entry: JournalEntry) => void;
  onPost: (id: string) => void;
  onReverse: (id: string, reason: string) => void;
  onReverseReasonMissing: () => void;
}

export function createJournalEntryColumns(actions: JournalEntryColumnActions): ColumnDef<JournalEntry>[] {
  return [
    {
      key: "number",
      header: "Fiş No",
      width: "150px",
      render: (row) => (
        <div>
          <span className="font-mono text-sky-400">{row.number}</span>
          {row.description?.startsWith("Ters kayıt") && (
            <span className="ml-1.5 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-400">
              STORNO
            </span>
          )}
          <div className="mt-1">
            <Badge variant={getJournalEntryTypeVariant(row.type)}>
              {getJournalEntryTypeLabel(row.type)}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Tarih",
      width: "100px",
      render: (row) => (
        <span className="text-xs text-slate-400">{formatDate(row.date)}</span>
      ),
    },
    {
      key: "description",
      header: "Açıklama",
      render: (row) => (
        <span className="block max-w-[200px] truncate text-sm text-slate-300">
          {row.description ?? "—"}
        </span>
      ),
    },
    {
      key: "source",
      header: "Kaynak Belge",
      width: "150px",
      render: (row) => {
        const source = getJournalEntrySourceInfo(row);
        if (!source) return <span className="text-xs text-slate-600">Manuel fis</span>;
        if (!source.href) return <span className="text-xs font-medium text-slate-400">{source.label}</span>;

        return (
          <Link
            href={source.href}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
          >
            {source.label}
            <ExternalLink className="h-3 w-3" />
          </Link>
        );
      },
    },
    {
      key: "totalDebit",
      header: "Borç",
      width: "110px",
      align: "right",
      render: (row) => {
        const total = row.lines?.reduce((sum, line) => sum + Number(line.debit), 0) ?? 0;
        return (
          <span className="text-sm font-medium tabular-nums text-emerald-400">
            {total > 0 ? formatCurrency(total) : "—"}
          </span>
        );
      },
    },
    {
      key: "totalCredit",
      header: "Alacak",
      width: "110px",
      align: "right",
      render: (row) => {
        const total = row.lines?.reduce((sum, line) => sum + Number(line.credit), 0) ?? 0;
        return (
          <span className="text-sm font-medium tabular-nums text-red-400">
            {total > 0 ? formatCurrency(total) : "—"}
          </span>
        );
      },
    },
    {
      key: "lineCount",
      header: "Satır",
      width: "60px",
      align: "center",
      render: (row) => (
        <span className="text-xs text-slate-500">{row.lines?.length ?? 0}</span>
      ),
    },
    {
      key: "isPosted",
      header: "Durum",
      width: "90px",
      align: "center",
      render: (row) => (
        <Badge variant={row.isPosted ? "success" : "warning"}>
          {row.isPosted ? "Onaylı" : "Taslak"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "180px",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {!row.isPosted ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onEdit(row);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
              >
                <Pencil className="h-3 w-3" />
                Düzenle
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onPost(row.id);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
              >
                <CheckCircle className="h-3 w-3" />
                Onayla
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const reason = window.prompt(`${row.number} ters kayit nedeni`);
                if (!reason?.trim()) {
                  actions.onReverseReasonMissing();
                  return;
                }
                actions.onReverse(row.id, reason.trim());
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
            >
              <RotateCcw className="h-3 w-3" />
              Ters Kayit
            </button>
          )}
        </div>
      ),
    },
  ];
}

export type JournalEntryTableProps = {
  columns: ColumnDef<JournalEntry>[];
  entries: JournalEntry[];
  isLoading: boolean;
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function JournalEntryTable({
  columns,
  entries,
  isLoading,
  page,
  total,
  totalPages,
  onPageChange,
}: JournalEntryTableProps) {
  return (
    <DataTable
      columns={columns}
      data={entries}
      keyExtractor={(row) => row.id}
      isLoading={isLoading}
      emptyTitle="Yevmiye fişi bulunamadı"
      pagination={{
        page,
        pageSize: 20,
        total,
        totalPages,
        onChange: onPageChange,
      }}
    />
  );
}
