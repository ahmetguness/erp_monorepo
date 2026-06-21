import { z } from "zod";
import {
  dateToFormValue,
  optionalText,
  parseMoneyInput,
} from "@/lib/form-standard";
import type { CreateJournalEntryDTO, JournalEntry } from "@/services/accounting.service";

export const journalEntryLineSchema = z.object({
  accountId: z.string().min(1, "Hesap seçiniz"),
  debit: z.string(),
  credit: z.string(),
  description: z.string().optional(),
});

export const journalEntrySchema = z.object({
  date: z.string().min(1, "Tarih zorunludur"),
  description: z.string().optional(),
  lines: z.array(journalEntryLineSchema).min(2, "En az 2 satır gereklidir"),
});

export type JournalEntryForm = z.infer<typeof journalEntrySchema>;

export type JournalEntryStatusFilter = "all" | "draft" | "posted";

export const JOURNAL_ENTRY_FORM_DEFAULT_VALUES: JournalEntryForm = {
  date: new Date().toISOString().split("T")[0] ?? "",
  lines: [
    { accountId: "", debit: "0", credit: "0" },
    { accountId: "", debit: "0", credit: "0" },
  ],
};

export const JOURNAL_ENTRY_SERVER_FIELDS = [
  "date",
  "description",
  "lines",
] as const satisfies readonly (keyof JournalEntryForm)[];

export function toJournalEntryPayload(data: JournalEntryForm): CreateJournalEntryDTO {
  return {
    date: data.date,
    description: optionalText(data.description),
    lines: data.lines.map((line) => ({
      accountId: line.accountId,
      debit: parseMoneyInput(line.debit),
      credit: parseMoneyInput(line.credit),
      description: optionalText(line.description),
    })),
  };
}

export function journalEntryToFormDefaults(entry: JournalEntry): JournalEntryForm {
  return {
    date: dateToFormValue(entry.date),
    description: entry.description ?? "",
    lines: (entry.lines ?? []).map((line) => ({
      accountId: line.accountId ?? line.account?.id ?? "",
      debit: String(Number(line.debit)),
      credit: String(Number(line.credit)),
      description: line.description ?? "",
    })),
  };
}
