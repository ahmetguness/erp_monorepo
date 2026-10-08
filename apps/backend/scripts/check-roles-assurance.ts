import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_ROLES_${Date.now()}`;
type Session = { cookie: string };

async function api(
  session: Session | null,
  method: string,
  path: string,
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
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A`,
      email: `${marker}-a@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: ["CONTACTS"],
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: ["CONTACTS"],
    },
  });
  try {
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: member.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      ],
    });
    const systemRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_SYSTEM`,
        isSystem: true,
        permissions: { create: { module: "contacts", action: "READ" } },
      },
    });
    const systemPermission = await prisma.rolePermission.findFirstOrThrow({
      where: { roleId: systemRole.id },
    });
    const foreignRole = await prisma.role.create({
      data: { tenantId: tenantB.id, name: `${marker}_FOREIGN` },
    });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);

    assert.equal((await api(null, "GET", "/api/roles")).status, 401);
    const pagination = await api(
      a,
      "GET",
      "/api/roles?page=not-a-number&limit=invalid",
    );
    assert.equal(pagination.status, 200);
    assert.equal(pagination.body.meta.page, 1);
    assert.equal(pagination.body.meta.pageSize, 20);
    assert.equal(
      (await api(a, "POST", "/api/roles", { name: "   " })).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/roles", {
          name: `${marker}_BAD`,
          extra: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/roles", {
          name: `${marker}_BAD_ACTION`,
          permissions: [{ module: "contacts", action: "ROOT" }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/roles", {
          name: `${marker}_DUP_PERMISSION`,
          permissions: [
            { module: "contacts", action: "READ" },
            { module: "contacts", action: "READ" },
          ],
        })
      ).status,
      400,
    );

    const created = await api(a, "POST", "/api/roles", {
      name: `  ${marker}_CUSTOM  `,
      description: "  Aciklama  ",
      permissions: [{ module: "contacts", action: "READ" }],
    });
    assert.equal(created.status, 201);
    const roleId = created.body.data.id as string;
    const dbRole = await prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { permissions: true },
    });
    assert.equal(dbRole.tenantId, tenantA.id);
    assert.equal(dbRole.name, `${marker}_CUSTOM`);
    assert.equal(dbRole.description, "Aciklama");
    assert.equal(dbRole.permissions.length, 1);

    const concurrentName = `${marker}_CONCURRENT`;
    const concurrentRoles = await Promise.all([
      api(a, "POST", "/api/roles", { name: concurrentName }),
      api(a, "POST", "/api/roles", { name: concurrentName }),
    ]);
    assert.deepEqual(
      concurrentRoles.map((item) => item.status).sort(),
      [201, 409],
    );
    assert.equal(
      await prisma.role.count({
        where: { tenantId: tenantA.id, name: concurrentName },
      }),
      1,
    );

    const concurrentPermission = await Promise.all([
      api(a, "POST", `/api/roles/${roleId}/permissions`, {
        module: "contacts",
        action: "UPDATE",
      }),
      api(a, "POST", `/api/roles/${roleId}/permissions`, {
        module: "contacts",
        action: "UPDATE",
      }),
    ]);
    assert.deepEqual(
      concurrentPermission.map((item) => item.status).sort(),
      [201, 409],
    );
    assert.equal(
      await prisma.rolePermission.count({
        where: { roleId, module: "contacts", action: "UPDATE" },
      }),
      1,
    );

    const updated = await api(a, "PATCH", `/api/roles/${roleId}`, {
      name: `  ${marker}_UPDATED  `,
      description: null,
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (await prisma.role.findUniqueOrThrow({ where: { id: roleId } })).name,
      `${marker}_UPDATED`,
    );
    assert.equal(
      (await prisma.role.findUniqueOrThrow({ where: { id: roleId } }))
        .description,
      null,
    );
    assert.equal((await api(b, "GET", `/api/roles/${roleId}`)).status, 404);
    assert.equal(
      (
        await api(b, "PATCH", `/api/roles/${roleId}`, {
          name: `${marker}_HIJACK`,
        })
      ).status,
      404,
    );
    assert.equal((await api(b, "DELETE", `/api/roles/${roleId}`)).status, 404);

    assert.equal(
      (
        await api(a, "PATCH", `/api/roles/${systemRole.id}`, {
          name: `${marker}_SYSTEM_EDIT`,
        })
      ).status,
      400,
    );
    assert.equal(
      (await api(a, "DELETE", `/api/roles/${systemRole.id}`)).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", `/api/roles/${systemRole.id}/permissions`, {
          module: "roles",
          action: "DELETE",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          a,
          "DELETE",
          `/api/roles/${systemRole.id}/permissions/${systemPermission.id}`,
        )
      ).status,
      400,
    );

    assert.equal(
      (
        await api(a, "PATCH", `/api/users/${member.id}`, {
          roleId: foreignRole.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await prisma.tenantUser.findUniqueOrThrow({
          where: {
            tenantId_userId: { tenantId: tenantA.id, userId: member.id },
          },
        })
      ).roleId,
      null,
    );
    assert.equal(
      (await api(a, "PATCH", `/api/users/${member.id}`, { roleId })).status,
      200,
    );
    assert.equal((await api(a, "DELETE", `/api/roles/${roleId}`)).status, 409);
    const delegated = await login(member.email, tenantA.slug);
    assert.equal(
      (await api(delegated, "GET", "/api/contacts?page=1&limit=1")).status,
      200,
    );
    assert.equal(
      (
        await api(
          delegated,
          "POST",
          "/api/roles/permission-simulator/simulate",
          { userId: member.id, module: "contacts", action: "READ" },
        )
      ).status,
      403,
    );

    const simulation = await api(
      a,
      "POST",
      "/api/roles/permission-simulator/simulate",
      { userId: member.id, module: "contacts", action: "READ" },
    );
    assert.equal(simulation.status, 200);
    assert.equal(simulation.body.data.allowed, true);
    assert.equal(
      (
        await api(a, "POST", "/api/roles/permission-simulator/simulate", {
          userId: "missing",
          module: "contacts",
          action: "READ",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(b, "POST", "/api/roles/permission-simulator/simulate", {
          userId: member.id,
          module: "contacts",
          action: "READ",
        })
      ).status,
      403,
    );

    assert.equal(
      (await api(a, "PATCH", `/api/users/${member.id}`, { roleId: null }))
        .status,
      200,
    );
    assert.equal(
      (
        await prisma.tenantUser.findUniqueOrThrow({
          where: {
            tenantId_userId: { tenantId: tenantA.id, userId: member.id },
          },
        })
      ).roleId,
      null,
    );
    assert.equal((await api(a, "DELETE", `/api/roles/${roleId}`)).status, 200);
    assert.equal(await prisma.role.count({ where: { id: roleId } }), 0);
    assert.equal(await prisma.rolePermission.count({ where: { roleId } }), 0);
    assert.ok(
      (await prisma.auditLog.count({
        where: { tenantId: tenantA.id, module: "roles" },
      })) >= 5,
    );

    console.log(
      JSON.stringify(
        {
          marker,
          crud: "PASS",
          validation: "PASS",
          concurrentRole: concurrentRoles.map((x) => x.status),
          concurrentPermission: concurrentPermission.map((x) => x.status),
          systemRoleProtection: "PASS",
          assignmentAndRemoval: "PASS",
          permissionEffect: "PASS",
          tenantIsolation: "PASS",
          audit: "PASS",
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
