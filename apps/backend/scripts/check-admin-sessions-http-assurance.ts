import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  createAdminSession,
  rotateAdminSession,
} from "../src/modules/platform/admin-auth/admin-session.service.js";
const base = process.env.API_URL ?? "http://localhost:3001",
  marker = `TEST_E2E_ADMIN_SESSIONS_${Date.now()}_${process.pid}`;
let n = 0;
async function req(path: string, token?: string, method = "GET", key = true) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(!["GET", "HEAD"].includes(method) && key
        ? { "idempotency-key": `${marker}-${++n}` }
        : {}),
    },
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
async function main() {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  const make = (x: string) =>
    prisma.adminUser.create({
      data: {
        name: `${marker}_${x}`,
        email: `${marker.toLowerCase()}-${x.toLowerCase()}@test.invalid`,
        password: "unused",
        mfaEnabled: true,
      },
    });
  const [admin, other] = await Promise.all([make("OWNER"), make("OTHER")]);
  try {
    const s = (a: typeof admin, ua: string, rememberMe = false) =>
      createAdminSession({
        adminId: a.id,
        email: a.email,
        tokenVersion: a.tokenVersion,
        rememberMe,
        ipAddress: "127.0.0.1",
        userAgent: ua,
        jwtSecret: secret,
      });
    const [current, second, third, foreign] = await Promise.all([
      s(admin, "Chrome Current"),
      s(admin, "Firefox Remote", true),
      s(admin, "Mobile Safari"),
      s(other, "Foreign Device"),
    ]);
    const secondId = second.refreshToken.split(".")[0]!,
      foreignId = foreign.refreshToken.split(".")[0]!;
    assert.equal((await req("/api/admin/auth/sessions")).status, 401);
    const list = await req("/api/admin/auth/sessions", current.accessToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 3);
    assert.equal(
      list.body.data.filter((x: { current: boolean }) => x.current).length,
      1,
    );
    assert.equal(
      list.body.data.some((x: { id: string }) => x.id === foreignId),
      false,
    );
    assert.equal(
      (
        await req(
          `/api/admin/auth/sessions/${secondId}`,
          current.accessToken,
          "DELETE",
          false,
        )
      ).status,
      400,
    );
    const cross = await req(
      `/api/admin/auth/sessions/${foreignId}`,
      current.accessToken,
      "DELETE",
    );
    assert.equal(cross.status, 200);
    assert.equal(cross.body.data.success, false);
    assert.equal(
      (
        await prisma.adminSession.findUniqueOrThrow({
          where: { id: foreignId },
        })
      ).revokedAt,
      null,
    );
    const concurrent = await Promise.all([
      req(
        `/api/admin/auth/sessions/${secondId}`,
        current.accessToken,
        "DELETE",
      ),
      req(
        `/api/admin/auth/sessions/${secondId}`,
        current.accessToken,
        "DELETE",
      ),
    ]);
    assert.deepEqual(concurrent.map((x) => x.body.data.success).sort(), [
      false,
      true,
    ]);
    assert.equal(
      await prisma.adminSecurityEvent.count({
        where: { adminUserId: admin.id, type: "ADMIN_SESSION_REVOKED" },
      }),
      1,
    );
    assert.equal(await rotateAdminSession(second.refreshToken, secret), null);
    await prisma.adminSession.updateMany({
      where: { adminUserId: admin.id, revokedAt: null },
      data: { mfaVerifiedAt: new Date(Date.now() - 48 * 60 * 60_000) },
    });
    assert.equal(
      (await req("/api/admin/auth/revoke-all", current.accessToken, "POST"))
        .status,
      403,
    );
    await prisma.adminSession.updateMany({
      where: { adminUserId: admin.id, revokedAt: null },
      data: { mfaVerifiedAt: new Date() },
    });
    const before = (
      await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })
    ).tokenVersion;
    assert.equal(
      (await req("/api/admin/auth/revoke-all", current.accessToken, "POST"))
        .status,
      200,
    );
    const final = await prisma.adminUser.findUniqueOrThrow({
      where: { id: admin.id },
      include: { sessions: true },
    });
    assert.equal(final.tokenVersion, before + 1);
    assert.ok(final.sessions.every((x) => x.revokedAt));
    assert.equal(
      await prisma.adminSecurityEvent.count({
        where: { adminUserId: admin.id, type: "ADMIN_ALL_SESSIONS_REVOKED" },
      }),
      1,
    );
    assert.equal(
      (await req("/api/admin/auth/sessions", current.accessToken)).status,
      401,
    );
    assert.equal(await rotateAdminSession(third.refreshToken, secret), null);
    console.log(
      JSON.stringify({
        result: "PASS",
        listed: 3,
        crossAccountProtected: true,
        concurrentRevoke: concurrent.map((x) => x.body.data.success).sort(),
        revokeEventCount: 1,
        allRevoked: true,
        tokenVersionIncrement: 1,
        staleMfa: 403,
      }),
    );
  } finally {
    await prisma.adminUser.deleteMany({
      where: { id: { in: [admin.id, other.id] } },
    });
    await prisma.$disconnect();
  }
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
