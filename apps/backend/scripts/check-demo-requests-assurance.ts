import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_DEMO_${Date.now()}_${process.pid}`;
async function http(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
  key?: string,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const superRole = await prisma.adminRole.findUniqueOrThrow({
    where: { key: "SUPER_ADMIN" },
  });
  const readOnlyRole = await prisma.adminRole.findUniqueOrThrow({
    where: { key: "READ_ONLY_AUDITOR" },
  });
  const admin = await prisma.adminUser.create({
    data: {
      email: `${marker.toLowerCase()}-admin@test.local`,
      name: marker,
      password: "unused",
      mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: superRole.id } },
    },
  });
  const auditor = await prisma.adminUser.create({
    data: {
      email: `${marker.toLowerCase()}-auditor@test.local`,
      name: `${marker}_AUDITOR`,
      password: "unused",
      mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: readOnlyRole.id } },
    },
  });
  const demoIds: string[] = [];
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    assert.ok(secret);
    const session = await createAdminSession({
      adminId: admin.id,
      email: admin.email,
      tokenVersion: 0,
      rememberMe: false,
      ipAddress: null,
      userAgent: marker,
      jwtSecret: secret,
    });
    const limited = await createAdminSession({
      adminId: auditor.id,
      email: auditor.email,
      tokenVersion: 0,
      rememberMe: false,
      ipAddress: null,
      userAgent: marker,
      jwtSecret: secret,
    });
    const email = `${marker.toLowerCase()}@example.invalid`;
    const payload = {
      fullName: "TEST E2E Demo",
      companyName: `${marker} Şirket`,
      email,
      phone: "+905551112233",
      plan: "STARTER",
    };

    assert.equal(
      (
        await http("/api/public/demo-requests", "POST", {
          ...payload,
          email: "bad",
        })
      ).status,
      400,
    );
    const concurrent = await Promise.all([
      http("/api/public/demo-requests", "POST", payload),
      http("/api/public/demo-requests", "POST", payload),
    ]);
    assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
    const rows = await prisma.demoRequest.findMany({ where: { email } });
    assert.equal(rows.length, 1);
    const requestId = rows[0]!.id;
    demoIds.push(requestId);
    assert.equal(
      await prisma.demoRequestHistory.count({
        where: { demoRequestId: requestId, action: "CREATED" },
      }),
      1,
    );

    assert.equal((await http("/api/admin/demo-requests")).status, 401);
    assert.equal(
      (
        await http(
          "/api/admin/demo-requests",
          "GET",
          undefined,
          limited.accessToken,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await http(
          "/api/admin/demo-requests?status=BAD",
          "GET",
          undefined,
          session.accessToken,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await http(
          `/api/admin/demo-requests/${requestId}/preview`,
          "GET",
          undefined,
          limited.accessToken,
        )
      ).status,
      403,
    );
    const list = await http(
      `/api/admin/demo-requests?status=PENDING&search=${encodeURIComponent(marker)}&page=1&limit=1`,
      "GET",
      undefined,
      session.accessToken,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].id, requestId);
    const shortNote = await http(
      `/api/admin/demo-requests/${requestId}/notes`,
      "POST",
      { note: "x" },
      session.accessToken,
      `${marker}-short-note`,
    );
    assert.equal(shortNote.status, 400, JSON.stringify(shortNote.body));
    assert.equal(
      (
        await http(
          `/api/admin/demo-requests/${requestId}/assign`,
          "POST",
          { ownerId: "missing" },
          session.accessToken,
          `${marker}-bad-owner`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await http(
          `/api/admin/demo-requests/${requestId}/assign`,
          "POST",
          { ownerId: admin.id },
          session.accessToken,
          `${marker}-assign`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await http(
          `/api/admin/demo-requests/${requestId}/notes`,
          "POST",
          { note: `${marker} satış notu` },
          session.accessToken,
          `${marker}-note`,
        )
      ).status,
      200,
    );
    const preview = await http(
      `/api/admin/demo-requests/${requestId}/preview`,
      "GET",
      undefined,
      session.accessToken,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.trialDays, 15);

    const approvals = await Promise.all([
      http(
        `/api/admin/demo-requests/${requestId}/approve`,
        "POST",
        undefined,
        session.accessToken,
        `${marker}-approve-1`,
      ),
      http(
        `/api/admin/demo-requests/${requestId}/approve`,
        "POST",
        undefined,
        session.accessToken,
        `${marker}-approve-2`,
      ),
    ]);
    assert.equal(approvals.filter((item) => item.status === 200).length, 1);
    assert.equal(approvals.filter((item) => item.status === 400).length, 1);
    const finalRequest = await prisma.demoRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    assert.equal(finalRequest.status, "PROVISIONED");
    assert.ok(finalRequest.tenantId);
    assert.ok(finalRequest.setPasswordToken);
    tenantIds.push(finalRequest.tenantId!);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: finalRequest.tenantId! },
    });
    assert.equal(tenant.status, "TRIAL");
    assert.equal(tenant.plan, "STARTER");
    assert.equal(await prisma.tenant.count({ where: { email } }), 1);
    const owner = await prisma.tenantUser.findFirstOrThrow({
      where: { tenantId: tenant.id, isOwner: true },
      include: { user: true },
    });
    userIds.push(owner.userId);
    assert.equal(owner.user.email, email);
    assert.equal(
      await prisma.unit.count({ where: { tenantId: tenant.id } }),
      2,
    );
    assert.equal(
      await prisma.demoRequestHistory.count({
        where: { demoRequestId: requestId, action: "APPROVED" },
      }),
      1,
    );
    assert.equal(
      await prisma.demoRequestHistory.count({
        where: { demoRequestId: requestId, action: "PROVISIONED" },
      }),
      1,
    );
    assert.equal(
      (
        await http(
          `/api/admin/demo-requests/${requestId}/approve`,
          "POST",
          undefined,
          session.accessToken,
          `${marker}-retry`,
        )
      ).status,
      400,
    );

    console.log(
      JSON.stringify(
        {
          concurrentPublicDuplicate: "PASS",
          authPermission: "PASS",
          listValidation: "PASS",
          assignmentNotePreview: "PASS",
          concurrentApproval: "PASS",
          provisioningAtomicFinalState: "PASS",
          historyAndIdempotency: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.demoRequest.deleteMany({
      where: { OR: [{ id: { in: demoIds } }, { companyName: { startsWith: marker } }] },
    });
    await prisma.tenant.deleteMany({
      where: { OR: [{ id: { in: tenantIds } }, { companyName: { startsWith: marker } }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: userIds } }, { email: { startsWith: marker.toLowerCase() } }] },
    });
    await prisma.adminUser.deleteMany({
      where: { id: { in: [admin.id, auditor.id] } },
    });
    assert.equal(
      await prisma.demoRequest.count({
        where: { companyName: { startsWith: marker } },
      }),
      0,
    );
    assert.equal(
      await prisma.tenant.count({
        where: { companyName: { startsWith: marker } },
      }),
      0,
    );
    assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
    assert.equal(
      await prisma.adminUser.count({
        where: { id: { in: [admin.id, auditor.id] } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
