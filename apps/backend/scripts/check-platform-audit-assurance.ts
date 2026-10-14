import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_AUDIT_${Date.now()}_${process.pid}`;
let requestCounter = 0;
async function request(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(!["GET", "HEAD", "OPTIONS"].includes(method)
        ? { "idempotency-key": `${marker}-${++requestCounter}` }
        : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text,
    json:
      response.headers.get("content-type")?.includes("json") && text
        ? JSON.parse(text)
        : null,
  };
}

async function main() {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  const roles = await prisma.adminRole.findMany({
    include: { permissions: { include: { adminPermission: true } } },
  });
  const superRole = roles.find((role) => role.key === "SUPER_ADMIN");
  const limitedRole = roles.find(
    (role) =>
      role.key !== "SUPER_ADMIN" &&
      !role.permissions.some(
        (item) => item.adminPermission.key === "audit.read",
      ),
  );
  assert.ok(superRole && limitedRole);
  const superAdmin = await prisma.adminUser.findFirstOrThrow({
    where: { roleAssignments: { some: { adminRoleId: superRole.id } } },
  });
  const limited = await prisma.adminUser.create({
    data: {
      email: `${marker.toLowerCase()}@test.invalid`,
      name: marker,
      password: "unused",
      mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: limitedRole.id } },
    },
  });
  const sessionInput = (admin: typeof superAdmin) => ({
    adminId: admin.id,
    email: admin.email,
    tokenVersion: admin.tokenVersion,
    rememberMe: false,
    ipAddress: null,
    userAgent: marker,
    jwtSecret: secret,
  });
  const [session, limitedSession] = await Promise.all([
    createAdminSession(sessionInput(superAdmin)),
    createAdminSession(sessionInput(limited)),
  ]);
  const originalPolicy = await prisma.platformAuditPolicy.findUniqueOrThrow({
    where: { id: "default" },
  });
  try {
    assert.equal((await request("/api/admin/audit-logs")).status, 401);
    assert.equal(
      (await request("/api/admin/audit-logs", limitedSession.accessToken))
        .status,
      403,
    );
    assert.equal(
      (await request("/api/admin/audit-logs?limit=201", session.accessToken))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/admin/audit-logs?from=2026-02-02&to=2026-02-01",
          session.accessToken,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("/api/admin/audit-logs/missing-id", session.accessToken))
        .status,
      404,
    );
    const eligible = await prisma.platformAdminAuditLog.count({
      where: { module: { contains: "INTEGRATION_TEST", mode: "insensitive" } },
    });
    const list = await request(
      "/api/admin/audit-logs?module=INTEGRATION_TEST&limit=200",
      session.accessToken,
    );
    assert.equal(list.status, 200);
    assert.equal(list.json.meta.total, eligible);
    assert.equal(list.json.data.length, eligible);
    const exported = await request(
      "/api/admin/audit-logs/export?module=INTEGRATION_TEST&format=json",
      session.accessToken,
    );
    assert.equal(exported.status, 200);
    assert.equal(JSON.parse(exported.text).length, eligible);
    const csv = await request(
      "/api/admin/audit-logs/export?module=INTEGRATION_TEST&format=csv",
      session.accessToken,
    );
    assert.equal(csv.status, 200);
    assert.match(csv.contentType, /text\/csv/);
    assert.match(csv.text, /^id,createdAt,actor/);
    const integrity = await request(
      "/api/admin/audit-logs/integrity",
      session.accessToken,
    );
    assert.equal(integrity.status, 200);
    assert.equal(integrity.json.data.valid, true);
    assert.equal(
      integrity.json.data.checked,
      await prisma.platformAdminAuditLog.count(),
    );
    const retention = await request(
      "/api/admin/audit-logs/retention",
      session.accessToken,
      "PUT",
      { retentionDays: originalPolicy.retentionDays === 2555 ? 2190 : 2555 },
    );
    assert.equal(retention.status, 200);
    assert.equal(
      (
        await request(
          "/api/admin/audit-logs/retention",
          session.accessToken,
          "PUT",
          { retentionDays: 364 },
        )
      ).status,
      400,
    );
    assert.equal(
      (await prisma.platformAdminAuditLog.count({
        where: {
          actorId: superAdmin.id,
          module: "AUDIT",
          action: "EXPORT",
          targetType: "platform-audit",
        },
      })) >= 2,
      true,
    );
    console.log(
      `Platform audit HTTP assurance PASS: eligible=${eligible}, exportedJson=${JSON.parse(exported.text).length}, integrityChecked=${integrity.json.data.checked}`,
    );
  } finally {
    await prisma.platformAuditPolicy.update({
      where: { id: "default" },
      data: {
        retentionDays: originalPolicy.retentionDays,
        updatedById: originalPolicy.updatedById,
      },
    });
    await prisma.adminSession.deleteMany({ where: { userAgent: marker } });
    await prisma.adminUser.delete({ where: { id: limited.id } });
    console.log(
      `cleanupAdmins=${await prisma.adminUser.count({ where: { name: marker } })}`,
    );
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
