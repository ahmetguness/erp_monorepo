import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_SECURITY_${Date.now()}_${process.pid}`;
let requestNumber = 0;
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
      ...(!["GET", "HEAD"].includes(method)
        ? { "idempotency-key": `${marker}-${++requestNumber}` }
        : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  const [managerRole, readerRole, deniedRole] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SECURITY" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "READ_ONLY_AUDITOR" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPPORT" } }),
  ]);
  const createAdmin = (suffix: string, roleId: string) =>
    prisma.adminUser.create({
      data: {
        name: `${marker}_${suffix}`,
        email: `${marker.toLowerCase()}-${suffix.toLowerCase()}@test.invalid`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: roleId } },
      },
    });
  const [manager, reader, denied] = await Promise.all([
    createAdmin("MANAGER", managerRole.id),
    createAdmin("READER", readerRole.id),
    createAdmin("DENIED", deniedRole.id),
  ]);
  const finding = await prisma.platformSecurityFinding.create({
    data: {
      key: marker,
      title: `${marker} Türkçe`,
      category: "ASSURANCE",
      severity: "HIGH",
      status: "OPEN",
      verificationStatus: "FAIL",
      remediation: "Deterministic assurance remediation.",
      evidence: ["TEST_E2E evidence"],
    },
  });
  try {
    const session = (admin: typeof manager) =>
      createAdminSession({
        adminId: admin.id,
        email: admin.email,
        tokenVersion: admin.tokenVersion,
        rememberMe: false,
        ipAddress: "127.0.0.1",
        userAgent: marker,
        jwtSecret: secret,
      });
    const [managerSession, readerSession, deniedSession] = await Promise.all([
      session(manager),
      session(reader),
      session(denied),
    ]);
    assert.equal((await request("/api/admin/security/findings")).status, 401);
    assert.equal(
      (await request("/api/admin/security/findings", deniedSession.accessToken))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/api/admin/security/runtime-health",
          readerSession.accessToken,
        )
      ).status,
      200,
    );
    const checklist = await request(
      "/api/admin/security/checklist",
      readerSession.accessToken,
    );
    assert.equal(checklist.status, 200);
    assert.ok(Array.isArray(checklist.body.data.checks));
    const readerList = await request(
      "/api/admin/security/findings",
      readerSession.accessToken,
    );
    assert.equal(readerList.status, 200);
    assert.equal(
      readerList.body.data.findings.some(
        (item: { id: string }) => item.id === finding.id,
      ),
      true,
    );
    assert.equal(
      (
        await request(
          `/api/admin/security/findings/${finding.id}`,
          readerSession.accessToken,
          "PATCH",
          { owner: "Reader" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/admin/security/findings/${finding.id}`,
          managerSession.accessToken,
          "PATCH",
          {},
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/security/findings/${finding.id}`,
          managerSession.accessToken,
          "PATCH",
          { owner: "x" },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/security/findings/${finding.id}`,
          managerSession.accessToken,
          "PATCH",
          { owner: "Security Operations", status: "ACKNOWLEDGED" },
        )
      ).status,
      200,
    );
    let persisted = await prisma.platformSecurityFinding.findUniqueOrThrow({
      where: { id: finding.id },
    });
    assert.equal(persisted.owner, "Security Operations");
    assert.equal(persisted.status, "ACKNOWLEDGED");
    assert.equal(
      (
        await request(
          `/api/admin/security/findings/${finding.id}`,
          managerSession.accessToken,
          "PATCH",
          { status: "RESOLVED" },
        )
      ).status,
      400,
    );
    const tickets = await Promise.all([
      request(
        `/api/admin/security/findings/${finding.id}/ticket`,
        managerSession.accessToken,
        "POST",
        { ticketId: `${marker}-A` },
      ),
      request(
        `/api/admin/security/findings/${finding.id}/ticket`,
        managerSession.accessToken,
        "POST",
        { ticketId: `${marker}-B` },
      ),
    ]);
    assert.deepEqual(tickets.map((item) => item.status).sort(), [201, 400]);
    persisted = await prisma.platformSecurityFinding.findUniqueOrThrow({
      where: { id: finding.id },
    });
    assert.ok(
      [`${marker}-A`, `${marker}-B`].includes(persisted.ticketId ?? ""),
    );
    assert.equal(
      (
        await request(
          `/api/admin/security/findings/${finding.id}/ticket`,
          managerSession.accessToken,
          "POST",
          {},
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/admin/security/findings/missing-id",
          managerSession.accessToken,
          "PATCH",
          { owner: "Security Team" },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/admin/security/scan",
          readerSession.accessToken,
          "POST",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/api/admin/security/scan",
          managerSession.accessToken,
          "POST",
        )
      ).status,
      200,
    );
    console.log(
      JSON.stringify({
        result: "PASS",
        unauthenticated: 401,
        unauthorized: 403,
        concurrentTicketStatuses: tickets.map((item) => item.status).sort(),
        finalLogicalTickets: 1,
        dbOwner: persisted.owner,
      }),
    );
  } finally {
    await prisma.platformSecurityFinding.deleteMany({
      where: { id: finding.id },
    });
    await prisma.adminUser.deleteMany({
      where: { id: { in: [manager.id, reader.id, denied.id] } },
    });
    assert.equal(
      await prisma.platformSecurityFinding.count({ where: { id: finding.id } }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
