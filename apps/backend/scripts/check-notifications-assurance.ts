import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_NOTIFICATIONS_${Date.now()}`;
type Session = { cookie: string };

async function api(
  session: Session | null,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug: slug }),
  });
  assert.equal(response.status, 200, `${email} login`);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const makeTenant = (suffix: string) =>
    prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-${suffix}`,
        companyName: `${marker}_${suffix}`,
        email: `${marker}-${suffix}@example.test`,
        plan: "ENTERPRISE",
        status: "ACTIVE",
      },
    });
  const tenantA = await makeTenant("a");
  const tenantB = await makeTenant("b");
  try {
    const readRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ`,
        permissions: { create: { module: "notifications", action: "READ" } },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: member.id, roleId: readRole.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      ],
    });
    const [a1, a2, memberNotification, foreign] = await Promise.all([
      prisma.notification.create({
        data: {
          tenantId: tenantA.id,
          userId: owner.id,
          title: `${marker} Türkçe`,
          message: 'Virgül, "tırnak"\nve yeni satır',
          module: "inventory",
          source: `${marker}-a1`,
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: tenantA.id,
          userId: owner.id,
          title: `${marker} second`,
          module: "finance",
          source: `${marker}-a2`,
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: tenantA.id,
          userId: member.id,
          title: `${marker} member`,
          source: `${marker}-member`,
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: tenantB.id,
          userId: owner.id,
          title: `${marker} foreign`,
          source: `${marker}-foreign`,
        },
      }),
    ]);

    assert.equal((await api(null, "/api/notifications")).status, 401);
    let a = await login(owner.email, tenantA.slug);
    const list = await api(a, "/api/notifications?status=UNREAD&limit=1");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.meta.unreadCount, 2);
    assert.equal(
      list.body.data.some(
        (item: { id: string }) =>
          item.id === foreign.id || item.id === memberNotification.id,
      ),
      false,
    );
    assert.equal(
      (await api(a, "/api/notifications?status=INVALID")).status,
      400,
    );
    assert.equal((await api(a, "/api/notifications?limit=1x")).status, 400);
    assert.equal((await api(a, "/api/notifications?limit=101")).status, 400);

    const read = await api(a, `/api/notifications/${a1.id}/read`, "POST");
    assert.equal(read.status, 200);
    assert.equal(read.body.data.status, "READ");
    assert.ok(read.body.data.readAt);
    assert.equal(
      (await api(a, `/api/notifications/${foreign.id}/read`, "POST")).status,
      404,
    );
    assert.equal(
      (
        await api(
          a,
          `/api/notifications/${memberNotification.id}/archive`,
          "POST",
        )
      ).status,
      404,
    );

    const bulk = await api(a, "/api/notifications/bulk-archive", "POST", {
      ids: [a2.id, foreign.id, a2.id],
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.data.count, 1);
    assert.equal(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: foreign.id },
        })
      ).status,
      "UNREAD",
    );
    assert.equal(
      (await api(a, "/api/notifications/bulk-read", "POST", { ids: "bad" }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(a, "/api/notifications/bulk-read", "POST", {
          ids: Array.from({ length: 101 }, (_, i) => `x${i}`),
        })
      ).status,
      400,
    );

    const preferences = {
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "07:00",
        timezone: "Europe/Istanbul",
      },
      digest: { cadence: "DAILY", hour: 9, weekday: 1 },
      channels: { inApp: true, email: false },
      mutedModules: ["finance"],
      escalation: { enabled: false, afterHours: 24, targetRoleId: null },
    };
    assert.equal(
      (
        await api(
          a,
          "/api/notifications/attention/preferences",
          "PUT",
          preferences,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await api(a, "/api/notifications/attention/preferences", "PUT", {
          ...preferences,
          digest: { cadence: "BAD" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "/api/notifications/attention/events", "POST", {
          event: "IMPRESSION",
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await api(a, "/api/notifications/attention/events", "POST", {
          event: "BAD",
        })
      ).status,
      400,
    );
    assert.equal((await api(a, "/api/notifications/attention")).status, 200);
    assert.equal((await api(a, "/api/notifications/smart")).status, 200);

    const readOnly = await login(member.email, tenantA.slug);
    assert.equal((await api(readOnly, "/api/notifications")).status, 200);
    assert.equal(
      (
        await api(
          readOnly,
          `/api/notifications/${memberNotification.id}/read`,
          "POST",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(readOnly, "/api/notifications/push-token", "POST", {
          pushToken: "secret",
        })
      ).status,
      403,
    );

    a = await login(owner.email, tenantA.slug);
    assert.equal(
      (
        await api(a, "/api/notifications/push-token", "POST", {
          pushToken: "   ",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "/api/notifications/push-token", "POST", {
          pushToken: "x".repeat(4097),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "/api/notifications/push-token", "POST", {
          pushToken: `${marker}-token`,
        })
      ).status,
      200,
    );
    const tenantUser = await prisma.tenantUser.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantA.id, userId: owner.id } },
    });
    assert.equal(
      (tenantUser.preferences as Record<string, unknown>).pushToken,
      `${marker}-token`,
    );

    const b = await login(owner.email, tenantB.slug);
    const bList = await api(b, "/api/notifications");
    assert.deepEqual(
      bList.body.data.map((item: { id: string }) => item.id),
      [foreign.id],
    );
    assert.equal(
      (await api(b, `/api/notifications/${a1.id}/read`, "POST")).status,
      404,
    );
    assert.equal(
      (await api(b, "/api/notifications/bulk", "DELETE", { ids: [a1.id] })).body
        .data.count,
      0,
    );

    a = await login(owner.email, tenantA.slug);
    assert.equal(
      (await api(a, "/api/notifications/read-all", "POST")).status,
      200,
    );
    assert.equal(
      await prisma.notification.count({
        where: { tenantId: tenantA.id, userId: owner.id, status: "UNREAD" },
      }),
      0,
    );
    assert.equal(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: memberNotification.id },
        })
      ).status,
      "UNREAD",
    );
    assert.equal(
      (await api(a, `/api/notifications/${a1.id}`, "DELETE")).status,
      200,
    );
    assert.equal(await prisma.notification.count({ where: { id: a1.id } }), 0);
    assert.equal(
      (await api(a, "/api/notifications/all", "DELETE")).status,
      200,
    );
    assert.equal(
      await prisma.notification.count({
        where: { tenantId: tenantA.id, userId: owner.id },
      }),
      0,
    );
    assert.equal(
      await prisma.notification.count({
        where: { id: { in: [memberNotification.id, foreign.id] } },
      }),
      2,
    );

    console.log(
      JSON.stringify(
        {
          marker,
          auth: "PASS",
          readFilterLimit: "PASS",
          lifecycle: "PASS",
          bulkAffectedCount: "PASS",
          attention: "PASS",
          pushTokenPermissionValidation: "PASS",
          tenantAndUserIsolation: "PASS",
          smartIntegration: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
    assert.equal(
      await prisma.tenant.count({
        where: { companyName: { startsWith: marker } },
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
