import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_ADMIN_TENANTS_${Date.now()}_${process.pid}`;

async function request(
  token: string | null,
  path: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const role = await prisma.adminRole.findUniqueOrThrow({
    where: { key: "SUPER_ADMIN" },
  });
  const admin = await prisma.adminUser.create({
    data: {
      email: `${marker.toLowerCase()}@test.local`,
      name: marker,
      password: "unused",
      mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: role.id } },
    },
  });
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A Türkçe`,
      email: `${marker}-a@test.local`,
      plan: "STARTER",
      status: "ACTIVE",
      city: "İstanbul",
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@test.local`,
      plan: "ENTERPRISE",
      status: "SUSPENDED",
      createdAt: new Date(Date.now() - 86_400_000),
    },
  });
  const deleted = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-deleted`,
      companyName: `${marker}_DELETED`,
      email: `${marker}-deleted@test.local`,
      status: "DELETED",
      deletedAt: new Date(),
    },
  });
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    assert.ok(secret);
    const session = await createAdminSession({
      adminId: admin.id,
      email: admin.email,
      tokenVersion: admin.tokenVersion,
      rememberMe: false,
      ipAddress: "127.0.0.1",
      userAgent: "admin-tenants-assurance",
      jwtSecret: secret,
    });
    const token = session.accessToken;

    assert.equal((await request(null, "/api/admin/tenants")).status, 401);
    const list = await request(
      token,
      `/api/admin/tenants?search=${encodeURIComponent(marker)}&status=ACTIVE&plan=STARTER&page=1&limit=1&sortBy=companyName&sortDirection=asc`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].id, tenantA.id);
    assert.equal(list.body.meta.total, 1);
    assert.equal(list.body.meta.pageSize, 1);
    assert.equal(
      (await request(token, "/api/admin/tenants?page=0")).status,
      400,
    );
    assert.equal(
      (await request(token, "/api/admin/tenants?page=1x")).status,
      400,
    );
    assert.equal(
      (await request(token, "/api/admin/tenants?limit=101")).status,
      400,
    );
    assert.equal(
      (await request(token, `/api/admin/tenants?search=${"x".repeat(101)}`))
        .status,
      400,
    );
    assert.equal(
      (await request(token, "/api/admin/tenants?status=INVALID")).status,
      400,
    );
    assert.equal(
      (await request(token, "/api/admin/tenants?plan=INVALID")).status,
      400,
    );
    assert.equal(
      (await request(token, "/api/admin/tenants?from=2026-10-09&to=2026-10-08"))
        .status,
      400,
    );

    const hiddenDeleted = await request(
      token,
      `/api/admin/tenants?search=${encodeURIComponent(`${marker}_DELETED`)}`,
    );
    assert.equal(hiddenDeleted.body.meta.total, 0);
    const visibleDeleted = await request(
      token,
      `/api/admin/tenants?status=DELETED&search=${encodeURIComponent(marker)}`,
    );
    assert.equal(
      visibleDeleted.body.data.some(
        (row: { id: string }) => row.id === deleted.id,
      ),
      true,
    );
    assert.equal(
      (await request(token, "/api/admin/tenants/missing-id")).status,
      404,
    );

    const detail = await request(token, `/api/admin/tenants/${tenantA.id}`);
    assert.equal(detail.status, 200);
    const stale = await request(
      token,
      `/api/admin/tenants/${tenantA.id}`,
      "PATCH",
      {
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
        notes: "must not persist",
        notify: false,
      },
      `${marker}-stale`,
    );
    assert.equal(stale.status, 409);
    assert.notEqual(
      (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantA.id } }))
        .notes,
      "must not persist",
    );
    const updated = await request(
      token,
      `/api/admin/tenants/${tenantA.id}`,
      "PATCH",
      {
        expectedUpdatedAt: detail.body.data.updatedAt,
        notes: `${marker} updated`,
        maxUsers: 42,
        notify: false,
      },
      `${marker}-update`,
    );
    assert.equal(updated.status, 200);
    const db = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantA.id },
    });
    assert.equal(db.notes, `${marker} updated`);
    assert.equal(db.maxUsers, 42);
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: tenantA.id, adminId: admin.id, action: "UPDATE" },
      }),
      1,
    );
    assert.equal(
      (
        await request(
          token,
          `/api/admin/tenants/${tenantB.id}`,
          "PATCH",
          {
            expectedUpdatedAt: tenantB.updatedAt.toISOString(),
            maxUsers: 0,
            notify: false,
          },
          `${marker}-invalid`,
        )
      ).status,
      400,
    );

    console.log(
      JSON.stringify(
        {
          auth: "PASS",
          filteringSortingPagination: "PASS",
          validation: "PASS",
          deletedVisibility: "PASS",
          detail: "PASS",
          optimisticConcurrency: "PASS",
          dbAndAudit: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id, deleted.id] } },
    });
    await prisma.adminUser.delete({ where: { id: admin.id } });
    assert.equal(
      await prisma.tenant.count({
        where: { companyName: { startsWith: marker } },
      }),
      0,
    );
    assert.equal(await prisma.adminUser.count({ where: { name: marker } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
