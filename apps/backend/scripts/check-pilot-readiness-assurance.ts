import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_PILOT_READINESS_${Date.now()}_${process.pid}`;
const tenantIds: string[] = [];
const adminIds: string[] = [];

async function http(path: string, token?: string) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main(): Promise<void> {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret, "ADMIN_JWT_SECRET is required");
  const roles = await prisma.adminRole.findMany({
    include: { permissions: { include: { adminPermission: true } } },
  });
  const superRole = roles.find((role) => role.key === "SUPER_ADMIN");
  const noOperationsRole = roles.find(
    (role) =>
      role.key !== "SUPER_ADMIN" &&
      !role.permissions.some(
        (item) => item.adminPermission.key === "operations.read",
      ),
  );
  assert.ok(superRole && noOperationsRole);
  const [admin, limited] = await Promise.all([
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-admin@test.invalid`,
        name: marker,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: superRole.id } },
      },
    }),
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-limited@test.invalid`,
        name: `${marker}_LIMITED`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: noOperationsRole.id } },
      },
    }),
  ]);
  adminIds.push(admin.id, limited.id);
  const [session, limitedSession] = await Promise.all([
    createAdminSession({
      adminId: admin.id,
      email: admin.email,
      tokenVersion: admin.tokenVersion,
      rememberMe: false,
      ipAddress: null,
      userAgent: marker,
      jwtSecret: secret,
    }),
    createAdminSession({
      adminId: limited.id,
      email: limited.email,
      tokenVersion: limited.tokenVersion,
      rememberMe: false,
      ipAddress: null,
      userAgent: marker,
      jwtSecret: secret,
    }),
  ]);
  const [tenantA, tenantB] = await Promise.all([
    prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-a`,
        companyName: `${marker} A`,
        email: `${marker.toLowerCase()}-a@test.invalid`,
        status: "ACTIVE",
        plan: "STARTER",
      },
    }),
    prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-b`,
        companyName: `${marker} B`,
        email: `${marker.toLowerCase()}-b@test.invalid`,
        status: "ACTIVE",
        plan: "STARTER",
      },
    }),
  ]);
  tenantIds.push(tenantA.id, tenantB.id);

  assert.equal(
    (await http(`/api/admin/tenants/${tenantA.id}/pilot-readiness`)).status,
    401,
  );
  assert.equal(
    (
      await http(
        `/api/admin/tenants/${tenantA.id}/pilot-readiness`,
        limitedSession.accessToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await http(
        `/api/admin/tenants/missing-${marker}/pilot-readiness`,
        session.accessToken,
      )
    ).status,
    404,
  );

  const clean = await http(
    `/api/admin/tenants/${tenantA.id}/pilot-readiness`,
    session.accessToken,
  );
  assert.equal(clean.status, 200);
  assert.equal(clean.body.data.tenant.id, tenantA.id);
  assert.equal(clean.body.data.report.decision, "NO_GO");
  assert.equal(clean.body.data.report.checks.length, 4);
  assert.equal(
    clean.body.data.report.checks.find(
      (item: { key: string }) => item.key === "stock_integrity",
    ).status,
    "PASS",
  );
  const listed = await http(
    `/api/admin/tenants?search=${encodeURIComponent(marker)}&limit=50&sortBy=companyName&sortDirection=asc`,
    session.accessToken,
  );
  assert.equal(listed.status, 200);
  assert.equal(listed.body.meta.total, 2);
  assert.deepEqual(
    listed.body.data.map((item: { id: string }) => item.id),
    [tenantA.id, tenantB.id],
  );
  assert.equal(
    (await http("/api/admin/tenants?limit=101", session.accessToken)).status,
    400,
  );

  const unitA = await prisma.unit.create({
    data: { tenantId: tenantA.id, name: "Adet", code: "AD" },
  });
  const unitB = await prisma.unit.create({
    data: { tenantId: tenantB.id, name: "Adet", code: "AD" },
  });
  const warehouseA = await prisma.warehouse.create({
    data: { tenantId: tenantA.id, name: "A", code: "A" },
  });
  const warehouseB = await prisma.warehouse.create({
    data: { tenantId: tenantB.id, name: "B", code: "B" },
  });
  const locationA = await prisma.location.create({
    data: {
      tenantId: tenantA.id,
      warehouseId: warehouseA.id,
      name: "A",
      code: "A",
    },
  });
  const locationB = await prisma.location.create({
    data: {
      tenantId: tenantB.id,
      warehouseId: warehouseB.id,
      name: "B",
      code: "B",
    },
  });
  const contactB = await prisma.contact.create({
    data: {
      tenantId: tenantB.id,
      type: "CUSTOMER",
      name: `${marker} Contact B`,
      code: "B",
    },
  });
  const [productA, productB] = await Promise.all([
    prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unitA.id,
        code: "A",
        name: `${marker} Product A`,
      },
    }),
    prisma.product.create({
      data: {
        tenantId: tenantB.id,
        unitId: unitB.id,
        code: "B",
        name: `${marker} Product B`,
      },
    }),
  ]);
  await Promise.all([
    prisma.stockLevel.create({
      data: {
        tenantId: tenantA.id,
        productId: productA.id,
        warehouseId: warehouseA.id,
        locationId: locationA.id,
        quantity: -1,
      },
    }),
    prisma.stockLevel.create({
      data: {
        tenantId: tenantA.id,
        productId: productB.id,
        warehouseId: warehouseB.id,
        locationId: locationB.id,
        quantity: 5,
      },
    }),
    prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: contactB.id,
        type: "SALES",
        status: "DRAFT",
        number: `${marker}-INV`,
        date: new Date(),
        totalNet: 0,
        totalTax: 0,
        totalGross: 0,
      },
    }),
  ]);

  const violated = await http(
    `/api/admin/tenants/${tenantA.id}/pilot-readiness`,
    session.accessToken,
  );
  assert.equal(violated.status, 200);
  const report = violated.body.data.report;
  assert.equal(report.decision, "NO_GO");
  assert.deepEqual(report.blockers, [
    "stock_integrity",
    "retry_safety",
    "tenant_isolation",
    "deterministic_flow",
  ]);
  const stock = report.checks.find(
    (item: { key: string }) => item.key === "stock_integrity",
  );
  const isolation = report.checks.find(
    (item: { key: string }) => item.key === "tenant_isolation",
  );
  assert.equal(stock.status, "FAIL");
  assert.ok(stock.evidence.includes("Negatif stok seviyesi: 1"));
  assert.ok(stock.evidence.includes("Tenant-çapraz stok seviyesi: 1"));
  assert.equal(isolation.status, "FAIL");
  assert.ok(isolation.evidence.includes("Tenant-çapraz fatura: 1"));
  assert.ok(isolation.evidence.includes("Tenant-çapraz stok: 1"));

  const tenantBReport = await http(
    `/api/admin/tenants/${tenantB.id}/pilot-readiness`,
    session.accessToken,
  );
  assert.equal(tenantBReport.status, 200);
  assert.equal(
    tenantBReport.body.data.report.checks.find(
      (item: { key: string }) => item.key === "stock_integrity",
    ).status,
    "PASS",
  );
  assert.equal(
    tenantBReport.body.data.report.checks.find(
      (item: { key: string }) => item.key === "tenant_isolation",
    ).evidence[0],
    "Tenant-çapraz fatura: 0",
  );

  console.log(
    "Pilot readiness assurance PASS: auth/RBAC, 404, clean/violated evidence, blocker ordering, tenant-scoped isolation and DB-backed recalculation verified.",
  );
}

main()
  .finally(async () => {
    if (tenantIds.length)
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    if (adminIds.length)
      await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    const remaining = await prisma.tenant.count({
      where: { companyName: { startsWith: marker } },
    });
    console.log(`cleanupRemaining=${remaining}`);
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
