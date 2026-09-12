"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformSecurityFinding, SecurityVerificationStatus } from "@repo/types";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Ticket, XCircle } from "lucide-react";
import { canAdmin } from "@/lib/admin/permissions";
import { createSecurityTicket, getSecurityCenter, scanSecurityCenter, updateSecurityFinding } from "@/services/security-center.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";
import { AdminPageHeader, AdminKpiCard, AdminKpiGrid } from "@/components/features/admin/ui";

const panel = "rounded-xl border border-slate-800/80 bg-slate-900/60";
const input = "rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-red-500/50";
const button = "rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:text-white disabled:opacity-40 transition-colors";

const statusMeta: Record<SecurityVerificationStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PASS: { label: "Doğrulandı", color: "text-emerald-300", icon: CheckCircle2 },
  WARN: { label: "İnceleme gerekli", color: "text-amber-300", icon: AlertTriangle },
  FAIL: { label: "Kritik", color: "text-rose-300", icon: XCircle },
};

function parseStatusFilter(value: string): SecurityVerificationStatus | "ALL" {
  return value === "PASS" || value === "WARN" || value === "FAIL" ? value : "ALL";
}

export function SecurityCenterPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = canAdmin(admin, "security.manage");
  const client = useQueryClient();
  const [status, setStatus] = useState<SecurityVerificationStatus | "ALL">("ALL");
  const [category, setCategory] = useState("ALL");
  const query = useQuery({ queryKey: ["admin", "security-center"], queryFn: getSecurityCenter });
  const refresh = async () => client.invalidateQueries({ queryKey: ["admin", "security-center"] });
  const scan = useMutation({
    mutationFn: scanSecurityCenter,
    onSuccess: async () => {
      await refresh();
      toast.success("Güvenlik taraması tamamlandı.");
    },
  });
  const update = useMutation({
    mutationFn: ({ id, owner }: { id: string; owner: string | null }) => updateSecurityFinding(id, { owner }),
    onSuccess: refresh,
  });
  const ticket = useMutation({
    mutationFn: (id: string) => createSecurityTicket(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Bulgu ticket'a dönüştürüldü.");
    },
  });

  const findings = useMemo(() => query.data?.findings ?? [], [query.data?.findings]);
  const categories = useMemo(() => [...new Set(findings.map((item) => item.category))].sort(), [findings]);
  const filtered = findings.filter(
    (item) =>
      (status === "ALL" || item.verificationStatus === status) &&
      (category === "ALL" || item.category === category),
  );

  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <AdminPageHeader
        title="Platform Güvenlik Merkezi"
        description="Kalıcı bulgular, sahiplik, çözüm adımları ve doğrulama kanıtları."
        icon={ShieldCheck}
        iconTone="emerald"
        badge={
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            {findings.length} Bulgu
          </span>
        }
        liveIndicator={
          query.data?.summary.lastScannedAt ? (
            <span className="text-slate-400">
              Son tarama: {new Date(query.data.summary.lastScannedAt).toLocaleTimeString("tr-TR")}
            </span>
          ) : undefined
        }
        actions={
          canManage && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-red-500 disabled:opacity-50 transition-colors"
              disabled={scan.isPending}
              onClick={() => scan.mutate()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scan.isPending ? "animate-spin" : ""}`} />
              <span>Taramayı Çalıştır</span>
            </button>
          )
        }
      />

      {/* KPI Cards */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Toplam Bulgu"
          value={query.data?.summary.total ?? 0}
          icon={ShieldCheck}
          iconTone="slate"
          subtext="Sistemdeki tüm kurallar"
        />

        <AdminKpiCard
          label="Doğrulandı"
          value={query.data?.summary.passing ?? 0}
          icon={CheckCircle2}
          iconTone="emerald"
          subtext={<span className="text-emerald-400 font-medium">Güvenlik şartları sağlandı</span>}
        />

        <AdminKpiCard
          label="İnceleme Gerekli"
          value={query.data?.summary.warning ?? 0}
          icon={AlertTriangle}
          iconTone="amber"
          subtext={<span className="text-amber-400 font-medium">Öneri ve uyarılar</span>}
        />

        <AdminKpiCard
          label="Kritik Risk"
          value={query.data?.summary.failing ?? 0}
          icon={XCircle}
          iconTone="red"
          subtext={
            (query.data?.summary.failing ?? 0) > 0 ? (
              <span className="text-rose-400 font-medium">Acil müdahale gerekli</span>
            ) : (
              <span className="text-emerald-400 font-medium">Kritik bulgu yok</span>
            )
          }
        />
      </AdminKpiGrid>

      {/* Filter Bar */}
      <section className={`${panel} flex flex-wrap items-center gap-2.5 p-3 shadow-sm`}>
        <select
          className={input}
          value={status}
          onChange={(event) => setStatus(parseStatusFilter(event.target.value))}
        >
          <option value="ALL">Tüm Durumlar</option>
          <option value="FAIL">Kritik</option>
          <option value="WARN">İnceleme Gerekli</option>
          <option value="PASS">Doğrulandı</option>
        </select>

        <select
          className={input}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="ALL">Tüm Kategoriler</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <span className="ml-auto text-[11px] text-slate-500">
          Görüntülenen: {filtered.length} bulgu
        </span>
      </section>

      {query.isError && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
          Güvenlik bulguları yüklenemedi.
        </div>
      )}

      {!query.isLoading && !query.isError && findings.length === 0 && (
        <div className={`${panel} p-8 text-center text-xs text-slate-400`}>
          {canManage ? "Kalıcı bulguları oluşturmak için güvenlik taramasını çalıştırın." : "Henüz güvenlik taraması çalıştırılmamış."}
        </div>
      )}

      <div className="grid gap-3.5 xl:grid-cols-2">
        {filtered.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            canManage={canManage}
            onOwner={(owner) => update.mutate({ id: finding.id, owner })}
            onTicket={() => ticket.mutate(finding.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  canManage,
  onOwner,
  onTicket,
}: {
  finding: PlatformSecurityFinding;
  canManage: boolean;
  onOwner: (owner: string | null) => void;
  onTicket: () => void;
}) {
  const meta = statusMeta[finding.verificationStatus];
  const Icon = meta.icon;
  const [owner, setOwner] = useState(finding.owner ?? "");

  return (
    <article className={`${panel} p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {finding.category} · {finding.severity}
          </span>
          <h2 className="mt-1 text-sm font-semibold text-white">{finding.title}</h2>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{finding.remediation}</p>
      <ul className="mt-2.5 space-y-1 rounded-lg bg-slate-950/80 p-2.5 text-[11px] text-slate-400">
        {finding.evidence.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
      <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
        <div>İlk: {new Date(finding.firstSeenAt).toLocaleDateString("tr-TR")}</div>
        <div>Son: {new Date(finding.lastSeenAt).toLocaleDateString("tr-TR")}</div>
        <div>Durum: {finding.status}</div>
        <div>Ticket: {finding.ticketId ?? "—"}</div>
      </dl>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-800/60">
          <input
            className={`${input} min-w-48 flex-1`}
            value={owner}
            placeholder="Sahip ekip veya kişi"
            onChange={(event) => setOwner(event.target.value)}
          />
          <button type="button" className={button} onClick={() => onOwner(owner.trim() || null)}>
            Sahibi Kaydet
          </button>
          <button
            type="button"
            className={button}
            disabled={Boolean(finding.ticketId)}
            onClick={onTicket}
          >
            <Ticket className="mr-1 inline h-3.5 w-3.5" />
            {finding.ticketId ? "Ticket Bağlı" : "Ticket Oluştur"}
          </button>
        </div>
      )}
    </article>
  );
}
