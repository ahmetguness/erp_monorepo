"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompleteRestoreDrillInput, CreateRestoreDrillInput, RecordBackupInput } from "@repo/types";
import {
  DatabaseBackup,
  RefreshCw,
  ShieldCheck,
  Activity,
  Clock,
  RotateCcw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Play,
} from "lucide-react";
import { canAdmin } from "@/lib/admin/permissions";
import { completeRestoreDrill, createRestoreDrill, getDisasterRecoveryOverview, recordBackup } from "@/services/disaster-recovery.service";
import { useAdminAuthStore } from "@/store/admin-auth.store";
import { toast } from "@/store/ui.store";
import { AdminPageHeader, AdminKpiGrid, AdminKpiCard } from "../ui";

const panel = "rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm shadow-inner";
const field = "rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors";
const button = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
const primaryButton = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/20 px-3.5 py-2 text-xs font-semibold text-sky-300 transition-all hover:bg-sky-500/30 hover:border-sky-500/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

const initialBackup: RecordBackupInput = { providerRef: "", status: "SUCCESS", sizeBytes: "", encrypted: true, region: "", startedAt: "", completedAt: "" };
const initialDrill: CreateRestoreDrillInput = { backupId: "", environment: "dr-validation", runbookUrl: "", approvalId: "" };
const initialResult: CompleteRestoreDrillInput = { status: "PASSED", recoveryPointAt: "", actualRpoMinutes: 0, actualRtoMinutes: 0, notes: "" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR") : "—";
const bytes = (value: string) => `${(Number(value) / 1_073_741_824).toFixed(2)} GB`;

export function DisasterRecoveryPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = canAdmin(admin, "operations.manage");
  const client = useQueryClient();
  const [backup, setBackup] = useState(initialBackup);
  const [drill, setDrill] = useState(initialDrill);
  const [selectedDrillId, setSelectedDrillId] = useState("");
  const [result, setResult] = useState(initialResult);
  const query = useQuery({ queryKey: ["admin", "disaster-recovery"], queryFn: getDisasterRecoveryOverview });
  const refresh = async () => client.invalidateQueries({ queryKey: ["admin", "disaster-recovery"] });

  const backupMutation = useMutation({
    mutationFn: () => recordBackup(backup),
    onSuccess: async () => {
      setBackup(initialBackup);
      await refresh();
      toast.success("Yedek kanıtı kaydedildi.");
    },
  });

  const drillMutation = useMutation({
    mutationFn: () => createRestoreDrill(drill),
    onSuccess: async () => {
      setDrill(initialDrill);
      await refresh();
      toast.success("İzole restore tatbikatı başlatıldı.");
    },
  });

  const resultMutation = useMutation({
    mutationFn: () => completeRestoreDrill(selectedDrillId, result),
    onSuccess: async () => {
      setSelectedDrillId("");
      setResult(initialResult);
      await refresh();
      toast.success("Restore tatbikatı doğrulandı.");
    },
  });

  const data = query.data;
  const isHealthy = data?.health === "HEALTHY";

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Yedekleme ve Felaket Kurtarma"
        description="Yedek kanıtı, replikasyon sağlığı ve izole geri yükleme tatbikatları"
        icon={DatabaseBackup}
        iconTone="sky"
        badge={
          data ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${
                isHealthy
                  ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 ring-amber-500/20"
              }`}
            >
              Sağlık: {data.health}
            </span>
          ) : undefined
        }
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className={button}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>
        }
      />

      {query.isError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>Felaket kurtarma görünümü yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.</span>
        </div>
      )}

      {/* KPI Overview Grid */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Sistem Sağlığı"
          value={data?.health ?? "—"}
          subtext="Genel felaket kurtarma durumu"
          icon={Activity}
          iconTone={isHealthy ? "emerald" : "amber"}
        />
        <AdminKpiCard
          label="Hedef RPO"
          value={data?.policy ? `${data.policy.targetRpoMinutes} dk` : "—"}
          subtext="Maksimum veri kaybı toleransı"
          icon={Clock}
          iconTone="sky"
        />
        <AdminKpiCard
          label="Hedef RTO"
          value={data?.policy ? `${data.policy.targetRtoMinutes} dk` : "—"}
          subtext="Maksimum kesinti toleransı"
          icon={RotateCcw}
          iconTone="indigo"
        />
        <AdminKpiCard
          label="Replikasyon Sınırı"
          value={data?.policy ? `${data.policy.maxReplicationLagSeconds} sn` : "—"}
          subtext="Maks tolerans gecikmesi"
          icon={HardDrive}
          iconTone="amber"
        />
      </AdminKpiGrid>

      {/* Highlights: Son Yedek ve Son Tatbikat */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel}>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Son Başarılı Yedek</h2>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Aktif Doğrulandı
            </span>
          </div>
          <Info backup={data?.lastSuccessfulBackup ?? null} />
        </section>

        <section className={panel}>
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Son Restore Tatbikatı</h2>
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 ring-1 ring-sky-500/20">
              <RotateCcw className="h-3 w-3" />
              Tatbikat Kaydı
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
              <span className="text-slate-500">Durum:</span>
              <p className="mt-1 font-semibold text-white">{data?.lastRestoreDrill?.status ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
              <span className="text-slate-500">Ortam:</span>
              <p className="mt-1 font-semibold text-white">{data?.lastRestoreDrill?.environment ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
              <span className="text-slate-500">Gerçekleşen RPO:</span>
              <p className="mt-1 font-semibold text-white">{data?.lastRestoreDrill?.actualRpoMinutes !== undefined ? `${data.lastRestoreDrill.actualRpoMinutes} dk` : "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
              <span className="text-slate-500">Gerçekleşen RTO:</span>
              <p className="mt-1 font-semibold text-white">{data?.lastRestoreDrill?.actualRtoMinutes !== undefined ? `${data.lastRestoreDrill.actualRtoMinutes} dk` : "—"}</p>
            </div>
            <div className="col-span-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
              <span className="text-slate-500">Tamamlanma Zamanı:</span>
              <p className="mt-1 font-mono text-slate-300">{date(data?.lastRestoreDrill?.completedAt ?? null)}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Operatör Yönetim Formları */}
      {canManage && (
        <div className="grid gap-4 xl:grid-cols-3">
          <BackupForm
            value={backup}
            onChange={setBackup}
            onSubmit={() => backupMutation.mutate()}
            pending={backupMutation.isPending}
          />
          <DrillForm
            value={drill}
            backups={data?.backups.filter((item) => item.status === "SUCCESS" && item.encrypted) ?? []}
            onChange={setDrill}
            onSubmit={() => drillMutation.mutate()}
            pending={drillMutation.isPending}
          />
          <DrillResultForm
            drillId={selectedDrillId}
            value={result}
            drills={data?.restoreDrills.filter((item) => item.status === "RUNNING" || item.status === "PLANNED") ?? []}
            onDrillChange={setSelectedDrillId}
            onChange={setResult}
            onSubmit={() => resultMutation.mutate()}
            pending={resultMutation.isPending}
          />
        </div>
      )}

      {/* Yedek Geçmişi Tablosu */}
      <section className={panel}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Yedek Geçmişi ve Kanıt Kayıtları</h2>
          <span className="text-xs text-slate-500">{data?.backups.length ?? 0} kayıt listelendi</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-3 pl-2 font-medium">Provider Ref</th>
                <th className="pb-3 font-medium">Durum</th>
                <th className="pb-3 font-medium">Boyut</th>
                <th className="pb-3 font-medium">Şifreleme</th>
                <th className="pb-3 font-medium">Bölge / Replika</th>
                <th className="pb-3 font-medium">Gecikme</th>
                <th className="pb-3 pr-2 font-medium">Tamamlanma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {data?.backups && data.backups.length > 0 ? (
                data.backups.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-800/30">
                    <td className="py-3 pl-2 font-sans font-medium text-slate-200">{item.providerRef}</td>
                    <td>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.status === "SUCCESS"
                          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{bytes(item.sizeBytes)}</td>
                    <td>
                      {item.encrypted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>KMS Doğrulandı</span>
                        </span>
                      ) : (
                        <span className="text-rose-400">Hayır</span>
                      )}
                    </td>
                    <td>{item.region} / {item.replicaRegion ?? "—"}</td>
                    <td>{item.replicationLagSeconds ?? "—"} sn</td>
                    <td className="pr-2">{date(item.completedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center font-sans text-xs text-slate-500">
                    Henüz kayıtlı yedek kanıtı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Info({ backup }: { backup: Awaited<ReturnType<typeof getDisasterRecoveryOverview>>["lastSuccessfulBackup"] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
        <span className="text-slate-500">Referans:</span>
        <p className="mt-1 font-semibold text-white">{backup?.providerRef ?? "—"}</p>
      </div>
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
        <span className="text-slate-500">Boyut:</span>
        <p className="mt-1 font-semibold text-white">{backup ? bytes(backup.sizeBytes) : "—"}</p>
      </div>
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
        <span className="text-slate-500">Şifreleme:</span>
        <p className="mt-1 font-semibold text-emerald-400">{backup?.encrypted ? "KMS Şifreli" : "—"}</p>
      </div>
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
        <span className="text-slate-500">Bölgeler:</span>
        <p className="mt-1 font-semibold text-white">{backup?.region ?? "—"} / {backup?.replicaRegion ?? "—"}</p>
      </div>
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
        <span className="text-slate-500">Gecikme:</span>
        <p className="mt-1 font-semibold text-white">{backup?.replicationLagSeconds !== undefined ? `${backup.replicationLagSeconds} sn` : "—"}</p>
      </div>
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
        <span className="text-slate-500">Tamamlanma Zamanı:</span>
        <p className="mt-1 font-mono text-slate-300">{date(backup?.completedAt ?? null)}</p>
      </div>
    </div>
  );
}

function BackupForm({
  value,
  onChange,
  onSubmit,
  pending,
}: {
  value: RecordBackupInput;
  onChange: (value: RecordBackupInput) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <section className={panel}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Yedek Kanıtı Kaydet</h2>
      <p className="mt-1 text-[11px] text-slate-400">Bulut sağlayıcısından alınan yedek metaverisi</p>
      <div className="mt-4 grid gap-2.5">
        <input className={field} placeholder="Provider referansı" value={value.providerRef} onChange={(e) => onChange({ ...value, providerRef: e.target.value })} />
        <input className={field} placeholder="Boyut (byte)" value={value.sizeBytes} onChange={(e) => onChange({ ...value, sizeBytes: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className={field} placeholder="Ana bölge" value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })} />
          <input className={field} placeholder="Replika bölge" value={value.replicaRegion ?? ""} onChange={(e) => onChange({ ...value, replicaRegion: e.target.value || undefined })} />
        </div>
        <input className={field} type="number" min={0} placeholder="Replikasyon gecikmesi (sn)" value={value.replicationLagSeconds ?? ""} onChange={(e) => onChange({ ...value, replicationLagSeconds: e.target.value ? Number(e.target.value) : undefined })} />
        <input className={field} placeholder="KMS anahtar referansı" value={value.encryptionKeyRef ?? ""} onChange={(e) => onChange({ ...value, encryptionKeyRef: e.target.value || undefined })} />
        <div>
          <label className="mb-1 block text-[10px] text-slate-400">Başlangıç Zamanı</label>
          <input className={`${field} w-full`} type="datetime-local" value={value.startedAt} onChange={(e) => onChange({ ...value, startedAt: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-slate-400">Bitiş Zamanı</label>
          <input className={`${field} w-full`} type="datetime-local" value={value.completedAt} onChange={(e) => onChange({ ...value, completedAt: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-300">
          <input type="checkbox" checked={value.encrypted} onChange={(e) => onChange({ ...value, encrypted: e.target.checked })} className="rounded border-slate-700 bg-slate-900 text-sky-500" />
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Şifreleme doğrulandı</span>
        </label>
        <button className={primaryButton} disabled={pending || !value.providerRef} onClick={onSubmit}>
          {pending ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </section>
  );
}

function DrillForm({
  value,
  backups,
  onChange,
  onSubmit,
  pending,
}: {
  value: CreateRestoreDrillInput;
  backups: Array<{ id: string; providerRef: string }>;
  onChange: (value: CreateRestoreDrillInput) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <section className={panel}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">İzole Restore Tatbikatı</h2>
      <p className="mt-1 text-[11px] text-amber-400">Prod hedefleri reddedilir; runbook zorunludur.</p>
      <div className="mt-4 grid gap-2.5">
        <select className={field} value={value.backupId} onChange={(e) => onChange({ ...value, backupId: e.target.value })}>
          <option value="">Şifreli başarılı yedek seçin</option>
          {backups.map((item) => (
            <option key={item.id} value={item.id}>
              {item.providerRef}
            </option>
          ))}
        </select>
        <input className={field} placeholder="İzole ortam" value={value.environment} onChange={(e) => onChange({ ...value, environment: e.target.value })} />
        <input className={field} placeholder="https://runbook..." value={value.runbookUrl} onChange={(e) => onChange({ ...value, runbookUrl: e.target.value })} />
        <input className={field} placeholder="Onay kimliği" value={value.approvalId} onChange={(e) => onChange({ ...value, approvalId: e.target.value })} />
        <button className={primaryButton} disabled={pending || !value.backupId} onClick={onSubmit}>
          <Play className="h-3.5 w-3.5" />
          <span>{pending ? "Başlatılıyor..." : "Tatbikatı Başlat"}</span>
        </button>
      </div>
    </section>
  );
}

function DrillResultForm({
  drillId,
  value,
  drills,
  onDrillChange,
  onChange,
  onSubmit,
  pending,
}: {
  drillId: string;
  value: CompleteRestoreDrillInput;
  drills: Array<{ id: string; environment: string }>;
  onDrillChange: (id: string) => void;
  onChange: (value: CompleteRestoreDrillInput) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <section className={panel}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Tatbikat Sonucu Doğrula</h2>
      <p className="mt-1 text-[11px] text-slate-400">Tamamlanan tatbikat RPO/RTO ölçümleri</p>
      <div className="mt-4 grid gap-2.5">
        <select className={field} value={drillId} onChange={(e) => onDrillChange(e.target.value)}>
          <option value="">Çalışan tatbikatı seçin</option>
          {drills.map((item) => (
            <option key={item.id} value={item.id}>
              {item.environment}
            </option>
          ))}
        </select>
        <select className={field} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value === "FAILED" ? "FAILED" : "PASSED" })}>
          <option value="PASSED">Başarılı (PASSED)</option>
          <option value="FAILED">Başarısız (FAILED)</option>
        </select>
        <div>
          <label className="mb-1 block text-[10px] text-slate-400">Kurtarma Noktası</label>
          <input className={`${field} w-full`} type="datetime-local" value={value.recoveryPointAt} onChange={(e) => onChange({ ...value, recoveryPointAt: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={field} type="number" min={0} placeholder="Gerçek RPO (dk)" value={value.actualRpoMinutes} onChange={(e) => onChange({ ...value, actualRpoMinutes: Number(e.target.value) })} />
          <input className={field} type="number" min={0} placeholder="Gerçek RTO (dk)" value={value.actualRtoMinutes} onChange={(e) => onChange({ ...value, actualRtoMinutes: Number(e.target.value) })} />
        </div>
        <input className={field} placeholder="Doğrulama notu" value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
        <button className={primaryButton} disabled={pending || !drillId} onClick={onSubmit}>
          {pending ? "Kaydediliyor..." : "Sonucu Kaydet"}
        </button>
      </div>
    </section>
  );
}
