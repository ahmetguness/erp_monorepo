import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";
import { inviteManagedAdmin } from "../src/modules/platform/admin-users/admin-invitation.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_ADMIN_USERS_${Date.now()}_${process.pid}`;
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
      ...(!["GET", "HEAD", "OPTIONS"].includes(method)
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
  assert.ok(secret, "ADMIN_JWT_SECRET is required");
  const [superRole, supportRole, auditorRole] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPPORT" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: "READ_ONLY_AUDITOR" } }),
  ]);
  const actor = await prisma.adminUser.findFirstOrThrow({
    where: {
      isActive: true,
      roleAssignments: { some: { adminRoleId: superRole.id } },
    },
  });
  const [target, limited] = await Promise.all([
    prisma.adminUser.create({
      data: {
        name: `${marker}_TARGET`,
        email: `${marker.toLowerCase()}-target@test.invalid`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: supportRole.id } },
      },
    }),
    prisma.adminUser.create({
      data: {
        name: `${marker}_LIMITED`,
        email: `${marker.toLowerCase()}-limited@test.invalid`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: auditorRole.id } },
      },
    }),
  ]);
  const createdIds = [target.id, limited.id];
  try {
    const sessionInput = (admin: typeof actor) => ({
      adminId: admin.id,
      email: admin.email,
      tokenVersion: admin.tokenVersion,
      rememberMe: false,
      ipAddress: "127.0.0.1",
      userAgent: marker,
      jwtSecret: secret,
    });
    const [actorSession, limitedSession, targetSession] = await Promise.all([
      createAdminSession(sessionInput(actor)),
      createAdminSession(sessionInput(limited)),
      createAdminSession(sessionInput(target)),
    ]);

    assert.equal((await request("/api/admin/admin-users")).status, 401);
    assert.equal(
      (await request("/api/admin/admin-users", limitedSession.accessToken))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/admin/admin-users/${target.id}`,
          limitedSession.accessToken,
          "PATCH",
          { roles: ["SUPPORT"], isActive: true },
        )
      ).status,
      403,
    );
    const list = await request(
      "/api/admin/admin-users",
      actorSession.accessToken,
    );
    assert.equal(list.status, 200);
    assert.equal(
      list.body.data.some((row: { id: string }) => row.id === target.id),
      true,
    );

    assert.equal(
      (
        await request(
          `/api/admin/admin-users/${target.id}`,
          actorSession.accessToken,
          "PATCH",
          { roles: [], isActive: true },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/admin/admin-users/${target.id}`,
          actorSession.accessToken,
          "PATCH",
          { roles: ["SUPPORT", "SUPPORT"], isActive: true },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/admin/admin-users/not-found",
          actorSession.accessToken,
          "PATCH",
          { roles: ["SUPPORT"], isActive: true },
        )
      ).status,
      404,
    );

    const beforeVersion = target.tokenVersion;
    const changed = await request(
      `/api/admin/admin-users/${target.id}`,
      actorSession.accessToken,
      "PATCH",
      { roles: ["READ_ONLY_AUDITOR"], isActive: false },
    );
    assert.equal(changed.status, 200);
    const changedDb = await prisma.adminUser.findUniqueOrThrow({
      where: { id: target.id },
      include: {
        roleAssignments: { include: { adminRole: true } },
        sessions: true,
      },
    });
    assert.equal(changedDb.isActive, false);
    assert.equal(changedDb.tokenVersion, beforeVersion + 1);
    assert.deepEqual(
      changedDb.roleAssignments.map((item) => item.adminRole.key),
      ["READ_ONLY_AUDITOR"],
    );
    assert.ok(
      changedDb.sessions.every((session) => session.revokedAt !== null),
    );

    let invitationUrl = "";
    const inviteEmail = `${marker.toLowerCase()}-invite@test.invalid`;
    await inviteManagedAdmin(
      actor.id,
      { name: `${marker}_INVITE`, email: inviteEmail, roles: ["SUPPORT"] },
      async (email, url) => {
        assert.equal(email, inviteEmail);
        invitationUrl = url;
        return true;
      },
    );
    const invited = await prisma.adminUser.findUniqueOrThrow({
      where: { email: inviteEmail },
    });
    createdIds.push(invited.id);
    assert.equal(invited.isActive, false);
    assert.ok(invited.inviteTokenHash && invited.invitationExpiresAt);
    assert.equal(
      (
        await request(
          `/api/admin/admin-users/${invited.id}`,
          actorSession.accessToken,
          "PATCH",
          { roles: ["SUPPORT"], isActive: true },
        )
      ).status,
      409,
    );
    const token = new URL(invitationUrl).hash.slice(1);
    assert.equal(token.length, 43);
    assert.equal(
      (
        await request("/api/admin/auth/accept-invitation", undefined, "POST", {
          token: "bad",
          password: "ValidPassword-123",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/admin/auth/accept-invitation", undefined, "POST", {
          token,
          password: "short",
        })
      ).status,
      400,
    );
    const accepts = await Promise.all([
      request("/api/admin/auth/accept-invitation", undefined, "POST", {
        token,
        password: "ValidPassword-123",
      }),
      request("/api/admin/auth/accept-invitation", undefined, "POST", {
        token,
        password: "ValidPassword-123",
      }),
    ]);
    assert.deepEqual(accepts.map((item) => item.status).sort(), [200, 400]);
    const accepted = await prisma.adminUser.findUniqueOrThrow({
      where: { id: invited.id },
    });
    assert.equal(accepted.isActive, true);
    assert.ok(accepted.invitationAcceptedAt);
    assert.equal(accepted.inviteTokenHash, null);
    assert.equal(
      await bcrypt.compare("ValidPassword-123", accepted.password),
      true,
    );
    assert.equal(
      await prisma.adminSecurityEvent.count({
        where: { adminUserId: invited.id, type: "ADMIN_INVITATION_ACCEPTED" },
      }),
      1,
    );

    await createAdminSession(sessionInput(accepted));
    const acceptedVersion = accepted.tokenVersion;
    assert.equal(
      (
        await request(
          `/api/admin/admin-users/${accepted.id}/revoke-sessions`,
          actorSession.accessToken,
          "POST",
        )
      ).status,
      200,
    );
    const revoked = await prisma.adminUser.findUniqueOrThrow({
      where: { id: accepted.id },
      include: { sessions: true },
    });
    assert.equal(revoked.tokenVersion, acceptedVersion + 1);
    assert.equal(revoked.sessions.length, 1);
    assert.ok(revoked.sessions[0]?.revokedAt);

    const failedEmail = `${marker.toLowerCase()}-mail-failure@test.invalid`;
    await assert.rejects(
      inviteManagedAdmin(
        actor.id,
        { name: `${marker}_MAIL_FAIL`, email: failedEmail, roles: ["SUPPORT"] },
        async () => false,
      ),
    );
    const failedInvite = await prisma.adminUser.findUniqueOrThrow({
      where: { email: failedEmail },
    });
    createdIds.push(failedInvite.id);
    assert.equal(failedInvite.isActive, false);
    assert.equal(failedInvite.inviteTokenHash, null);
    assert.ok(
      failedInvite.invitationExpiresAt &&
        failedInvite.invitationExpiresAt <= new Date(),
    );

    console.log(
      JSON.stringify({
        result: "PASS",
        unauthorized: 401,
        readOnlyMutation: 403,
        invitationConcurrentStatuses: accepts.map((item) => item.status).sort(),
        logicalAcceptedAccounts: 1,
        acceptedEvents: 1,
        sessionRevoked: true,
        mailFailureSafe: true,
      }),
    );
  } finally {
    await prisma.adminUser.deleteMany({ where: { id: { in: createdIds } } });
    assert.equal(
      await prisma.adminUser.count({ where: { id: { in: createdIds } } }),
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
