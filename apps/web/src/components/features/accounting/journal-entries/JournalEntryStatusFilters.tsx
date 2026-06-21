import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/services/accounting.service";
import type { JournalEntryStatusFilter } from "./schema";

const FILTERS: Array<{
  key: JournalEntryStatusFilter;
  label: string;
  active: string;
}> = [
  {
    key: "all",
    label: "Tümü",
    active: "border-sky-500/30 bg-sky-500/15 text-sky-400",
  },
  {
    key: "draft",
    label: "Taslak",
    active: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  },
  {
    key: "posted",
    label: "Onaylı",
    active: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  },
];

export function filterJournalEntries(
  entries: readonly JournalEntry[],
  statusFilter: JournalEntryStatusFilter,
): JournalEntry[] {
  if (statusFilter === "draft") return entries.filter((entry) => !entry.isPosted);
  if (statusFilter === "posted") return entries.filter((entry) => entry.isPosted);
  return [...entries];
}

export function JournalEntryStatusFilters({
  entries,
  value,
  onChange,
}: {
  entries: readonly JournalEntry[];
  value: JournalEntryStatusFilter;
  onChange: (value: JournalEntryStatusFilter) => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {FILTERS.map((filter) => {
        const count = filterJournalEntries(entries, filter.key).length;
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onChange(filter.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200",
              value === filter.key
                ? filter.active
                : "border-transparent text-slate-500 hover:bg-slate-800/50 hover:text-slate-300",
            )}
          >
            {filter.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                value === filter.key ? "bg-white/10" : "bg-slate-800 text-slate-600",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
