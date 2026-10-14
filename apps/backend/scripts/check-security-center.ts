import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  createSecurityTicket,
  getSecurityCenter,
  scanSecurityCenter,
  updateSecurityFinding,
} from "../src/modules/platform/security-center/index.js";

async function main(): Promise<void> {
  const center = await scanSecurityCenter();
  assert.ok(
    center.findings.length >= 10,
    "Beklenen platform güvenlik kontrolleri oluşmadı",
  );
  const requiredKeys = [
    "transport:tls",
    "http:csp",
    "http:cors",
    "http:cookie",
    "key:application",
    "identity:admin-mfa",
    "dependencies:vulnerabilities",
    "backup:encryption",
    "backup:restore-test",
    "webhook:signature",
    "storage:access",
  ];
  for (const key of requiredKeys)
    assert.ok(
      center.findings.some((item) => item.key === key),
      `${key} kontrolü eksik`,
    );
  assert.ok(
    center.findings.every(
      (item) =>
        item.remediation.length > 10 && item.firstSeenAt && item.lastSeenAt,
    ),
  );
  const priority = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
  for (let index = 1; index < center.findings.length; index += 1) {
    assert.ok(
      priority[center.findings[index - 1]!.severity] >=
        priority[center.findings[index]!.severity],
      "Bulgular severity önceliğine göre sıralanmadı",
    );
  }

  const serialized = JSON.stringify(center);
  for (const secretName of [
    "JWT_SECRET",
    "ADMIN_JWT_SECRET",
    "ENCRYPTION_KEY",
    "DATABASE_URL",
  ]) {
    const value = process.env[secretName];
    if (value)
      assert.equal(
        serialized.includes(value),
        false,
        `${secretName} değeri bulgu verisine sızdı`,
      );
  }

  const concurrentFinding = await prisma.platformSecurityFinding.create({
    data: {
      key: `TEST_E2E_SECURITY_TICKET_${Date.now()}_${process.pid}`,
      title: "Concurrent ticket assurance",
      category: "ASSURANCE",
      severity: "HIGH",
      status: "OPEN",
      verificationStatus: "FAIL",
      remediation: "Test fixture remediation text.",
      evidence: ["fixture"],
    },
  });
  try {
    const results = await Promise.allSettled([
      createSecurityTicket(concurrentFinding.id, "SEC-CONCURRENT-A"),
      createSecurityTicket(concurrentFinding.id, "SEC-CONCURRENT-B"),
    ]);
    assert.equal(
      results.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter((item) => item.status === "rejected").length,
      1,
    );
    const persisted = await prisma.platformSecurityFinding.findUniqueOrThrow({
      where: { id: concurrentFinding.id },
    });
    assert.ok(
      ["SEC-CONCURRENT-A", "SEC-CONCURRENT-B"].includes(
        persisted.ticketId ?? "",
      ),
    );
  } finally {
    await prisma.platformSecurityFinding.delete({
      where: { id: concurrentFinding.id },
    });
  }

  const target =
    center.findings.find(
      (item) => !item.ticketId && item.verificationStatus !== "PASS",
    ) ??
    center.findings.find((item) => !item.ticketId) ??
    center.findings[0];
  assert.ok(target, "Test edilecek bulgu bulunamadı");
  const original = await prisma.platformSecurityFinding.findUniqueOrThrow({
    where: { id: target.id },
  });
  try {
    const assigned = await updateSecurityFinding(target.id, {
      owner: "Security Operations",
      status: "ACKNOWLEDGED",
    });
    assert.equal(assigned.owner, "Security Operations");
    const ticketed = await createSecurityTicket(
      target.id,
      `SEC-TEST-${Date.now()}`,
    );
    assert.ok(ticketed.ticketId?.startsWith("SEC-TEST-"));
    await scanSecurityCenter();
    const reloaded = await getSecurityCenter();
    assert.equal(
      reloaded.findings.find((item) => item.id === target.id)?.ticketId,
      ticketed.ticketId,
    );
    if (target.verificationStatus !== "PASS") {
      assert.equal(
        reloaded.findings.find((item) => item.id === target.id)?.status,
        "ACKNOWLEDGED",
      );
    }
  } finally {
    await prisma.platformSecurityFinding.update({
      where: { id: target.id },
      data: {
        owner: original.owner,
        status: original.status,
        ticketId: original.ticketId,
        resolvedAt: original.resolvedAt,
      },
    });
  }
  console.log(
    "Actionable security center: OK (persistent findings, ownership, verification, ticket, secret redaction)",
  );
}

main().finally(() => prisma.$disconnect());
