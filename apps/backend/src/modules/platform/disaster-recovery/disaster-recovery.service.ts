import type { Prisma } from "@prisma/client";
import type { BackupEvidence, DisasterRecoveryOverview, RestoreDrill } from "@repo/types";
import { ValidationError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import type { z } from "zod";
import type { completeRestoreDrillSchema, createRestoreDrillSchema, recordBackupSchema, updateDisasterRecoveryPolicySchema } from "./disaster-recovery.schemas.js";

type BackupRow = Prisma.PlatformBackupEvidenceGetPayload<Record<string, never>>;
type DrillRow = Prisma.PlatformRestoreDrillGetPayload<Record<string, never>>;
type RecordInput = z.infer<typeof recordBackupSchema>;
type DrillInput = z.infer<typeof createRestoreDrillSchema>;
type CompleteInput = z.infer<typeof completeRestoreDrillSchema>;
type PolicyInput = z.infer<typeof updateDisasterRecoveryPolicySchema>;

function mapBackup(row: BackupRow): BackupEvidence {
  return { id: row.id, providerRef: row.providerRef, status: row.status === "SUCCESS" ? "SUCCESS" : "FAILED", sizeBytes: row.sizeBytes.toString(), encrypted: row.encrypted, encryptionKeyRef: row.encryptionKeyRef, region: row.region, replicaRegion: row.replicaRegion, replicationLagSeconds: row.replicationLagSeconds, startedAt: row.startedAt.toISOString(), completedAt: row.completedAt.toISOString(), recordedAt: row.recordedAt.toISOString() };
}
function mapDrill(row: DrillRow): RestoreDrill {
  const status = row.status === "RUNNING" || row.status === "PASSED" || row.status === "FAILED" ? row.status : "PLANNED";
  return { id: row.id, backupId: row.backupId, status, environment: row.environment, runbookUrl: row.runbookUrl, approvalId: row.approvalId, requestedById: row.requestedById, startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null, recoveryPointAt: row.recoveryPointAt?.toISOString() ?? null, actualRpoMinutes: row.actualRpoMinutes, actualRtoMinutes: row.actualRtoMinutes, notes: row.notes, createdAt: row.createdAt.toISOString() };
}
export async function getDisasterRecoveryOverview(): Promise<DisasterRecoveryOverview> {
  const [policy, backups, drills] = await Promise.all([
    prisma.platformDisasterRecoveryPolicy.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.platformBackupEvidence.findMany({ orderBy: { completedAt: "desc" }, take: 50 }),
    prisma.platformRestoreDrill.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const latest = backups[0] ?? null;
  const successful = backups.find((item) => item.status === "SUCCESS") ?? null;
  const lastDrill = drills.find((item) => item.status === "PASSED" || item.status === "FAILED") ?? null;
  const backupStale = !successful || Date.now() - successful.completedAt.getTime() > policy.targetRpoMinutes * 60_000;
  const lagBad = latest?.replicationLagSeconds === null || latest?.replicationLagSeconds === undefined || latest.replicationLagSeconds > policy.maxReplicationLagSeconds;
  const restoreBad = !lastDrill || lastDrill.status !== "PASSED" || !lastDrill.completedAt || Date.now() - lastDrill.completedAt.getTime() > 90 * 86_400_000 || (lastDrill.actualRpoMinutes ?? Number.POSITIVE_INFINITY) > policy.targetRpoMinutes || (lastDrill.actualRtoMinutes ?? Number.POSITIVE_INFINITY) > policy.targetRtoMinutes;
  const health = !latest || latest.status === "FAILED" || !latest.encrypted ? "CRITICAL" : backupStale || lagBad || restoreBad ? "DEGRADED" : "HEALTHY";
  return { policy: { targetRpoMinutes: policy.targetRpoMinutes, targetRtoMinutes: policy.targetRtoMinutes, maxReplicationLagSeconds: policy.maxReplicationLagSeconds }, health, lastSuccessfulBackup: successful ? mapBackup(successful) : null, latestBackup: latest ? mapBackup(latest) : null, lastRestoreDrill: lastDrill ? mapDrill(lastDrill) : null, backups: backups.map(mapBackup), restoreDrills: drills.map(mapDrill) };
}
export async function recordBackupEvidence(input: RecordInput, adminId: string): Promise<BackupEvidence> {
  if (input.status === "SUCCESS" && input.sizeBytes === "0") throw new ValidationError("Başarılı yedek boyutu sıfır olamaz.");
  const row = await prisma.platformBackupEvidence.create({ data: { ...input, sizeBytes: BigInt(input.sizeBytes), encryptionKeyRef: input.encryptionKeyRef ?? null, replicaRegion: input.replicaRegion ?? null, replicationLagSeconds: input.replicationLagSeconds ?? null, recordedById: adminId } });
  return mapBackup(row);
}
export async function createRestoreDrill(input: DrillInput, adminId: string): Promise<RestoreDrill> {
  const backup = await prisma.platformBackupEvidence.findUnique({ where: { id: input.backupId } });
  if (!backup || backup.status !== "SUCCESS" || !backup.encrypted) throw new ValidationError("Restore tatbikatı yalnızca başarılı ve şifreli bir yedekle başlatılabilir.");
  return mapDrill(await prisma.platformRestoreDrill.create({ data: { ...input, requestedById: adminId, status: "RUNNING", startedAt: new Date() } }));
}
export async function completeRestoreDrill(id: string, input: CompleteInput): Promise<RestoreDrill> {
  const current = await prisma.platformRestoreDrill.findUnique({ where: { id } });
  if (!current) throw new ValidationError("Restore tatbikatı bulunamadı.");
  if (current.status === "PASSED" || current.status === "FAILED") throw new ValidationError("Tamamlanmış restore tatbikatı yeniden değiştirilemez.");
  const backup = await prisma.platformBackupEvidence.findUniqueOrThrow({ where: { id: current.backupId } });
  if (input.recoveryPointAt > backup.completedAt) throw new ValidationError("Kurtarma noktası yedek tamamlanma zamanından sonra olamaz.");
  const completedAt = new Date();
  const updated = await prisma.platformRestoreDrill.updateMany({
    where: { id, status: { in: ["PLANNED", "RUNNING"] } },
    data: { ...input, completedAt },
  });
  if (updated.count !== 1) throw new ValidationError("Restore tatbikatı başka bir işlem tarafından tamamlandı.");
  return mapDrill(await prisma.platformRestoreDrill.findUniqueOrThrow({ where: { id } }));
}
export async function updateDisasterRecoveryPolicy(input: PolicyInput, adminId: string): Promise<void> {
  await prisma.platformDisasterRecoveryPolicy.update({ where: { id: "default" }, data: { ...input, updatedById: adminId } });
}
