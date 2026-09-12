"use client";

import type { AdminUiPreferences } from "@repo/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Accessibility, X } from "lucide-react";
import { useEffect, useState } from "react";
import { adminCopy } from "@/lib/admin/admin-copy";
import { toastAdminError } from "@/lib/admin/errors";
import { getAdminUiPreferences, updateAdminUiPreferences } from "@/services/admin-ui-preferences.service";

const defaults: AdminUiPreferences = { locale: "tr-TR", highContrast: false, reduceMotion: false, density: "COMFORTABLE" };

function applyPreferences(value: AdminUiPreferences): void {
  const root = document.documentElement;
  root.lang = value.locale;
  root.dataset.adminContrast = value.highContrast ? "high" : "standard";
  root.dataset.adminMotion = value.reduceMotion ? "reduced" : "standard";
  root.dataset.adminDensity = value.density.toLowerCase();
}

function clearPreferences(): void {
  const root = document.documentElement;
  delete root.dataset.adminContrast;
  delete root.dataset.adminMotion;
  delete root.dataset.adminDensity;
}

export function AdminAccessibilityPreferences() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "ui-preferences"], queryFn: getAdminUiPreferences });
  const preferences = query.data ?? defaults;
  useEffect(() => {
    applyPreferences(preferences);
    return clearPreferences;
  }, [preferences]);
  const mutation = useMutation({
    mutationFn: updateAdminUiPreferences,
    onSuccess: (value) => { applyPreferences(value); queryClient.setQueryData(["admin", "ui-preferences"], value); },
    onError: (error) => toastAdminError(error, "Erişilebilirlik tercihi kaydedilemedi."),
  });
  const update = (patch: Partial<AdminUiPreferences>) => mutation.mutate({ ...preferences, ...patch });
  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open && (
        <section aria-label={adminCopy.accessibility.title} className="mb-2 w-72 rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">{adminCopy.accessibility.title}</h2><button type="button" aria-label="Ayarları kapat" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-400"><X className="h-4 w-4" /></button></div>
          <div className="mt-3 space-y-3">
            <PreferenceToggle disabled={mutation.isPending} label={adminCopy.accessibility.highContrast} checked={preferences.highContrast} onChange={(checked) => update({ highContrast: checked })} />
            <PreferenceToggle disabled={mutation.isPending} label={adminCopy.accessibility.reduceMotion} checked={preferences.reduceMotion} onChange={(checked) => update({ reduceMotion: checked })} />
            <PreferenceToggle disabled={mutation.isPending} label={adminCopy.accessibility.compact} checked={preferences.density === "COMPACT"} onChange={(checked) => update({ density: checked ? "COMPACT" : "COMFORTABLE" })} />
          </div>
          <p aria-live="polite" className="mt-3 text-xs text-slate-500">{mutation.isPending ? "Kaydediliyor…" : "Tercihler hesabınıza kaydedilir."}</p>
        </section>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={adminCopy.accessibility.title} className="flex h-11 w-11 items-center justify-center rounded-full border border-sky-500/40 bg-slate-900 text-sky-300 shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"><Accessibility className="h-5 w-5" /></button>
    </div>
  );
}

function PreferenceToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-200"><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-sky-500 disabled:opacity-50" /></label>;
}
