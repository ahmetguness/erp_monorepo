import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { runWithTenantIsolationBypass } from "../src/lib/tenant-isolation-context.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";
const base = process.env.API_URL ?? "http://localhost:3001",
  marker = `TEST_E2E_PRIVACY_HTTP_${Date.now()}_${process.pid}`;
let n = 0;
async function req(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(!["GET", "HEAD"].includes(method)
        ? { "idempotency-key": `${marker}-${++n}` }
        : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
async function main() {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  const [manageRole, readRole, denyRole] = await Promise.all(
    ["SUPER_ADMIN", "READ_ONLY_AUDITOR", "SUPPORT"].map((key) =>
      prisma.adminRole.findUniqueOrThrow({ where: { key } }),
    ),
  );
  const make = (x: string, roleId: string) =>
    prisma.adminUser.create({
      data: {
        name: `${marker}_${x}`,
        email: `${marker.toLowerCase()}-${x.toLowerCase()}@test.invalid`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: roleId } },
      },
    });
  const [maker, checker, reader, denied] = await Promise.all([
    make("MAKER", manageRole.id),
    make("CHECKER", manageRole.id),
    make("READER", readRole.id),
    make("DENIED", denyRole.id),
  ]);
  const member = await runWithTenantIsolationBypass("admin-console", () =>
    prisma.tenantUser.findFirstOrThrow({
      where: { user: { email: { not: "" } } },
      select: { tenantId: true, user: { select: { email: true } } },
    }),
  );
  let requestId = "";
  try {
    const session = (a: typeof maker) =>
      createAdminSession({
        adminId: a.id,
        email: a.email,
        tokenVersion: a.tokenVersion,
        rememberMe: false,
        ipAddress: "127.0.0.1",
        userAgent: marker,
        jwtSecret: secret,
      });
    const [ms, cs, rs, ds] = await Promise.all([
      session(maker),
      session(checker),
      session(reader),
      session(denied),
    ]);
    assert.equal((await req("/api/admin/privacy/requests")).status, 401);
    assert.equal(
      (await req("/api/admin/privacy/requests", ds.accessToken)).status,
      403,
    );
    assert.equal(
      (await req("/api/admin/privacy/requests", rs.accessToken)).status,
      200,
    );
    assert.equal(
      (await req("/api/admin/privacy/requests", rs.accessToken, "POST", {}))
        .status,
      403,
    );
    const missingKey = await fetch(`${base}/api/admin/privacy/legal-holds`, {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        authorization: `Bearer ${ms.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tenantId: member.tenantId,
        reason: "Missing idempotency assurance",
      }),
    });
    assert.equal(missingKey.status, 400);
    const created = await req(
      "/api/admin/privacy/requests",
      ms.accessToken,
      "POST",
      {
        tenantId: member.tenantId,
        subjectEmail: member.user.email,
        type: "EXPORT",
        scope: ["IDENTITY", "MEMBERSHIP"],
        reason: "Real HTTP privacy assurance request",
        ticketId: marker,
      },
    );
    assert.equal(created.status, 201);
    requestId = created.body.data.id;
    assert.equal(
      (
        await req("/api/admin/privacy/requests", ms.accessToken, "POST", {
          tenantId: "missing",
          subjectEmail: member.user.email,
          type: "EXPORT",
          scope: ["IDENTITY"],
          reason: "Cross tenant injection attempt",
          ticketId: `${marker}-X`,
        })
      ).status,
      400,
    );
    const verifies = await Promise.all([
      req(
        `/api/admin/privacy/requests/${requestId}/verify`,
        ms.accessToken,
        "POST",
        { evidence: "Identity evidence confirmed" },
      ),
      req(
        `/api/admin/privacy/requests/${requestId}/verify`,
        ms.accessToken,
        "POST",
        { evidence: "Identity evidence confirmed" },
      ),
    ]);
    assert.deepEqual(verifies.map((x) => x.status).sort(), [200, 400]);
    assert.equal(
      (
        await req(
          `/api/admin/privacy/requests/${requestId}/decision`,
          ms.accessToken,
          "POST",
          { approve: true, reason: "Maker checker violation test" },
        )
      ).status,
      400,
    );
    const decisions = await Promise.all([
      req(
        `/api/admin/privacy/requests/${requestId}/decision`,
        cs.accessToken,
        "POST",
        { approve: true, reason: "Independent approval granted" },
      ),
      req(
        `/api/admin/privacy/requests/${requestId}/decision`,
        cs.accessToken,
        "POST",
        { approve: false, reason: "Concurrent rejection attempt" },
      ),
    ]);
    assert.deepEqual(decisions.map((x) => x.status).sort(), [200, 400]);
    const row = await runWithTenantIsolationBypass("admin-console", () =>
      prisma.dataSubjectRequest.findUniqueOrThrow({ where: { id: requestId } }),
    );
    assert.equal(row.status, "APPROVED");
    const ex = await Promise.all([
      req(
        `/api/admin/privacy/requests/${requestId}/execute`,
        cs.accessToken,
        "POST",
      ),
      req(
        `/api/admin/privacy/requests/${requestId}/execute`,
        cs.accessToken,
        "POST",
      ),
    ]);
    assert.deepEqual(ex.map((x) => x.status).sort(), [200, 400]);
    const grant = await req(
      `/api/admin/privacy/requests/${requestId}/download-grant`,
      cs.accessToken,
      "POST",
    );
    assert.equal(grant.status, 201);
    const dl = await req(grant.body.data.url, rs.accessToken);
    assert.equal(dl.status, 200);
    assert.equal((await req(grant.body.data.url, rs.accessToken)).status, 400);
    assert.equal(
      await prisma.platformAdminAuditLog.count({
        where: {
          module: "PRIVACY",
          targetId: requestId,
          action: "DOWNLOAD",
          outcome: "SUCCESS",
        },
      }),
      1,
    );
    await prisma.adminSession.updateMany({
      where: { adminUserId: checker.id, revokedAt: null },
      data: { mfaVerifiedAt: new Date(Date.now() - 48 * 60 * 60_000) },
    });
    assert.equal(
      (
        await req("/api/admin/privacy/legal-holds", cs.accessToken, "POST", {
          tenantId: member.tenantId,
          reason: "Stale MFA assurance request",
        })
      ).status,
      403,
    );
    console.log(
      JSON.stringify({
        result: "PASS",
        verify: verifies.map((x) => x.status).sort(),
        decision: decisions.map((x) => x.status).sort(),
        makerChecker: true,
        crossTenantBlocked: true,
        missingIdempotency: 400,
        staleMfa: 403,
      }),
    );
  } finally {
    if (requestId) {
      await prisma.privacyDownloadGrant.deleteMany({ where: { requestId } });
      await runWithTenantIsolationBypass("admin-console", () =>
        prisma.dataSubjectRequest.deleteMany({ where: { id: requestId } }),
      );
    }
    await runWithTenantIsolationBypass("admin-console", () =>
      prisma.privacyLegalHold.deleteMany({
        where: {
          createdById: { in: [maker.id, checker.id, reader.id, denied.id] },
        },
      }),
    );
    await prisma.adminUser.deleteMany({
      where: { id: { in: [maker.id, checker.id, reader.id, denied.id] } },
    });
    await prisma.$disconnect();
  }
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
