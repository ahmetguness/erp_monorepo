import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createRestoreDrillSchema, recordBackupSchema } from "../src/modules/platform/disaster-recovery/disaster-recovery.schemas.js";
import { completeRestoreDrill, createRestoreDrill, getDisasterRecoveryOverview, recordBackupEvidence } from "../src/modules/platform/disaster-recovery/disaster-recovery.service.js";

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirstOrThrow({ where: { isActive: true }, select: { id: true } });
  const now = new Date();
  const startedAt = new Date(now.getTime() - 15 * 60_000);
  const providerRef = `dr-test-${Date.now()}`;
  const backup = await recordBackupEvidence({ providerRef, status: "SUCCESS", sizeBytes: "1073741824", encrypted: true, encryptionKeyRef: "kms-test-key", region: "eu-central-1", replicaRegion: "eu-west-1", replicationLagSeconds: 12, startedAt, completedAt: now }, admin.id);
  let drillId: string | null = null;
  try {
    assert.equal(recordBackupSchema.safeParse({ providerRef: "bad", status: "SUCCESS", sizeBytes: "9223372036854775808", encrypted: true, region: "eu", startedAt, completedAt: now }).success, false);
    assert.equal(recordBackupSchema.safeParse({ providerRef: "bad-kms", status: "SUCCESS", sizeBytes: "1", encrypted: true, region: "eu", startedAt, completedAt: now }).success, false);
    assert.equal(createRestoreDrillSchema.safeParse({ backupId: backup.id, environment: "production", runbookUrl: "https://runbooks.example/dr", approvalId: "APR-1" }).success, false);
    const drill = await createRestoreDrill({ backupId: backup.id, environment: "dr-validation-test", runbookUrl: "https://runbooks.example/dr", approvalId: "APR-TEST" }, admin.id);
    drillId = drill.id;
    assert.equal(drill.status, "RUNNING");
    const completed = await completeRestoreDrill(drill.id, { status: "PASSED", recoveryPointAt: startedAt, actualRpoMinutes: 15, actualRtoMinutes: 20, notes: "İzole ortamda veri bütünlüğü doğrulandı." });
    assert.equal(completed.status, "PASSED");
    await assert.rejects(() => completeRestoreDrill(drill.id, { status: "FAILED", recoveryPointAt: startedAt, actualRpoMinutes: 15, actualRtoMinutes: 20, notes: "İkinci sonuç kabul edilmemelidir." }), /yeniden değiştirilemez/);
    const overview = await getDisasterRecoveryOverview();
    assert.equal(overview.latestBackup?.providerRef, providerRef);
    assert.equal(overview.lastRestoreDrill?.id, drill.id);
    assert.equal(overview.latestBackup?.encrypted, true);
    assert.equal(overview.latestBackup?.replicationLagSeconds, 12);
  } finally {
    if (drillId) await prisma.platformRestoreDrill.delete({ where: { id: drillId } });
    await prisma.platformBackupEvidence.delete({ where: { id: backup.id } });
  }
  console.log("Disaster recovery integration: OK (backup evidence, RPO/RTO, replication, isolated approved restore)");
}
main().finally(() => prisma.$disconnect());
