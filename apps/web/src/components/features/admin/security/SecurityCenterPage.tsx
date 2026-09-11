"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformSecurityFinding, SecurityVerificationStatus } from "@repo/types";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Ticket, XCircle } from "lucide-react";
import { canAdmin } from "@/lib/admin/permissions";
import { createSecurityTicket, getSecurityCenter, scanSecurityCenter, updateSecurityFinding } from "@/services/security-center.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";

const panel = "rounded-2xl border border-slate-800 bg-slate-900/70";
const input = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200";
const button = "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 disabled:opacity-40";
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
  const scan = useMutation({ mutationFn: scanSecurityCenter, onSuccess: async () => { await refresh(); toast.success("Güvenlik taraması tamamlandı."); } });
  const update = useMutation({ mutationFn: ({ id, owner }: { id: string; owner: string | null }) => updateSecurityFinding(id, { owner }), onSuccess: refresh });
  const ticket = useMutation({ mutationFn: (id: string) => createSecurityTicket(id), onSuccess: async () => { await refresh(); toast.success("Bulgu ticket'a dönüştürüldü."); } });
  const findings = useMemo(() => query.data?.findings ?? [], [query.data?.findings]);
  const categories = useMemo(() => [...new Set(findings.map((item) => item.category))].sort(), [findings]);
  const filtered = findings.filter((item) => (status === "ALL" || item.verificationStatus === status) && (category === "ALL" || item.category === category));

  return <div className="space-y-5 pb-12">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold text-white"><ShieldCheck className="text-emerald-400" />Platform Güvenlik Merkezi</h1><p className="mt-1 text-xs text-slate-400">Kalıcı bulgular, sahiplik, çözüm adımları ve doğrulama kanıtları</p></div>
      {canManage && <button className={button} disabled={scan.isPending} onClick={() => scan.mutate()}><RefreshCw className={`mr-2 inline h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />Taramayı çalıştır</button>}
    </header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Toplam" value={query.data?.summary.total ?? 0} /><Metric label="Açık" value={query.data?.summary.open ?? 0} />
      <Metric label="Başarılı" value={query.data?.summary.passing ?? 0} tone="good" /><Metric label="Uyarı" value={query.data?.summary.warning ?? 0} tone="warn" /><Metric label="Kritik" value={query.data?.summary.failing ?? 0} tone="bad" />
    </div>
    <section className={`${panel} flex flex-wrap gap-2 p-4`}>
      <select className={input} value={status} onChange={(event) => setStatus(parseStatusFilter(event.target.value))}><option value="ALL">Tüm durumlar</option><option value="FAIL">Kritik</option><option value="WARN">İnceleme gerekli</option><option value="PASS">Doğrulandı</option></select>
      <select className={input} value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Tüm kategoriler</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <span className="ml-auto self-center text-xs text-slate-500">Son tarama: {query.data?.summary.lastScannedAt ? new Date(query.data.summary.lastScannedAt).toLocaleString("tr-TR") : "Henüz çalıştırılmadı"}</span>
    </section>
    {query.isError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">Güvenlik bulguları yüklenemedi.</div>}
    {!query.isLoading && !query.isError && findings.length === 0 && <div className={`${panel} p-8 text-center text-sm text-slate-400`}>{canManage ? "Kalıcı bulguları oluşturmak için güvenlik taramasını çalıştırın." : "Henüz güvenlik taraması çalıştırılmamış."}</div>}
    <div className="grid gap-4 xl:grid-cols-2">{filtered.map((finding) => <FindingCard key={finding.id} finding={finding} canManage={canManage} onOwner={(owner) => update.mutate({ id: finding.id, owner })} onTicket={() => ticket.mutate(finding.id)} />)}</div>
  </div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return <div className={`${panel} p-4`}><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p></div>;
}

function FindingCard({ finding, canManage, onOwner, onTicket }: { finding: PlatformSecurityFinding; canManage: boolean; onOwner: (owner: string | null) => void; onTicket: () => void }) {
  const meta = statusMeta[finding.verificationStatus]; const Icon = meta.icon;
  const [owner, setOwner] = useState(finding.owner ?? "");
  return <article className={`${panel} p-5`}>
    <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{finding.category} · {finding.severity}</span><h2 className="mt-1 font-semibold text-white">{finding.title}</h2></div><span className={`flex items-center gap-1 text-xs ${meta.color}`}><Icon className="h-4 w-4" />{meta.label}</span></div>
    <p className="mt-3 text-xs leading-5 text-slate-300">{finding.remediation}</p>
    <ul className="mt-3 space-y-1 rounded-lg bg-slate-950 p-3 text-xs text-slate-400">{finding.evidence.map((item) => <li key={item}>• {item}</li>)}</ul>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500"><div>İlk görülme: {new Date(finding.firstSeenAt).toLocaleString("tr-TR")}</div><div>Son görülme: {new Date(finding.lastSeenAt).toLocaleString("tr-TR")}</div><div>Durum: {finding.status}</div><div>Ticket: {finding.ticketId ?? "—"}</div></dl>
    {canManage && <div className="mt-4 flex flex-wrap gap-2"><input className={`${input} min-w-48 flex-1`} value={owner} placeholder="Sahip ekip veya kişi" onChange={(event) => setOwner(event.target.value)} /><button className={button} onClick={() => onOwner(owner.trim() || null)}>Sahibi kaydet</button><button className={button} disabled={Boolean(finding.ticketId)} onClick={onTicket}><Ticket className="mr-1 inline h-4 w-4" />{finding.ticketId ? "Ticket bağlı" : "Ticket oluştur"}</button></div>}
  </article>;
}
