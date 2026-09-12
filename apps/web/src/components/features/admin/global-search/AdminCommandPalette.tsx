"use client";

import type {
  AdminGlobalSearchKind,
  AdminGlobalSearchResult,
} from "@repo/types";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { canAdmin } from "@/lib/admin/permissions";
import { searchAdminResources } from "@/services/admin-global-search.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";

const labels: Record<AdminGlobalSearchKind, string> = {
  TENANT: "Tenant",
  USER: "Kullanıcı",
  INVOICE: "Fatura",
  INTEGRATION: "Entegrasyon",
  JOB: "Job",
  REQUEST: "İstek",
  TICKET: "Destek talebi",
};

export function AdminCommandPalette() {
  const admin = useAdminAuthStore((state) => state.admin);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const enabled = canAdmin(admin, "search.read");

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (enabled) setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useQuery({
    queryKey: ["admin-global-search", debouncedQuery],
    queryFn: () => searchAdminResources(debouncedQuery),
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 15_000,
  });

  if (!enabled) return null;
  const navigate = (item: AdminGlobalSearchResult) => {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  };
  const items = results.data?.results ?? [];
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) =>
        Math.min(index + 1, Math.max(items.length - 1, 0)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && items[selectedIndex]) {
      event.preventDefault();
      navigate(items[selectedIndex]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-200 shadow-xl hover:bg-slate-800"
      >
        <Search className="h-4 w-4" /> Global ara{" "}
        <kbd className="text-slate-400">Ctrl K</kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 px-4 pt-[12vh] backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Global arama ve komut paleti"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-800 px-4">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Tenant, kullanıcı, fatura, entegrasyon, job, requestId veya ticket ara…"
                className="h-14 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {query.trim().length < 2 && (
                <p className="p-6 text-center text-sm text-slate-500">
                  Aramak için en az 2 karakter yazın.
                </p>
              )}
              {results.isFetching && (
                <p className="p-6 text-center text-sm text-slate-400">
                  Aranıyor…
                </p>
              )}
              {results.isError && (
                <p className="p-6 text-center text-sm text-red-400">
                  Arama tamamlanamadı.
                </p>
              )}
              {!results.isFetching &&
                debouncedQuery.length >= 2 &&
                results.data?.results.length === 0 && (
                  <p className="p-6 text-center text-sm text-slate-500">
                    Sonuç bulunamadı.
                  </p>
                )}
              {items.map((item, index) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => navigate(item)}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left hover:bg-slate-800 ${index === selectedIndex ? "bg-slate-800" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {item.subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[10px] font-semibold uppercase text-red-300">
                      {labels[item.kind]}
                    </span>
                    {item.status && (
                      <span className="text-[10px] text-slate-500">
                        {item.status}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
