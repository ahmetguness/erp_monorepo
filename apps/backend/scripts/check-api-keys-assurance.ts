import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createApiKeyHash } from "../src/utils/api-key-hash";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_API_KEYS_${Date.now()}`;
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

async function external(
  rawKey: string | null,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${base}/api/external${path}`, {
    method,
    headers: {
      origin,
      ...(rawKey ? { "x-api-key": rawKey } : {}),
      ...extraHeaders,
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
    const readRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ_ONLY`,
        permissions: { create: { module: "api_keys", action: "READ" } },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: member.id, roleId: readRole.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      ],
    });
    await prisma.contact.createMany({
      data: [
        {
          tenantId: tenantA.id,
          type: "CUSTOMER",
          name: `${marker}_A_CONTACT`,
          code: `${marker}_A`,
        },
        {
          tenantId: tenantB.id,
          type: "CUSTOMER",
          name: `${marker}_B_CONTACT`,
          code: `${marker}_B`,
        },
      ],
    });
    const a = await login(owner.email, tenantA.slug),
      b = await login(owner.email, tenantB.slug),
      limited = await login(member.email, tenantA.slug);

    assert.equal((await api(null, "GET", "/api/api-keys")).status, 401);
    assert.equal((await api(limited, "GET", "/api/api-keys")).status, 200);
    assert.equal(
      (
        await api(limited, "POST", "/api/api-keys", {
          name: marker,
          scopes: ["contacts:read"],
        })
      ).status,
      403,
    );
    assert.equal(
      (await api(a, "GET", "/api/api-keys?page=x&limit=x")).body.meta.page,
      1,
    );
    assert.equal(
      (await api(a, "GET", "/api/api-keys?isActive=invalid")).status,
      400,
    );
    assert.equal(
      (await api(a, "POST", "/api/api-keys", { name: " " })).status,
      400,
    );
    assert.equal(
      (await api(a, "POST", "/api/api-keys", { name: marker, scopes: [] }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/api-keys", {
          name: marker,
          scopes: ["root:all"],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/api-keys", {
          name: marker,
          scopes: ["contacts:read", "contacts:read"],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/api-keys", {
          name: marker,
          scopes: ["contacts:read"],
          expiresAt: "not-a-date",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/api-keys", {
          name: marker,
          scopes: ["contacts:read"],
          expiresAt: "2020-01-01",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/api-keys", {
          name: marker,
          scopes: ["contacts:read"],
          ipAllowlist: ["bad-ip"],
        })
      ).status,
      400,
    );

    const created = await api(a, "POST", "/api/api-keys", {
      name: `  ${marker}_MAIN  `,
      scopes: ["contacts:read", "contacts:write"],
      ipAllowlist: [" 127.0.0.1 ", "::1"],
    });
    assert.equal(created.status, 201);
    const keyId = created.body.data.id as string,
      rawKey = created.body.data.rawKey as string;
    assert.match(rawKey, /^[a-f0-9]{64}$/);
    const stored = await prisma.apiKey.findUniqueOrThrow({
      where: { id: keyId },
    });
    assert.equal(stored.name, `${marker}_MAIN`);
    assert.equal(stored.tenantId, tenantA.id);
    assert.equal(stored.keyHash, createApiKeyHash(rawKey));
    assert.notEqual(stored.keyHash, rawKey);
    assert.equal(stored.keyPrefix, rawKey.slice(0, 8));
    assert.deepEqual(stored.ipAllowlist, ["127.0.0.1"]);
    const listed = await api(a, "GET", "/api/api-keys");
    assert.equal(listed.status, 200);
    assert.equal(JSON.stringify(listed.body).includes(rawKey), false);
    assert.equal(JSON.stringify(listed.body).includes(stored.keyHash), false);
    assert.equal(
      (await api(b, "GET", `/api/api-keys/${keyId}/activity`)).status,
      404,
    );
    assert.equal(
      (await api(b, "POST", `/api/api-keys/${keyId}/revoke`)).status,
      404,
    );
    assert.equal(
      (await api(b, "DELETE", `/api/api-keys/${keyId}`)).status,
      404,
    );

    assert.equal((await external(null, "GET", "/contacts")).status, 401);
    assert.equal((await external("wrong-key", "GET", "/contacts")).status, 401);
    const contacts = await external(rawKey, "GET", "/contacts?limit=100");
    assert.equal(contacts.status, 200);
    assert.ok(
      contacts.body.data.some(
        (item: { name: string }) => item.name === `${marker}_A_CONTACT`,
      ),
    );
    assert.equal(
      contacts.body.data.some(
        (item: { name: string }) => item.name === `${marker}_B_CONTACT`,
      ),
      false,
    );
    assert.equal((await external(rawKey, "GET", "/products")).status, 403);
    const sandboxCount = await prisma.contact.count({
      where: { tenantId: tenantA.id },
    });
    assert.equal(
      (
        await external(
          rawKey,
          "POST",
          "/contacts",
          { type: "CUSTOMER", name: `${marker}_SANDBOX` },
          { "x-sandbox-mode": "true" },
        )
      ).status,
      200,
    );
    assert.equal(
      await prisma.contact.count({ where: { tenantId: tenantA.id } }),
      sandboxCount,
    );
    const createdContact = await external(rawKey, "POST", "/contacts", {
      type: "CUSTOMER",
      name: `${marker}_EXTERNAL`,
    });
    assert.equal(createdContact.status, 201);
    assert.equal(
      (
        await prisma.contact.findUniqueOrThrow({
          where: { id: createdContact.body.data.id },
        })
      ).tenantId,
      tenantA.id,
    );

    const ipKeyResponse = await api(a, "POST", "/api/api-keys", {
      name: `${marker}_IP_BLOCK`,
      scopes: ["contacts:read"],
      ipAllowlist: ["203.0.113.10"],
    });
    assert.equal(ipKeyResponse.status, 201);
    assert.equal(
      (await external(ipKeyResponse.body.data.rawKey, "GET", "/contacts"))
        .status,
      403,
    );

    const rotations = await Promise.all([
      api(a, "POST", `/api/api-keys/${keyId}/rotate`),
      api(a, "POST", `/api/api-keys/${keyId}/rotate`),
    ]);
    assert.equal(rotations.filter((item) => item.status === 201).length, 1);
    assert.equal(
      rotations.filter((item) => item.status === 400 || item.status === 409)
        .length,
      1,
    );
    assert.equal(
      await prisma.apiKey.count({ where: { rotatedFromId: keyId } }),
      1,
    );
    const successfulRotation = rotations.find((item) => item.status === 201)!;
    const rotatedId = successfulRotation.body.data.id as string,
      rotatedRaw = successfulRotation.body.data.rawKey as string;
    assert.equal((await external(rawKey, "GET", "/contacts")).status, 401);
    assert.equal((await external(rotatedRaw, "GET", "/contacts")).status, 200);
    assert.equal(
      (await api(a, "POST", `/api/api-keys/${rotatedId}/revoke`)).status,
      200,
    );
    assert.equal((await external(rotatedRaw, "GET", "/contacts")).status, 401);
    assert.equal(
      (await api(a, "DELETE", `/api/api-keys/${rotatedId}`)).status,
      200,
    );
    assert.ok(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: rotatedId } }))
        .deletedAt,
    );
    assert.equal(
      (await api(a, "GET", `/api/api-keys/${rotatedId}/activity`)).status,
      404,
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(
      (await prisma.auditLog.count({
        where: { tenantId: tenantA.id, module: "api_keys" },
      })) >= 8,
    );
    const indexRows = await prisma.$queryRaw<
      Array<{ indexdef: string }>
    >`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'api_keys_rotatedFromId_key'`;
    assert.equal(indexRows.length, 1);
    assert.match(indexRows[0]!.indexdef, /UNIQUE/);
    console.log(
      JSON.stringify(
        {
          marker,
          rawKeyStored: false,
          externalTenantIsolation: "PASS",
          scopeEnforcement: "PASS",
          ipAllowlist: "PASS",
          sandboxNoWrite: "PASS",
          concurrentRotation: rotations.map((item) => item.status),
          rotationSuccessorCount: 1,
          oldKeyRejected: true,
          revokedKeyRejected: true,
          audit: "PASS",
          dbUniqueRotation: "PASS",
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
