import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient(),
  base = process.env.API_URL ?? "http://localhost:3001",
  origin = "http://localhost:3000",
  marker = `TEST_E2E_MARKETPLACE_LISTING_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(r.status, 200);
  const b = (await r.json()) as any;
  return {
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId: b.data.tenant.id,
  };
}
async function api(
  s: Session | null,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(`${base}/api/marketplace${path}`, {
    method,
    headers: {
      origin,
      ...(s ? { cookie: s.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
async function makeTenant(slug: string, userId: string) {
  const t = await prisma.tenant.create({
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
    data: { tenantId: t.id, userId, isOwner: true },
  });
  const unit = await prisma.unit.create({
    data: { tenantId: t.id, code: "AD", name: "Adet" },
  });
  return { t, unit };
}
async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@axondemo.com" },
    }),
    a = await makeTenant(`${marker.toLowerCase()}-a`, admin.id),
    b = await makeTenant(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const owner = await login(admin.email, a.t.slug),
      foreign = await login(admin.email, b.t.slug),
      denied = await login("muhasebe@axondemo.com", "axon-demo");
    assert.equal((await api(null, "/listings")).status, 401);
    assert.equal((await api(denied, "/listings", "POST", {})).status, 403);
    const integrationResponse = await api(owner, "/integrations", "POST", {
      channel: "TRENDYOL",
      name: `${marker}_I`,
      apiKey: "test-key",
      apiSecret: "test-secret",
      storeId: "12345",
    });
    assert.equal(integrationResponse.status, 201);
    const integrationId = integrationResponse.body.data.id;
    const product = await prisma.product.create({
      data: {
        tenantId: a.t.id,
        unitId: a.unit.id,
        code: `${marker}_P`,
        name: `${marker} Ürün`,
        barcode: `${Date.now()}`,
        salesPrice: 125,
        averageCost: 80,
      },
    });
    const foreignIntegration = await prisma.marketplaceIntegration.create({
      data: { tenantId: b.t.id, channel: "OTHER", name: `${marker}_FI` },
    });
    const foreignProduct = await prisma.product.create({
      data: {
        tenantId: b.t.id,
        unitId: b.unit.id,
        code: `${marker}_FP`,
        name: "Foreign",
      },
    });
    for (const body of [
      null,
      {},
      { integrationId, productId: product.id, externalId: " ", price: 10 },
      { integrationId, productId: product.id, externalId: "X", price: 0 },
      { integrationId, productId: product.id, externalId: "X", price: -1 },
      { integrationId, productId: product.id, externalId: "X", price: 1.001 },
      {
        integrationId,
        productId: product.id,
        externalId: "X",
        price: 10,
        stock: -1,
      },
      {
        integrationId,
        productId: product.id,
        externalId: "X",
        price: 10,
        stock: 1.0001,
      },
    ])
      assert.equal(
        (await api(owner, "/listings", "POST", body)).status,
        400,
        JSON.stringify(body),
      );
    assert.equal(
      (
        await api(owner, "/listings", "POST", {
          integrationId: foreignIntegration.id,
          productId: product.id,
          externalId: "X",
          price: 10,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api(owner, "/listings", "POST", {
          integrationId,
          productId: foreignProduct.id,
          externalId: "X",
          price: 10,
        })
      ).status,
      404,
    );
    const payload = {
      integrationId,
      productId: product.id,
      externalId: `${marker}_EXT`,
      externalSku: `${marker}_SKU`,
      price: 120.25,
      stock: 7.125,
    };
    const concurrent = await Promise.all([
      api(owner, "/listings", "POST", payload),
      api(owner, "/listings", "POST", payload),
    ]);
    assert.deepEqual(concurrent.map((x) => x.status).sort(), [201, 409]);
    const listing = concurrent.find((x) => x.status === 201)!.body.data;
    const db = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    assert.equal(Number(db.price), 120.25);
    assert.equal(Number(db.stock), 7.125);
    assert.equal(db.tenantId, a.t.id);
    assert.equal(db.productId, product.id);
    const list = await api(owner, "/listings?page=1&limit=1");
    assert.equal(list.status, 200);
    assert.equal(list.body.meta.total, 1);
    assert.equal(list.body.meta.pageSize, 1);
    assert.equal(list.body.data[0].id, listing.id);
    assert.equal(
      (await api(foreign, `/listings?integrationId=${integrationId}`)).body.data
        .length,
      0,
    );
    for (const body of [
      {},
      { price: 0 },
      { price: -1 },
      { price: 1.001 },
      { stock: -1 },
      { stock: 1.0001 },
      { isActive: "yes" },
      { externalSku: 5 },
    ])
      assert.equal(
        (await api(owner, `/listings/${listing.id}`, "PATCH", body)).status,
        400,
        JSON.stringify(body),
      );
    const beforeSync = db.lastSyncAt;
    const updated = await api(owner, `/listings/${listing.id}`, "PATCH", {
      price: 130.5,
      stock: 8.25,
      externalSku: `${marker}_UPDATED`,
    });
    assert.equal(updated.status, 200);
    const updatedDb = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    assert.equal(Number(updatedDb.price), 130.5);
    assert.equal(Number(updatedDb.stock), 8.25);
    assert.equal(
      updatedDb.lastSyncAt?.toISOString() ?? null,
      beforeSync?.toISOString() ?? null,
    );
    assert.equal(
      (await api(foreign, `/listings/${listing.id}`, "PATCH", { price: 999 }))
        .status,
      404,
    );
    assert.equal(
      (await api(foreign, `/listings/${listing.id}`, "DELETE")).status,
      404,
    );
    for (const action of ["publish", "update-marketplace"]) {
      assert.equal(
        (await api(owner, `/listings/${listing.id}/${action}`, "POST", {}))
          .status,
        400,
      );
      assert.equal(
        (
          await api(owner, `/listings/${listing.id}/${action}`, "POST", {
            brandId: 1,
            categoryId: 2,
            cargoCompanyId: 3,
            salePrice: -1,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api(owner, `/listings/${listing.id}/${action}`, "POST", {
            brandId: 1,
            categoryId: 2,
            cargoCompanyId: 3,
            listPrice: 100,
            salePrice: 110,
          })
        ).status,
        400,
      );
    }
    const providerPayload = {
      brandId: 1,
      categoryId: 2,
      cargoCompanyId: 3,
      barcode: payload.externalId,
      stockCode: payload.externalSku,
      quantity: 9,
      listPrice: 150,
      salePrice: 140,
      vatRate: 20,
      dimensionalWeight: 1,
    };
    const published = await api(
      owner,
      `/listings/${listing.id}/publish`,
      "POST",
      providerPayload,
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.ok(published.body.data.batchRequestId);
    let synced = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    assert.equal(Number(synced.price), 140);
    assert.equal(Number(synced.stock), 9);
    assert.ok(synced.lastSyncAt);
    const providerUpdated = await api(
      owner,
      `/listings/${listing.id}/update-marketplace`,
      "POST",
      { ...providerPayload, listPrice: 160, salePrice: 150, quantity: 10 },
    );
    assert.equal(
      providerUpdated.status,
      202,
      JSON.stringify(providerUpdated.body),
    );
    synced = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    assert.equal(Number(synced.price), 150);
    assert.equal(Number(synced.stock), 10);
    const providerDeleted = await api(
      owner,
      `/listings/${listing.id}/delete-marketplace`,
      "POST",
      { barcode: payload.externalId },
    );
    assert.equal(
      providerDeleted.status,
      202,
      JSON.stringify(providerDeleted.body),
    );
    assert.equal(
      (
        await prisma.marketplaceListing.findUniqueOrThrow({
          where: { id: listing.id },
        })
      ).isActive,
      false,
    );
    const removed = await api(owner, `/listings/${listing.id}`, "DELETE");
    assert.equal(removed.status, 200);
    assert.equal(
      await prisma.marketplaceListing.count({ where: { id: listing.id } }),
      0,
    );
    assert.equal(await prisma.product.count({ where: { id: product.id } }), 1);
    console.log(
      "PASS marketplace listings assurance: CRUD, validation, duplicate concurrency, tenant ownership, pagination, local-vs-provider sync semantics and Trendyol mock lifecycle",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.t.id, b.t.id] } } });
    assert.equal(
      await prisma.tenant.count({ where: { companyName: marker } }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
