import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";
import {
  addTenantTicketMessage,
  createTenantTicket,
  getTenantTicket,
} from "../src/modules/platform/support-tickets/support-ticket.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_ADMIN_TICKET_${Date.now()}_${process.pid}`;

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
  assert.ok(secret);
  const [superRole, supportRole, readPermission] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPPORT" } }),
    prisma.adminPermission.findUniqueOrThrow({
      where: { key: "support-ticket.read" },
    }),
  ]);
  const auditorRole = await prisma.adminRole.create({
    data: {
      key: `${marker}_READ_ONLY`,
      name: `${marker} read only`,
      permissions: { create: { adminPermissionId: readPermission.id } },
    },
  });
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
        email: `${marker.toLowerCase()}-support@test.local`,
        name: `${marker}_SUPPORT`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: supportRole.id } },
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
  ]);
  const [manager, support, auditor] = admins;
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
  const tenant = await prisma.tenant.create({
    data: {
      slug: marker.toLowerCase().replaceAll("_", "-"),
      companyName: `${marker}_TENANT`,
      email: `${marker.toLowerCase()}-tenant@test.local`,
      status: "ACTIVE",
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${marker.toLowerCase()}-user@test.local`,
      name: `${marker}_USER`,
      password: "unused",
      tenants: {
        create: { tenantId: tenant.id, isOwner: true, isActive: true },
      },
    },
  });
  const outsider = await prisma.user.create({
    data: {
      email: `${marker.toLowerCase()}-outsider@test.local`,
      name: `${marker}_OUTSIDER`,
      password: "unused",
    },
  });
  await assert.rejects(() =>
    createTenantTicket(tenant.id, outsider.id, {
      title: "Outsider ticket",
      description: "Outsider must not create a tenant ticket.",
    }),
  );
  const ticket = await createTenantTicket(tenant.id, user.id, {
    title: `${marker} Türkçe, kritik hata`,
    description: "Deterministik ve yeterince uzun destek bileti açıklaması.",
    category: "TECHNICAL",
    priority: "HIGH",
  });

  try {
    assert.equal((await request("/api/admin/support-tickets")).status, 401);
    assert.equal(
      (
        await request(
          "/api/admin/support-tickets?status=INVALID",
          "GET",
          undefined,
          sessions[0].accessToken,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/admin/support-tickets?priority=INVALID",
          "GET",
          undefined,
          sessions[0].accessToken,
        )
      ).status,
      400,
    );
    const list = await request(
      `/api/admin/support-tickets?status=OPEN&priority=HIGH&category=TECHNICAL&tenantId=${tenant.id}&assignedAdminId=UNASSIGNED&search=${encodeURIComponent(marker)}`,
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].id, ticket.id);
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "GET",
          undefined,
          sessions[2].accessToken,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/admin/support-tickets/missing",
          "GET",
          undefined,
          sessions[0].accessToken,
        )
      ).status,
      404,
    );

    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "PATCH",
          {},
          sessions[0].accessToken,
          `${marker}-empty`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "PATCH",
          { priority: "HIGH", extra: true },
          sessions[0].accessToken,
          `${marker}-strict`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "PATCH",
          { priority: "LOW" },
          sessions[2].accessToken,
          `${marker}-auditor-update`,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}/messages`,
          "POST",
          { message: "auditor write" },
          sessions[2].accessToken,
          `${marker}-auditor-message`,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "PATCH",
          { assignedAdminId: auditor.id },
          sessions[0].accessToken,
          `${marker}-bad-assignee`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "PATCH",
          { assignedAdminId: "missing" },
          sessions[0].accessToken,
          `${marker}-missing-assignee`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}`,
          "PATCH",
          { assignedAdminId: support.id },
          sessions[0].accessToken,
          `${marker}-assign`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await prisma.platformSupportTicket.findFirstOrThrow({
          where: { id: ticket.id, tenantId: tenant.id },
        })
      ).assignedAdminId,
      support.id,
    );

    const internal = await request(
      `/api/admin/support-tickets/${ticket.id}/messages`,
      "POST",
      { message: `${marker} dahili teknik not`, isInternal: true },
      sessions[1].accessToken,
      `${marker}-internal`,
    );
    assert.equal(internal.status, 201);
    assert.equal(internal.body.data.isInternal, true);
    assert.equal(
      (await getTenantTicket(tenant.id, ticket.id)).messages.some(
        (message) => message.id === internal.body.data.id,
      ),
      false,
    );

    const publicKey = `${marker}-public`;
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}/messages`,
          "POST",
          { message: `${marker} müşteriye yanıt`, isInternal: false },
          sessions[1].accessToken,
          publicKey,
        )
      ).status,
      201,
    );
    const publicCount = await prisma.platformTicketMessage.count({
      where: { ticketId: ticket.id, message: `${marker} müşteriye yanıt` },
    });
    const publicReplay = await request(
      `/api/admin/support-tickets/${ticket.id}/messages`,
      "POST",
      { message: `${marker} müşteriye yanıt`, isInternal: false },
      sessions[1].accessToken,
      publicKey,
    );
    assert.equal(publicReplay.status, 201);
    assert.equal(publicReplay.replayed, "true");
    assert.equal(
      await prisma.platformTicketMessage.count({
        where: { ticketId: ticket.id, message: `${marker} müşteriye yanıt` },
      }),
      publicCount,
    );
    assert.equal(
      (
        await prisma.platformSupportTicket.findFirstOrThrow({
          where: { id: ticket.id, tenantId: tenant.id },
        })
      ).status,
      "WAITING_TENANT",
    );

    await addTenantTicketMessage(tenant.id, ticket.id, user.id, {
      message: `${marker} tenant geri dönüşü`,
    });
    assert.equal(
      (
        await prisma.platformSupportTicket.findFirstOrThrow({
          where: { id: ticket.id, tenantId: tenant.id },
        })
      ).status,
      "IN_PROGRESS",
    );
    const resolved = await request(
      `/api/admin/support-tickets/${ticket.id}`,
      "PATCH",
      { status: "RESOLVED" },
      sessions[0].accessToken,
      `${marker}-resolve`,
    );
    assert.equal(resolved.status, 200);
    assert.ok(resolved.body.data.resolvedAt);
    assert.equal(resolved.body.data.closedAt, null);
    const beforeRejectedReply = await prisma.platformTicketMessage.count({
      where: { ticketId: ticket.id },
    });
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}/messages`,
          "POST",
          { message: "public after resolve", isInternal: false },
          sessions[0].accessToken,
          `${marker}-resolved-public`,
        )
      ).status,
      400,
    );
    assert.equal(
      await prisma.platformTicketMessage.count({
        where: { ticketId: ticket.id },
      }),
      beforeRejectedReply,
    );
    assert.equal(
      (
        await request(
          `/api/admin/support-tickets/${ticket.id}/messages`,
          "POST",
          { message: "internal after resolve", isInternal: true },
          sessions[0].accessToken,
          `${marker}-resolved-internal`,
        )
      ).status,
      201,
    );

    const reopened = await request(
      `/api/admin/support-tickets/${ticket.id}`,
      "PATCH",
      { status: "IN_PROGRESS" },
      sessions[0].accessToken,
      `${marker}-admin-reopen`,
    );
    assert.equal(reopened.body.data.resolvedAt, null);
    assert.equal(reopened.body.data.closedAt, null);
    const closed = await request(
      `/api/admin/support-tickets/${ticket.id}`,
      "PATCH",
      { status: "CLOSED" },
      sessions[0].accessToken,
      `${marker}-close`,
    );
    assert.ok(closed.body.data.closedAt);
    const activeAgain = await request(
      `/api/admin/support-tickets/${ticket.id}`,
      "PATCH",
      { status: "OPEN", assignedAdminId: null },
      sessions[0].accessToken,
      `${marker}-active-again`,
    );
    assert.equal(activeAgain.body.data.resolvedAt, null);
    assert.equal(activeAgain.body.data.closedAt, null);
    assert.equal(activeAgain.body.data.assignedAdminId, null);

    const unassigned = await request(
      `/api/admin/support-tickets?assignedAdminId=UNASSIGNED&search=${encodeURIComponent(marker)}`,
      "GET",
      undefined,
      sessions[0].accessToken,
    );
    assert.equal(
      unassigned.body.data.some(
        (entry: { id: string }) => entry.id === ticket.id,
      ),
      true,
    );
    await assert.rejects(() =>
      prisma.platformTicketMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: "TENANT_USER",
          authorUserId: user.id,
          message: "invalid internal tenant message",
          isInternal: true,
        },
      }),
    );
    console.log(
      JSON.stringify(
        {
          listFilters: "PASS",
          authRbac: "PASS",
          tenantMembership: "PASS",
          assignmentGuard: "PASS",
          internalNoteIsolation: "PASS",
          publicReplyIdempotency: "PASS",
          tenantAdminLifecycle: "PASS",
          timestampConsistency: "PASS",
          databaseConstraints: "PASS",
          databaseFinalState: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, outsider.id] } },
    });
    await prisma.adminUser.deleteMany({
      where: { id: { in: admins.map((admin) => admin.id) } },
    });
    await prisma.adminRole.deleteMany({ where: { id: auditorRole.id } });
    assert.equal(
      await prisma.tenant.count({
        where: { companyName: { startsWith: marker } },
      }),
      0,
    );
    assert.equal(
      await prisma.user.count({ where: { name: { startsWith: marker } } }),
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
