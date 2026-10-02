import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_MARKETPLACE_INTEGRATION_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId: body.data.tenant.id,
  };
}
async function api(
  session: Session | null,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`${base}/api/marketplace${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}
async function tenant(slug: string, userId: string) {
  const created = await prisma.tenant.create({
    data: {
      slug,
      companyName: marker,
      email: `${slug}@test.local`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: ["MARKETPLACE", "INVENTORY"],
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: created.id, userId, isOwner: true },
  });
  return created;
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const a = await tenant(`${marker.toLowerCase()}-a`, admin.id);
  const b = await tenant(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const owner = await login(admin.email, a.slug);
    const foreign = await login(admin.email, b.slug);
    const denied = await login("muhasebe@axondemo.com", "axon-demo");
    assert.equal((await api(null, "/integrations")).status, 401);
    assert.equal(
      (
        await api(denied, "/integrations", "POST", {
          channel: "TRENDYOL",
          name: marker,
        })
      ).status,
      403,
    );
    for (const payload of [
      null,
      {},
      { channel: "BAD", name: marker },
      { channel: "TRENDYOL", name: "   " },
      { channel: "TRENDYOL", name: 1 },
      { channel: "TRENDYOL", name: "x".repeat(201) },
      { channel: "TRENDYOL", name: marker, apiKey: 1 },
    ]) {
      assert.equal(
        (await api(owner, "/integrations", "POST", payload)).status,
        400,
        JSON.stringify(payload),
      );
    }

    const payload = {
      channel: "TRENDYOL",
      name: `${marker}_TR`,
      apiKey: "secret-key",
      apiSecret: "secret-value",
      storeId: "store-1",
    };
    const concurrent = await Promise.all([
      api(owner, "/integrations", "POST", payload),
      api(owner, "/integrations", "POST", payload),
    ]);
    assert.deepEqual(concurrent.map((x) => x.status).sort(), [201, 409]);
    const created = concurrent.find((x) => x.status === 201)!.body.data;
    assert.equal(created.apiKey, null);
    assert.equal(created.apiSecret, null);
    assert.equal(created.hasApiKey, true);
    assert.equal(created.hasApiSecret, true);
    const raw = await prisma.marketplaceIntegration.findUniqueOrThrow({
      where: { id: created.id },
    });
    assert.notEqual(raw.apiKey, "secret-key");
    assert.notEqual(raw.apiSecret, "secret-value");
    assert.ok(raw.apiKey?.length);
    assert.ok(raw.apiSecret?.length);

    const list = await api(owner, "/integrations");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].apiSecret, null);
    assert.equal(
      (await api(foreign, `/integrations/${created.id}`)).status,
      404,
    );
    assert.equal(
      (
        await api(foreign, `/integrations/${created.id}`, "PATCH", {
          name: "HACK",
        })
      ).status,
      404,
    );
    assert.equal(
      (await api(foreign, `/integrations/${created.id}`, "DELETE")).status,
      404,
    );

    for (const payload of [
      {},
      { isActive: "yes" },
      { name: "" },
      { name: "x".repeat(201) },
      { storeId: 5 },
    ])
      assert.equal(
        (await api(owner, `/integrations/${created.id}`, "PATCH", payload))
          .status,
        400,
      );
    const updated = await api(owner, `/integrations/${created.id}`, "PATCH", {
      name: `${marker}_UPDATED`,
      isActive: false,
      storeId: "store-2",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, `${marker}_UPDATED`);
    assert.equal(updated.body.data.isActive, false);
    assert.equal(
      (
        await prisma.marketplaceIntegration.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).storeId,
      "store-2",
    );
    const activated = await api(owner, `/integrations/${created.id}`, "PATCH", {
      isActive: true,
    });
    assert.equal(activated.status, 200);

    assert.equal(
      (
        await api(
          owner,
          `/integrations/${created.id}/trendyol/sync-orders`,
          "POST",
          { hoursBack: -1 },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          owner,
          `/integrations/${created.id}/trendyol/sync-orders`,
          "POST",
          { hoursBack: 1.5 },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          owner,
          `/integrations/${created.id}/trendyol/sync-stock`,
          "POST",
          { force: "yes" },
        )
      ).status,
      400,
    );
    const connection = await api(
      owner,
      `/integrations/${created.id}/trendyol/test`,
      "POST",
      {},
    );
    assert.equal(connection.status, 200);
    assert.equal(typeof connection.body.data.success, "boolean");
    const queued = await api(
      owner,
      `/integrations/${created.id}/trendyol/sync-orders`,
      "POST",
      { hoursBack: 24 },
    );
    assert.equal(queued.status, 202);
    const jobId = queued.body.data.jobId as string;
    assert.equal(
      (await api(owner, `/integrations/wrong-id/trendyol/jobs/${jobId}`))
        .status,
      404,
    );
    const job = await api(
      owner,
      `/integrations/${created.id}/trendyol/jobs/${jobId}`,
    );
    assert.equal(job.status, 200);
    assert.equal(job.body.data.integrationId, created.id);
    assert.equal(
      (await api(foreign, `/integrations/${created.id}/trendyol/jobs/${jobId}`))
        .status,
      404,
    );

    const unit = await prisma.unit.create({
      data: { tenantId: a.id, code: "AD", name: "Adet" },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: a.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: marker,
      },
    });
    const listing = await prisma.marketplaceListing.create({
      data: {
        tenantId: a.id,
        integrationId: created.id,
        productId: product.id,
        externalId: `${marker}_L`,
        price: 10,
      },
    });
    const auditBeforeDelete = await prisma.auditLog.count({
      where: { tenantId: a.id, entityId: created.id },
    });
    assert.ok(auditBeforeDelete >= 3);
    const removed = await api(owner, `/integrations/${created.id}`, "DELETE");
    assert.equal(removed.status, 200);
    assert.equal(
      await prisma.marketplaceIntegration.count({ where: { id: created.id } }),
      0,
    );
    assert.equal(
      await prisma.marketplaceListing.count({ where: { id: listing.id } }),
      0,
    );
    assert.equal(
      await prisma.marketplaceSyncJob.count({ where: { id: jobId } }),
      0,
    );
    assert.equal(await prisma.product.count({ where: { id: product.id } }), 1);
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: a.id, entityId: created.id, action: "DELETE" },
      }),
      1,
    );
    console.log(
      "PASS marketplace integrations assurance: CRUD, validation, encryption/redaction, duplicate race, permissions, tenant/job ownership, sync queue and cascade integrity",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    assert.equal(
      await prisma.tenant.count({ where: { companyName: marker } }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
