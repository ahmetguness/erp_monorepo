import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import {
  exportPlatformAudit,
  verifyPlatformAuditIntegrity,
} from "../src/modules/platform/platform-audit/platform-audit.service.js";

const total = 10_050;
const moduleName = "TEST_E2E_AUDIT_LARGE_EXPORT";
function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const hashPayload = (value: unknown) =>
  createHash("sha256").update(stable(value)).digest("hex");

async function main() {
  assert.match(
    process.env.DATABASE_URL ?? "",
    /schema=audit_export_assurance(?:&|$)/,
    "Disposable audit schema zorunludur.",
  );
  await prisma.platformAuditPolicy.upsert({
    where: { id: "default" },
    create: { id: "default", retentionDays: 2555 },
    update: {},
  });
  const createdAt = new Date("2026-10-13T09:00:00.000Z");
  const retentionUntil = new Date("2033-10-11T09:00:00.000Z");
  let previousHash: string | null = null;
  const rows: Prisma.PlatformAdminAuditLogCreateManyInput[] = [];
  for (let index = 0; index < total; index += 1) {
    const id = `audit-large-${index.toString().padStart(5, "0")}`;
    const reason =
      index === 0
        ? '=HYPERLINK("https://invalid.test","formula")'
        : `row-${index}`;
    const base = {
      id,
      actorId: null,
      action: "EXPORT_TEST",
      module: moduleName,
      targetType: "large-export",
      targetId: id,
      outcome: "SUCCESS",
      reason,
      approvalId: null,
      ipAddress: null,
      device: "assurance",
      requestId: null,
      correlationId: null,
      beforeValues: null,
      afterValues: { index },
      changedFields: [{ field: "index", before: null, after: index }],
      previousHash,
      retentionUntil,
      createdAt,
    };
    const hash = hashPayload(base);
    rows.push({
      ...base,
      beforeValues: Prisma.JsonNull,
      afterValues: { index },
      changedFields: base.changedFields,
      hash,
    });
    previousHash = hash;
  }
  for (let offset = 0; offset < rows.length; offset += 1000)
    await prisma.platformAdminAuditLog.createMany({
      data: rows.slice(offset, offset + 1000),
    });
  const eligible = await prisma.platformAdminAuditLog.count({
    where: { module: moduleName },
  });
  assert.equal(eligible, total);
  const jsonExport = await exportPlatformAudit({ module: moduleName }, "json");
  const entries = JSON.parse(jsonExport.body) as Array<{ id: string }>;
  const csvExport = await exportPlatformAudit({ module: moduleName }, "csv");
  const csvRows = csvExport.body.slice(1).split("\r\n").slice(1);
  assert.equal(entries.length, eligible);
  assert.equal(csvRows.length, eligible);
  const ids = entries.map((entry) => entry.id);
  const unique = new Set(ids);
  assert.equal(unique.size, eligible);
  assert.deepEqual(ids, [...ids].sort().reverse());
  assert.equal(
    rows.every((row) => unique.has(String(row.id))),
    true,
  );
  assert.equal(
    csvExport.body.includes('"\'=HYPERLINK(""https://invalid.test""'),
    true,
  );
  const integrity = await verifyPlatformAuditIntegrity();
  assert.deepEqual(integrity, {
    valid: true,
    checked: total,
    brokenAtId: null,
  });
  console.log(
    `Platform audit large export PASS: eligible=${eligible}, json=${entries.length}, csv=${csvRows.length}, unique=${unique.size}, integrity=${integrity.checked}`,
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
