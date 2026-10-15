import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_TAX_RATES_${Date.now()}`;
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
    assert.equal((await request(null, "/api/master/tax-rates")).status, 401);
    assert.equal(
      (await request(unauthorized, "/api/master/tax-rates")).status,
      403,
    );
    assert.equal(
      (
        await request(unauthorized, "/api/master/tax-rates", "POST", {
          name: "x",
          rate: 1,
        })
      ).status,
      403,
    );
    for (const invalid of [
      {},
      { name: " ", rate: 1 },
      { name: "x", rate: "18" },
      { name: "x", rate: -1 },
      { name: "x", rate: 100.01 },
      { name: "x", rate: 1.234 },
      { name: "x".repeat(101), rate: 1 },
      { name: "x", rate: 1, isWithholding: "yes" },
    ]) {
      assert.equal(
        (await request(a, "/api/master/tax-rates", "POST", invalid)).status,
        400,
      );
    }
    const zero = await request(a, "/api/master/tax-rates", "POST", {
      name: "Sıfır Türkçe",
      rate: 0,
    });
    assert.equal(zero.status, 201);
    assert.equal(zero.body.data.rate, "0");
    const max = await request(a, "/api/master/tax-rates", "POST", {
      name: "Maksimum",
      rate: 100,
    });
    assert.equal(max.status, 201);
    const created = await request(a, "/api/master/tax-rates", "POST", {
      name: "  KDV Test  ",
      rate: 18.5,
      isWithholding: false,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.name, "KDV Test");
    assert.equal(Number(created.body.data.rate), 18.5);
    const dbCreated = await prisma.taxRate.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    assert.equal(dbCreated.tenantId, tenantA.id);
    assert.equal(dbCreated.rate.toFixed(2), "18.50");
    assert.equal(dbCreated.isWithholding, false);

    assert.equal(
      (
        await request(
          a,
          `/api/master/tax-rates/${created.body.data.id}`,
          "PATCH",
          {},
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          a,
          `/api/master/tax-rates/${created.body.data.id}`,
          "PATCH",
          { rate: Number.NaN },
        )
      ).status,
      400,
    );
    const updated = await request(
      a,
      `/api/master/tax-rates/${created.body.data.id}`,
      "PATCH",
      { name: "Stopaj Güncel", rate: 2.25, isWithholding: true },
    );
    assert.equal(updated.status, 200);
    assert.equal(Number(updated.body.data.rate), 2.25);
    assert.equal(updated.body.data.isWithholding, true);

    const foreign = await request(b, "/api/master/tax-rates", "POST", {
      name: "Foreign",
      rate: 7,
    });
    assert.equal(foreign.status, 201);
    assert.equal(
      (
        await request(
          a,
          `/api/master/tax-rates/${foreign.body.data.id}`,
          "PATCH",
          { rate: 8 },
        )
      ).status,
      404,
    );
    assert.equal(
      (await request(a, "/api/master/tax-rates")).body.data.some(
        (row: { id: string }) => row.id === foreign.body.data.id,
      ),
      false,
    );

    const unit = await prisma.unit.create({
      data: { tenantId: tenantA.id, name: "Test unit", code: "TU" },
    });
    await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unit.id,
        taxRateId: created.body.data.id,
        code: marker,
        name: marker,
        salesPrice: 100,
      },
    });
    const disabled = await request(
      a,
      `/api/master/tax-rates/${created.body.data.id}`,
      "PATCH",
      { isActive: false },
    );
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.data.isActive, false);
    assert.equal(
      (await request(a, "/api/master/tax-rates")).body.data.some(
        (row: { id: string }) => row.id === created.body.data.id,
      ),
      false,
    );
    assert.equal(
      (
        await prisma.product.findFirstOrThrow({
          where: { tenantId: tenantA.id, code: marker },
          include: { taxRate: true },
        })
      ).taxRate?.id,
      created.body.data.id,
    );
    assert.equal((100 * Number(dbCreated.rate)) / 100, 18.5);
    assert.equal(
      (
        await request(
          a,
          `/api/master/tax-rates/${created.body.data.id}`,
          "PATCH",
          { isActive: true },
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(a, "/api/master/tax-rates")).body.data.some(
        (row: { id: string }) => row.id === created.body.data.id,
      ),
      true,
    );
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          boundaries: [0, 100],
          decimal: "18.50",
          tenantLeak: 0,
          inactiveReferencePreserved: true,
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
