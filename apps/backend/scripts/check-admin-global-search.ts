import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { searchAdminResources } from "../src/modules/platform/global-search/index.js";

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, email: true, companyName: true },
  });
  assert.ok(tenant, "Arama testi için tenant gerekli.");
  const byCompany = await searchAdminResources(tenant.companyName.slice(0, 8), [
    "search.read",
    "tenant.read",
  ]);
  const tenantResult = byCompany.results.find(
    (item) => item.kind === "TENANT" && item.id === tenant.id,
  );
  assert.ok(tenantResult, "Tenant global arama sonucunda bulunmalı.");
  assert.ok(
    !tenantResult.subtitle.includes(tenant.email),
    "E-posta maskelenmeli.",
  );

  const withoutSourcePermission = await searchAdminResources(
    tenant.companyName.slice(0, 8),
    ["search.read"],
  );
  assert.equal(withoutSourcePermission.results.length, 0);
  const requestId = `search-test-${Date.now()}`;
  const log = await prisma.observabilityLogEntry.create({
    data: {
      fingerprint: requestId,
      level: "INFO",
      service: "global-search-test",
      message: "Global search integration",
      requestId,
      occurredAt: new Date(),
    },
  });
  try {
    const traceSearch = await searchAdminResources(requestId, [
      "search.read",
      "operations.read",
    ]);
    const trace = traceSearch.results.find((item) => item.kind === "REQUEST");
    assert.ok(trace);
    assert.ok(trace.href.includes(encodeURIComponent(requestId)));
  } finally {
    await prisma.observabilityLogEntry.delete({ where: { id: log.id } });
  }
  console.log(
    "Admin global search integration: OK (permissions, masking, request routing)",
  );
}

main().finally(() => prisma.$disconnect());
