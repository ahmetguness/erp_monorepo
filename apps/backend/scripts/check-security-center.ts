import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createSecurityTicket, getSecurityCenter, scanSecurityCenter, updateSecurityFinding } from "../src/modules/platform/security-center/index.js";

async function main(): Promise<void> {
  const center = await scanSecurityCenter();
  assert.ok(center.findings.length >= 10, "Beklenen platform güvenlik kontrolleri oluşmadı");
  const requiredKeys = ["transport:tls", "http:csp", "http:cors", "http:cookie", "key:application", "identity:admin-mfa", "dependencies:vulnerabilities", "backup:encryption", "backup:restore-test", "webhook:signature", "storage:access"];
  for (const key of requiredKeys) assert.ok(center.findings.some((item) => item.key === key), `${key} kontrolü eksik`);
  assert.ok(center.findings.every((item) => item.remediation.length > 10 && item.firstSeenAt && item.lastSeenAt));

  const serialized = JSON.stringify(center);
  for (const secretName of ["JWT_SECRET", "ADMIN_JWT_SECRET", "ENCRYPTION_KEY", "DATABASE_URL"]) {
    const value = process.env[secretName];
    if (value) assert.equal(serialized.includes(value), false, `${secretName} değeri bulgu verisine sızdı`);
  }

  const target = center.findings.find((item) => !item.ticketId && item.verificationStatus !== "PASS")
    ?? center.findings.find((item) => !item.ticketId)
    ?? center.findings[0];
  assert.ok(target, "Test edilecek bulgu bulunamadı");
  const original = await prisma.platformSecurityFinding.findUniqueOrThrow({ where: { id: target.id } });
  try {
    const assigned = await updateSecurityFinding(target.id, { owner: "Security Operations", status: "ACKNOWLEDGED" });
    assert.equal(assigned.owner, "Security Operations");
    const ticketed = await createSecurityTicket(target.id, `SEC-TEST-${Date.now()}`);
    assert.ok(ticketed.ticketId?.startsWith("SEC-TEST-"));
    await scanSecurityCenter();
    const reloaded = await getSecurityCenter();
    assert.equal(reloaded.findings.find((item) => item.id === target.id)?.ticketId, ticketed.ticketId);
    if (target.verificationStatus !== "PASS") {
      assert.equal(reloaded.findings.find((item) => item.id === target.id)?.status, "ACKNOWLEDGED");
    }
  } finally {
    await prisma.platformSecurityFinding.update({
      where: { id: target.id },
      data: { owner: original.owner, status: original.status, ticketId: original.ticketId, resolvedAt: original.resolvedAt },
    });
  }
  console.log("Actionable security center: OK (persistent findings, ownership, verification, ticket, secret redaction)");
}

main().finally(() => prisma.$disconnect());
