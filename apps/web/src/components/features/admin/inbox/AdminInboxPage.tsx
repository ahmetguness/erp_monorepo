"use client";

import type { AdminInboxAction, AdminInboxItem, AdminInboxPreferences } from "@repo/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, Clock3, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { canAdmin } from "@/lib/admin/permissions";
import { toastAdminError } from "@/lib/admin/errors";
import {
  getAdminInbox,
  updateAdminInboxItem,
  updateAdminInboxPreferences,
  type InboxScope,
} from "@/services/admin-inbox.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";
import { AdminPageHeader, AdminKpiCard, AdminKpiGrid } from "@/components/features/admin/ui";

const buttonClass = "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-50";
const priorityClass: Record<AdminInboxItem["priority"], string> = {
  CRITICAL: "text-red-300 border-red-800",
  HIGH: "text-orange-300 border-orange-800",
  MEDIUM: "text-amber-300 border-amber-800",
  LOW: "text-slate-300 border-slate-700",
};

export function AdminInboxPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<InboxScope>("ALL");
  const [includeResolved, setIncludeResolved] = useState(false);
  const inbox = useQuery({
    queryKey: ["admin", "inbox", scope, includeResolved],
    queryFn: () => getAdminInbox(scope, includeResolved),
    refetchInterval: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "inbox"] });
  const preferenceMutation = useMutation({
    mutationFn: updateAdminInboxPreferences,
    onSuccess: async () => {
      await refresh();
      toast.success("Bildirim tercihleri kaydedildi.");
    },
    onError: (error) => toastAdminError(error, "Bildirim tercihleri kaydedilemedi."),
  });
  return (
    <div className="space-y-4 pb-10">
      <AdminPageHeader
        title="Bildirim ve Görev Gelen Kutusu"
        description="Onaylar, güvenlik bulguları, olaylar ve yaklaşan süreler."
        icon={BellRing}
        iconTone="indigo"
        badge={
          (inbox.data?.unreadCount ?? 0) > 0 ? (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/30">
              {inbox.data?.unreadCount} Okunmamış
            </span>
          ) : undefined
        }
      />
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Okunmamış Görevler"
          value={inbox.data?.unreadCount ?? 0}
          icon={BellRing}
          iconTone="amber"
          subtext="İşlem bekleyen bildirimler"
        />
        <AdminKpiCard
          label="Süresi Geçmiş"
          value={inbox.data?.overdueCount ?? 0}
          icon={Clock3}
          iconTone="red"
          subtext={
            (inbox.data?.overdueCount ?? 0) > 0 ? (
              <span className="text-rose-400 font-medium">SLA eşiği aşıldı</span>
            ) : (
              <span className="text-emerald-400 font-medium">Zaman aşımı yok</span>
            )
          }
        />
        <AdminKpiCard
          label="Toplam Görünür"
          value={inbox.data?.items.length ?? 0}
          icon={UserRoundCheck}
          iconTone="sky"
          subtext="Aktif gelen kutusu öğesi"
        />
        <AdminKpiCard
          label="Otomatik Yenileme"
          value="30 sn"
          icon={CheckCheck}
          iconTone="emerald"
          subtext="Canlı senkronizasyon"
        />
      </AdminKpiGrid>
      <section className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
        {(["ALL", "MINE", "UNASSIGNED"] as const).map((value) => (
          <button key={value} className={buttonClass} disabled={scope === value} onClick={() => setScope(value)}>
            {value === "ALL" ? "Tümü" : value === "MINE" ? "Bana atanmış" : "Atanmamış"}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={includeResolved} onChange={(event) => setIncludeResolved(event.target.checked)} />
          Çözülenleri göster
        </label>
      </section>
      {inbox.data && (
        <PreferencePanel
          key={JSON.stringify(inbox.data.preferences)}
          value={inbox.data.preferences}
          disabled={preferenceMutation.isPending}
          save={(value) => preferenceMutation.mutate(value)}
        />
      )}
      {inbox.isLoading && <p className="text-sm text-slate-400">Gelen kutusu yükleniyor…</p>}
      {inbox.isError && <p className="text-sm text-red-400">Gelen kutusu yüklenemedi.</p>}
      <div className="space-y-3">
        {inbox.data?.items.map((item) => (
          <InboxCard
            key={item.id}
            item={item}
            adminId={admin?.id ?? ""}
            canManage={canAdmin(admin, "inbox.manage")}
            refresh={refresh}
          />
        ))}
      </div>
      {inbox.data?.items.length === 0 && !inbox.isLoading && (
        <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          Seçili filtrelerde bekleyen bildirim veya görev yok.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>;
}

function PreferencePanel({ value, disabled, save }: { value: AdminInboxPreferences; disabled: boolean; save: (value: AdminInboxPreferences) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <summary className="cursor-pointer text-sm font-medium text-white">Bildirim tercihleri</summary>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {(Object.keys(draft) as Array<keyof AdminInboxPreferences>).map((key) => (
          <label key={key} className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />{preferenceLabel(key)}
          </label>
        ))}
        <button className={buttonClass} disabled={disabled} onClick={() => save(draft)}>Tercihleri kaydet</button>
      </div>
    </details>
  );
}

function preferenceLabel(key: keyof AdminInboxPreferences): string {
  return { approvals: "Onaylar", security: "Güvenlik", incidents: "Olaylar", expirations: "Yaklaşan süreler" }[key];
}

function InboxCard({ item, adminId, canManage, refresh }: { item: AdminInboxItem; adminId: string; canManage: boolean; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (action: AdminInboxAction) =>
      updateAdminInboxItem({
        category: item.category,
        sourceId: item.sourceId,
        action,
        ownerId: action === "ASSIGN" ? adminId : undefined,
      }),
    onSuccess: refresh,
    onError: (error) => toastAdminError(error, "Görev durumu güncellenemedi."),
  });
  const openSource = async () => {
    try {
      if (!item.readAt) await mutation.mutateAsync("READ");
    } finally {
      router.push(item.href);
    }
  };
  return (
    <article className={`rounded-xl border bg-slate-900 p-4 ${item.readAt ? "border-slate-800" : "border-sky-800"}`}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-500">{item.category}</p>
          <h2 className="text-sm font-semibold text-white">{item.title}</h2>
          <p className="mt-1 text-xs text-slate-400">{item.description}</p>
        </div>
        <span className={`h-fit rounded border px-2 py-1 text-[10px] font-semibold ${priorityClass[item.priority]}`}>{item.priority}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span><UserRoundCheck className="inline h-3 w-3" /> {item.ownerId ?? "Atanmamış"}</span>
        {item.dueAt && <span className={item.overdue ? "text-red-400" : ""}><Clock3 className="inline h-3 w-3" /> {new Date(item.dueAt).toLocaleString("tr-TR")}</span>}
        {item.resolvedAt && <span><CheckCheck className="inline h-3 w-3" /> Çözüldü</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={buttonClass} onClick={openSource}>Kaynağı aç</button>
        {canManage && item.ownerId !== adminId && <button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate("ASSIGN")}>Üzerime al</button>}
        <button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate(item.readAt ? "UNREAD" : "READ")}>{item.readAt ? "Okunmadı" : "Okundu"}</button>
        {canManage && <button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate(item.resolvedAt ? "REOPEN" : "RESOLVE")}>{item.resolvedAt ? "Yeniden aç" : "Çözüldü"}</button>}
      </div>
    </article>
  );
}
