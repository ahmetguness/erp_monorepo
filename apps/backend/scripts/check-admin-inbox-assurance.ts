import "dotenv/config";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_ADMIN_INBOX_${Date.now()}_${process.pid}`;

async function request(
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    replayed: response.headers.get("idempotency-replayed"),
  };
}

async function main() {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret, "ADMIN_JWT_SECRET is required");
  const [superRole, auditorRole, supportRole] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "READ_ONLY_AUDITOR" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPPORT" } }),
  ]);
  const admins = await Promise.all([
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-super@test.local`,
        name: `${marker}_SUPER`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: superRole.id } },
      },
    }),
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-auditor@test.local`,
        name: `${marker}_AUDITOR`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: auditorRole.id } },
      },
    }),
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-support@test.local`,
        name: `${marker}_SUPPORT`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: supportRole.id } },
      },
    }),
  ]);
  const [manager, auditor, support] = admins;
  const sessions = await Promise.all(
    admins.map((admin) =>
      createAdminSession({
        adminId: admin.id,
        email: admin.email,
        tokenVersion: 0,
        rememberMe: false,
        ipAddress: null,
        userAgent: marker,
        jwtSecret: secret,
      }),
    ),
  );
  const fixtureKeys = Array.from(
    { length: 105 },
    (_, index) => `${marker}_${String(index).padStart(3, "0")}`,
  );
  await prisma.platformSecurityFinding.createMany({
    data: fixtureKeys.map((key, index) => ({
      key,
      title: `${marker} Türkçe, satır ${index}`,
      category: "ACCESS_CONTROL",
      severity: index === 0 ? "CRITICAL" : index % 2 ? "HIGH" : "MEDIUM",
      verificationStatus: "VERIFIED",
      remediation: `Remediation ${index}`,
      evidence: { marker, index },
    })),
  });
  const approval = await prisma.adminChangeRequest.create({
    data: {
      type: "TENANT_STATUS_UPDATE",
      targetId: marker,
      targetLabel: `${marker}_APPROVAL`,
      requiredPermission: "tenant.status.approve",
      payload: {},
      affectedTenantCount: 11,
      requestedById: manager.id,
      reason: `${marker} approval reason`,
    },
  });
  const incident = await prisma.platformIncident.create({
    data: {
      title: `${marker}_INCIDENT`,
      summary: `${marker} incident summary`,
      severity: "SEV1",
      owner: manager.email,
      runbookUrl: "https://example.invalid/runbook",
      createdById: manager.id,
    },
  });
  const tenant = await prisma.tenant.create({
    data: {
      slug: marker.toLowerCase().replaceAll("_", "-"),
      companyName: `${marker}_TRIAL`,
      email: `${marker.toLowerCase()}-tenant@test.local`,
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  const override = await prisma.tenantFeatureOverride.create({
    data: {
      tenantId: tenant.id,
      featureKey: "SMART_NOTIFICATIONS",
      value: "true",
      isEnabled: true,
      reason: marker,
      expiresAt: new Date(Date.now() + 6 * 86_400_000),
    },
  });

  try {
    assert.equal(
      (await request("/api/admin/inbox?scope=ALL&includeResolved=false"))
        .status,
      401,
    );
    assert.equal(
      (
        await request(
          "/api/admin/inbox?scope=BAD&includeResolved=false",
          "GET",
          undefined,
          sessions[0].accessToken,
        )
      ).status,
      400,
    );
    const list = await request(
      "/api/admin/inbox?scope=ALL&includeResolved=false",
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(list.status, 200);
    const fixtureItems = list.body.data.items.filter(
      (item: { title: string; category: string }) =>
        item.category === "SECURITY" && item.title.startsWith(marker),
    );
    assert.equal(
      fixtureItems.length,
      105,
      "Eligible security findings must not be silently truncated at 100",
    );
    assert.equal(fixtureItems[0].priority, "CRITICAL");
    assert.equal(list.body.data.unreadCount >= 105, true);
    assert.equal(
      list.body.data.items.some(
        (entry: { sourceId: string; category: string }) =>
          entry.sourceId === approval.id && entry.category === "APPROVAL",
      ),
      true,
    );
    assert.equal(
      list.body.data.items.some(
        (entry: { sourceId: string; category: string }) =>
          entry.sourceId === incident.id && entry.category === "INCIDENT",
      ),
      true,
    );
    assert.equal(
      list.body.data.items.some(
        (entry: { sourceId: string; category: string }) =>
          entry.sourceId === override.id && entry.category === "EXPIRATION",
      ),
      true,
    );
    assert.equal(
      list.body.data.items.some(
        (entry: { sourceId: string; category: string }) =>
          entry.sourceId === `trial-${tenant.id}` &&
          entry.category === "EXPIRATION",
      ),
      true,
    );

    const sourceId = fixtureItems[0].sourceId as string;
    assert.equal(
      (
        await request(
          "/api/admin/inbox/actions",
          "POST",
          { category: "SECURITY", sourceId, action: "READ", extra: true },
          sessions[1].accessToken,
          `${marker}-strict`,
        )
      ).status,
      400,
    );
    const readKey = `${marker}-read`;
    const read = await request(
      "/api/admin/inbox/actions",
      "POST",
      { category: "SECURITY", sourceId, action: "READ" },
      sessions[1].accessToken,
      readKey,
    );
    assert.equal(read.status, 200);
    const replay = await request(
      "/api/admin/inbox/actions",
      "POST",
      { category: "SECURITY", sourceId, action: "READ" },
      sessions[1].accessToken,
      readKey,
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.replayed, "true");
    assert.equal(
      await prisma.adminInboxItemState.count({
        where: { adminId: auditor.id, sourceType: "SECURITY", sourceId },
      }),
      1,
    );
    assert.equal(
      await prisma.adminInboxItemState.count({
        where: { adminId: manager.id, sourceType: "SECURITY", sourceId },
      }),
      0,
    );

    assert.equal(
      (
        await request(
          "/api/admin/inbox/actions",
          "POST",
          {
            category: "SECURITY",
            sourceId,
            action: "ASSIGN",
            ownerId: auditor.id,
          },
          sessions[1].accessToken,
          `${marker}-forbidden`,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/api/admin/inbox/actions",
          "POST",
          {
            category: "SECURITY",
            sourceId,
            action: "ASSIGN",
            ownerId: support.id,
          },
          sessions[0].accessToken,
          `${marker}-bad-owner`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/admin/inbox/actions",
          "POST",
          { category: "SECURITY", sourceId: "missing", action: "RESOLVE" },
          sessions[0].accessToken,
          `${marker}-missing`,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "/api/admin/inbox/actions",
          "POST",
          {
            category: "SECURITY",
            sourceId,
            action: "ASSIGN",
            ownerId: manager.id,
          },
          sessions[0].accessToken,
          `${marker}-assign`,
        )
      ).status,
      200,
    );
    const mine = await request(
      "/api/admin/inbox?scope=MINE&includeResolved=false",
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(
      mine.body.data.items.some(
        (item: { sourceId: string }) => item.sourceId === sourceId,
      ),
      true,
    );

    const resolves = await Promise.all(
      [1, 2].map((index) =>
        request(
          "/api/admin/inbox/actions",
          "POST",
          { category: "SECURITY", sourceId, action: "RESOLVE" },
          sessions[0].accessToken,
          `${marker}-resolve-${index}`,
        ),
      ),
    );
    assert.deepEqual(
      resolves.map((result) => result.status),
      [200, 200],
    );
    assert.equal(
      await prisma.adminInboxTaskState.count({
        where: { sourceType: "SECURITY", sourceId },
      }),
      1,
    );
    const active = await request(
      "/api/admin/inbox?scope=ALL&includeResolved=false",
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(
      active.body.data.items.some(
        (item: { sourceId: string }) => item.sourceId === sourceId,
      ),
      false,
    );
    const resolved = await request(
      "/api/admin/inbox?scope=ALL&includeResolved=true",
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(
      Boolean(
        resolved.body.data.items.find(
          (item: { sourceId: string }) => item.sourceId === sourceId,
        )?.resolvedAt,
      ),
      true,
    );
    assert.equal(
      (
        await request(
          "/api/admin/inbox/actions",
          "POST",
          { category: "SECURITY", sourceId, action: "REOPEN" },
          sessions[0].accessToken,
          `${marker}-reopen`,
        )
      ).status,
      200,
    );

    assert.equal(
      (
        await request(
          "/api/admin/inbox/preferences",
          "PUT",
          { approvals: true },
          sessions[0].accessToken,
          `${marker}-invalid-prefs`,
        )
      ).status,
      400,
    );
    const preferences = {
      approvals: true,
      security: false,
      incidents: true,
      expirations: true,
    };
    assert.equal(
      (
        await request(
          "/api/admin/inbox/preferences",
          "PUT",
          preferences,
          sessions[0].accessToken,
          `${marker}-prefs`,
        )
      ).status,
      200,
    );
    const stored = await prisma.adminInboxPreference.findUniqueOrThrow({
      where: { adminId: manager.id },
    });
    assert.equal(stored.security, false);
    const hidden = await request(
      "/api/admin/inbox?scope=ALL&includeResolved=true",
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(
      hidden.body.data.items.some(
        (item: { title: string; category: string }) =>
          item.category === "SECURITY" && item.title.startsWith(marker),
      ),
      false,
    );

    let fkRejected = false;
    try {
      await prisma.adminInboxPreference.create({
        data: {
          adminId: `${marker}-missing`,
          approvals: true,
          security: true,
          incidents: true,
          expirations: true,
        },
      });
    } catch (error) {
      fkRejected =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003";
    }
    assert.equal(fkRejected, true, "DB must reject orphan inbox preferences");

    console.log(
      JSON.stringify(
        {
          allFourSourceCategories: "PASS",
          completeness105: "PASS",
          authenticationAuthorization: "PASS",
          validation: "PASS",
          personalReadIsolation: "PASS",
          assignmentOwnership: "PASS",
          concurrentIdempotentResolve: "PASS",
          preferences: "PASS",
          foreignKeys: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.adminInboxItemState.deleteMany({
      where: {
        sourceId: {
          in: (
            await prisma.platformSecurityFinding.findMany({
              where: { key: { startsWith: marker } },
              select: { id: true },
            })
          ).map((row) => row.id),
        },
      },
    });
    await prisma.adminInboxTaskState.deleteMany({
      where: {
        sourceId: {
          in: (
            await prisma.platformSecurityFinding.findMany({
              where: { key: { startsWith: marker } },
              select: { id: true },
            })
          ).map((row) => row.id),
        },
      },
    });
    await prisma.platformSecurityFinding.deleteMany({
      where: { key: { startsWith: marker } },
    });
    await prisma.adminChangeRequest.deleteMany({ where: { id: approval.id } });
    await prisma.platformIncident.deleteMany({ where: { id: incident.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.adminUser.deleteMany({
      where: { id: { in: admins.map((admin) => admin.id) } },
    });
    assert.equal(
      await prisma.adminInboxItemState.count({
        where: { adminId: { in: admins.map((admin) => admin.id) } },
      }),
      0,
    );
    assert.equal(
      await prisma.adminInboxPreference.count({
        where: { adminId: { in: admins.map((admin) => admin.id) } },
      }),
      0,
    );
    assert.equal(
      await prisma.platformSecurityFinding.count({
        where: { key: { startsWith: marker } },
      }),
      0,
    );
    assert.equal(
      await prisma.adminUser.count({ where: { name: { startsWith: marker } } }),
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
