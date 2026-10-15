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

async function scimRequest(token: string | null, path: string) {
  const response = await fetch(`${base}${path}`, {
    headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
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
      plan: "STARTER",
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
      (await request(a, "/api/settings", "PUT", { key: "security.sso.enabled", value: "true" })).status,
      400,
    );
    for (const [key, value] of [
      ["timezone", "Invalid/Timezone"],
      ["date_format", "YYYY/DD/MM"],
      ["default_currency", "INVALID"],
      ["email_notifications", "yes"],
    ]) {
      assert.equal(
        (await request(a, "/api/settings", "PUT", { key, value })).status,
        400,
      );
    }

    const concurrentKey = "TEST_E2E_concurrent_setting";
    const concurrentResults = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        request(a, "/api/settings", "PUT", {
          key: concurrentKey,
          value: `value-${index}`,
        }),
      ),
    );
    assert.equal(concurrentResults.every((result) => result.status === 200), true);
    assert.equal(
      await prisma.tenantSetting.count({ where: { tenantId: tenantA.id, key: concurrentKey } }),
      1,
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

    const tenantARole = await prisma.role.create({ data: { tenantId: tenantA.id, name: `${marker}_ROLE_A` } });
    const tenantBRole = await prisma.role.create({ data: { tenantId: tenantB.id, name: `${marker}_ROLE_B` } });
    const securityPayload = {
      ssoEnabled: true, ssoProvider: "oidc", samlMetadataUrl: "", oidcClientId: "TEST_E2E_OIDC", oidcClientSecret: "TEST_E2E_SECRET",
      scimEnabled: true, scimToken: "", scimRoleSyncEnabled: true, scimDefaultRoleId: tenantARole.id,
      scimRoleMappings: JSON.stringify([{ group: "TEST_E2E_SECURITY", roleId: tenantARole.id }]),
      ipRestrictionEnabled: false, ipWhitelist: "127.0.0.1, 10.0.0.0/8",
      sessionMaxAgeDays: 30, sessionConcurrentLimit: 4, sessionIdleTimeoutMins: 45,
    };
    assert.equal((await request(null, "/api/settings/security/corporate")).status, 401);
    assert.equal((await request(unauthorized, "/api/settings/security/corporate")).status, 403);
    assert.equal((await request(b, "/api/settings/security/corporate")).status, 400);
    assert.equal((await request(a, "/api/settings/security/corporate", "POST", securityPayload)).status, 200);
    const securityRead = await request(a, "/api/settings/security/corporate");
    assert.equal(securityRead.status, 200);
    assert.equal(securityRead.body.data.sessionMaxAgeDays, 30);
    assert.equal(securityRead.body.data.scimDefaultRoleId, tenantARole.id);
    assert.equal(securityRead.body.data.oidcClientSecret, "********");
    assert.equal(securityRead.body.data.scimToken, "");
    assert.match(
      (await prisma.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA.id, key: "security.sso.oidc_client_secret" } } })).value,
      /^enc:v1:/,
    );
    assert.equal(await prisma.tenantSetting.count({ where: { tenantId: tenantA.id, key: { startsWith: "security." } } }), 15);
    for (const invalidPayload of [
      { ...securityPayload, sessionMaxAgeDays: 0 },
      { ...securityPayload, sessionConcurrentLimit: 21 },
      { ...securityPayload, sessionIdleTimeoutMins: Number.NaN },
      { ...securityPayload, ipRestrictionEnabled: true, ipWhitelist: "999.1.1.1" },
      { ...securityPayload, ssoEnabled: true, ssoProvider: "oidc", oidcClientId: "", oidcClientSecret: "" },
      { ...securityPayload, scimRoleMappings: "not-json" },
      { ...securityPayload, scimDefaultRoleId: tenantBRole.id, scimRoleMappings: "[]" },
    ]) {
      assert.equal((await request(a, "/api/settings/security/corporate", "POST", invalidPayload)).status, 400);
    }
    assert.equal(
      (await prisma.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA.id, key: "security.session.max_age_days" } } })).value,
      "30",
    );
    const [tokenOne, tokenTwo] = await Promise.all([
      request(a, "/api/settings/security/scim/generate-token", "POST"),
      request(a, "/api/settings/security/scim/generate-token", "POST"),
    ]);
    assert.equal(tokenOne.status, 200);
    assert.equal(tokenTwo.status, 200);
    assert.notEqual(tokenOne.body.data.token, tokenTwo.body.data.token);
    const finalScimToken = (await prisma.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA.id, key: "security.scim.token" } } })).value;
    assert.match(finalScimToken, /^sha256:[a-f0-9]{64}$/);
    assert.equal((await scimRequest(null, "/api/scim/v2/Users")).status, 401);
    const tokenOneRuntime = await scimRequest(tokenOne.body.data.token, "/api/scim/v2/Users");
    const tokenTwoRuntime = await scimRequest(tokenTwo.body.data.token, "/api/scim/v2/Users");
    assert.deepEqual([tokenOneRuntime.status, tokenTwoRuntime.status].sort(), [200, 401]);
    const scimUsers = tokenOneRuntime.status === 200 ? tokenOneRuntime : tokenTwoRuntime;
    assert.equal(scimUsers.status, 200);
    assert.equal(scimUsers.body.totalResults, 2);
    assert.equal(scimUsers.body.Resources.some((resource: { userName: string }) => resource.userName === member.email), true);

    const retention = await request(a, "/api/settings/security/data-retention");
    assert.equal(retention.status, 200);
    assert.equal((await request(a, "/api/settings/security/data-retention", "POST", retention.body.data)).status, 200);
    assert.equal((await request(a, "/api/settings/security/data-retention/preview")).status, 200);
    const retentionDryRun = await request(a, "/api/settings/security/data-retention/dry-run", "POST");
    assert.equal(retentionDryRun.status, 200);
    assert.equal(typeof retentionDryRun.body.data.totalCandidates, "number");

    const siem = await request(a, "/api/settings/security/siem");
    assert.equal(siem.status, 200);
    assert.equal((await request(a, "/api/settings/security/siem", "POST", {
      ...siem.body.data,
      enabled: false,
      endpointUrl: "",
      authHeader: "Authorization: Bearer TEST_E2E_SIEM_SECRET",
    })).status, 200);
    const maskedSiem = await request(a, "/api/settings/security/siem");
    assert.equal(maskedSiem.body.data.authHeader, "********");
    assert.match(
      (await prisma.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA.id, key: "security.siem.auth_header" } } })).value,
      /^enc:v1:/,
    );
    const siemTest = await request(a, "/api/settings/security/siem/test-export", "POST");
    assert.equal(siemTest.status, 200);
    assert.equal(siemTest.body.data.status, "prepared");

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
    assert.equal(
      (
        await request(a, "/api/settings/modules", "PUT", {
          module: "inventory",
          key: "negative_stock_policy",
          value: "UNSAFE",
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
          knownValueValidation: "PASS",
          concurrentUpsertUniqueness: "PASS",
          corporateSecurityValidationAndAtomicity: "PASS",
          scimRoleTenantOwnership: "PASS",
          scimTokenRotation: "PASS",
          scimRuntimeTenantScope: "PASS",
          retentionPreviewAndDryRun: "PASS",
          siemPreparedExport: "PASS",
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
