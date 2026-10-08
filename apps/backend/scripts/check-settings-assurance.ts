import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_SETTINGS_${Date.now()}`;

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
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A`,
      email: `${marker}-a@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
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
    let a = await login(owner.email, tenantA.slug);
    const unauthorized = await login(member.email, tenantA.slug);

    assert.equal((await request(null, "/api/settings")).status, 401);
    assert.equal((await request(unauthorized, "/api/settings")).status, 403);
    assert.equal(
      (
        await request(unauthorized, "/api/settings", "PUT", {
          key: "language",
          value: "tr",
        })
      ).status,
      403,
    );

    const created = await request(a, "/api/settings", "PUT", {
      key: "invoice_footer",
      value: 'TEST Türkçe, özel "değer"',
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.tenantId, tenantA.id);
    assert.equal(created.body.data.value, 'TEST Türkçe, özel "değer"');
    assert.equal(
      await prisma.tenantSetting.count({
        where: { tenantId: tenantA.id, key: "invoice_footer" },
      }),
      1,
    );

    const updated = await request(a, "/api/settings", "PUT", {
      key: "invoice_footer",
      value: "TEST_UPDATED",
    });
    assert.equal(updated.status, 200);
    assert.equal(
      await prisma.tenantSetting.count({
        where: { tenantId: tenantA.id, key: "invoice_footer" },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.tenantSetting.findUniqueOrThrow({
          where: {
            tenantId_key: { tenantId: tenantA.id, key: "invoice_footer" },
          },
        })
      ).value,
      "TEST_UPDATED",
    );

    const b = await login(owner.email, tenantB.slug);
    await request(b, "/api/settings", "PUT", {
      key: "invoice_footer",
      value: "FOREIGN_TENANT_VALUE",
    });
    a = await login(owner.email, tenantA.slug);
    const listedA = await request(a, "/api/settings");
    assert.equal(listedA.status, 200);
    assert.equal(
      listedA.body.data.some(
        (item: { value: string }) => item.value === "FOREIGN_TENANT_VALUE",
      ),
      false,
    );
    assert.equal(
      listedA.body.data.find(
        (item: { key: string }) => item.key === "invoice_footer",
      ).value,
      "TEST_UPDATED",
    );

    assert.equal(
      (await request(a, "/api/settings", "PUT", { key: "   ", value: "x" }))
        .status,
      400,
    );
    assert.equal(
      (
        await request(a, "/api/settings", "PUT", {
          key: "x",
          value: "y",
          unexpected: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(a, "/api/settings", "PUT", {
          key: "security.sessions",
          value: "[]",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          a,
          "/api/settings/adaptive-defaults.invoice.test",
          "DELETE",
        )
      ).status,
      400,
    );

    const moduleCreated = await request(a, "/api/settings/modules", "PUT", {
      module: "inventory",
      key: "low_stock_alert",
      value: "true",
    });
    assert.equal(moduleCreated.status, 200);
    assert.equal(moduleCreated.body.data.tenantId, tenantA.id);
    await request(a, "/api/settings/modules", "PUT", {
      module: "inventory",
      key: "low_stock_alert",
      value: "false",
    });
    assert.equal(
      await prisma.moduleSetting.count({
        where: {
          tenantId: tenantA.id,
          module: "inventory",
          key: "low_stock_alert",
        },
      }),
      1,
    );
    const modules = await request(a, "/api/settings/modules?module=inventory");
    assert.equal(modules.status, 200);
    assert.equal(modules.body.data.length, 1);
    assert.equal(modules.body.data[0].value, "false");
    assert.equal(
      (await request(b, "/api/settings/modules?module=inventory")).body.data
        .length,
      0,
    );
    assert.equal(
      (
        await request(a, "/api/settings/modules", "PUT", {
          module: "",
          key: "x",
          value: "x",
        })
      ).status,
      400,
    );

    const rule = await request(a, "/api/settings/business-rules", "PUT", {
      key: "sales.quote_validity_days",
      value: 45,
    });
    assert.equal(rule.status, 200);
    assert.equal(rule.body.data.value, 45);
    assert.equal(
      (
        await prisma.tenantSetting.findUniqueOrThrow({
          where: {
            tenantId_key: {
              tenantId: tenantA.id,
              key: "sales.quote_validity_days",
            },
          },
        })
      ).value,
      "45",
    );
    assert.equal(
      (
        await request(a, "/api/settings/business-rules", "PUT", {
          key: "sales.quote_validity_days",
          value: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(a, "/api/settings/business-rules", "PUT", {
          key: "sales.quote_validity_days",
          value: "NaN",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(a, "/api/settings/business-rules", "PUT", {
          key: "unknown.rule",
          value: 1,
        })
      ).status,
      400,
    );
    const rules = await request(a, "/api/settings/business-rules");
    assert.equal(rules.status, 200);
    assert.equal(
      rules.body.data.find(
        (item: { key: string }) => item.key === "sales.quote_validity_days",
      ).value,
      45,
    );

    const deleted = await request(a, "/api/settings/invoice_footer", "DELETE");
    assert.equal(deleted.status, 200);
    assert.equal(
      await prisma.tenantSetting.count({
        where: { tenantId: tenantA.id, key: "invoice_footer" },
      }),
      0,
    );
    assert.equal(
      (
        await prisma.tenantSetting.findUniqueOrThrow({
          where: {
            tenantId_key: { tenantId: tenantB.id, key: "invoice_footer" },
          },
        })
      ).value,
      "FOREIGN_TENANT_VALUE",
    );
    assert.equal(
      (await request(a, "/api/settings/nonexistent-key", "DELETE")).status,
      200,
    );

    console.log(
      JSON.stringify(
        {
          marker,
          tenantSettingCrud: "PASS",
          moduleSettingUpsert: "PASS",
          businessRuleValidation: "PASS",
          tenantIsolation: "PASS",
          authAndPermission: "PASS",
          internalKeyGuard: "PASS",
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
