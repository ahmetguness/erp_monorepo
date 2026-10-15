import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_CATEGORIES_${Date.now()}`;
type Session = { cookie: string };

async function request(
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

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const tenants = await Promise.all(
    ["a", "b"].map((suffix) =>
      prisma.tenant.create({
        data: {
          slug: `${marker.toLowerCase()}-${suffix}`,
          companyName: `${marker}_${suffix}`,
          email: `${marker}-${suffix}@example.test`,
          plan: "ENTERPRISE",
          status: "ACTIVE",
        },
      }),
    ),
  );
  const [tenantA, tenantB] = tenants;
  try {
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: member.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      ],
    });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);
    const unauthorized = await login(member.email, tenantA.slug);
    assert.equal((await request(null, "/api/master/categories")).status, 401);
    assert.equal(
      (await request(unauthorized, "/api/master/categories")).status,
      403,
    );
    assert.equal(
      (
        await request(unauthorized, "/api/master/categories", "POST", {
          name: "x",
        })
      ).status,
      403,
    );

    for (const invalid of [
      {},
      { name: " " },
      { name: 1 },
      { name: "x".repeat(101) },
      { name: "x", parentId: 1 },
    ]) {
      assert.equal(
        (await request(a, "/api/master/categories", "POST", invalid)).status,
        400,
      );
    }
    const root = await request(a, "/api/master/categories", "POST", {
      name: "  Kök Türkçe  ",
    });
    assert.equal(root.status, 201);
    assert.equal(root.body.data.name, "Kök Türkçe");
    assert.equal(root.body.data.parentId, null);
    const child = await request(a, "/api/master/categories", "POST", {
      name: "Çocuk",
      parentId: root.body.data.id,
    });
    assert.equal(child.status, 201);
    const grandchild = await request(a, "/api/master/categories", "POST", {
      name: "Torun",
      parentId: child.body.data.id,
    });
    assert.equal(grandchild.status, 201);

    const tree = await request(a, "/api/master/categories");
    assert.equal(tree.status, 200);
    assert.equal(tree.body.data.length, 1);
    assert.equal(tree.body.data[0].children.length, 1);
    assert.equal(tree.body.data[0].children[0].children.length, 1);
    assert.equal(
      tree.body.data[0].children[0].children[0].id,
      grandchild.body.data.id,
    );

    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${root.body.data.id}`,
          "PATCH",
          { parentId: root.body.data.id },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${root.body.data.id}`,
          "PATCH",
          { parentId: grandchild.body.data.id },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${child.body.data.id}`,
          "PATCH",
          {},
        )
      ).status,
      400,
    );
    const detached = await request(
      a,
      `/api/master/categories/${child.body.data.id}`,
      "PATCH",
      { name: "Çocuk Güncel", parentId: null },
    );
    assert.equal(detached.status, 200);
    assert.equal(detached.body.data.parentId, null);
    assert.equal(detached.body.data.name, "Çocuk Güncel");

    const foreign = await request(b, "/api/master/categories", "POST", {
      name: "Foreign",
    });
    assert.equal(foreign.status, 201);
    assert.equal(
      (
        await request(a, "/api/master/categories", "POST", {
          name: "Injected",
          parentId: foreign.body.data.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${child.body.data.id}`,
          "PATCH",
          { parentId: foreign.body.data.id },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${foreign.body.data.id}`,
          "DELETE",
        )
      ).status,
      404,
    );

    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${child.body.data.id}`,
          "DELETE",
        )
      ).status,
      400,
    );
    const unit = await prisma.unit.create({
      data: { tenantId: tenantA.id, name: "Test unit", code: "TU" },
    });
    await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unit.id,
        categoryId: grandchild.body.data.id,
        code: marker,
        name: marker,
        deletedAt: new Date(),
      },
    });
    assert.equal(
      (
        await request(
          a,
          `/api/master/categories/${grandchild.body.data.id}`,
          "DELETE",
        )
      ).status,
      400,
    );
    assert.equal(
      await prisma.category.count({ where: { id: grandchild.body.data.id } }),
      1,
    );

    const disposable = await request(a, "/api/master/categories", "POST", {
      name: "Disposable",
    });
    const concurrentDelete = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(
          a,
          `/api/master/categories/${disposable.body.data.id}`,
          "DELETE",
        ),
      ),
    );
    assert.deepEqual(
      concurrentDelete.map((result) => result.status).sort(),
      [200, 404],
    );
    assert.equal(
      await prisma.category.count({ where: { id: disposable.body.data.id } }),
      0,
    );
    assert.equal(
      (await request(a, "/api/master/categories")).body.data.some(
        (row: { id: string }) => row.id === foreign.body.data.id,
      ),
      false,
    );
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          hierarchyDepth: 3,
          tenantLeak: 0,
          cycleGuard: "PASS",
          concurrentDelete: concurrentDelete.map((result) => result.status),
          softDeletedProductGuard: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: tenants.map((tenant) => tenant.id) } },
    });
    assert.equal(
      await prisma.tenant.count({
        where: { id: { in: tenants.map((tenant) => tenant.id) } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
