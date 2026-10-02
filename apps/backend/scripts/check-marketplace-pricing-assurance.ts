import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient(),
  base = process.env.API_URL ?? "http://localhost:3001",
  origin = "http://localhost:3000",
  marker = `TEST_E2E_MARKETPLACE_PRICING_${Date.now()}`;
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
  const r = await fetch(`${base}/api/marketplace-pricing${path}`, {
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
async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo"),
    denied = await login("muhasebe@axondemo.com", "axon-demo"),
    foreign = await login("pro@axondemo.com", "axon-pro-demo");
  let productId = "",
    listingId = "";
  try {
    assert.equal((await api(null, "/repricing-analysis")).status, 401);
    assert.equal((await api(denied, "/repricing-analysis")).status, 403);
    assert.equal(
      (
        await api(denied, "/execute-reprice", "POST", {
          listingId: "x",
          targetPrice: 100,
        })
      ).status,
      403,
    );
    for (const body of [
      {},
      { listingId: "" },
      { listingId: "x", targetPrice: 0 },
      { listingId: "x", targetPrice: -1 },
      { listingId: "x", targetPrice: 1.001 },
      { listingId: "x", targetPrice: Number.MAX_VALUE },
    ])
      assert.equal(
        (await api(owner, "/execute-reprice", "POST", body)).status,
        400,
        JSON.stringify(body),
      );
    assert.equal(
      (await api(owner, "/reallocate-stock", "POST", {})).status,
      400,
    );
    assert.equal(
      (await api(owner, "/run-batch-scan", "POST", { autoApply: "yes" }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(owner, "/execute-reprice", "POST", {
          listingId: "missing",
          targetPrice: 100,
        })
      ).status,
      404,
    );
    const integration = await prisma.marketplaceIntegration.findFirstOrThrow({
      where: { tenantId: owner.tenantId, isActive: true },
    });
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const tax = await prisma.taxRate.findFirst({
      where: { tenantId: owner.tenantId, rate: 20 },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        taxRateId: tax?.id,
        code: `${marker}_P`,
        name: `${marker} Ürün`,
        averageCost: 100,
        purchasePrice: 90,
        salesPrice: 120,
      },
    });
    productId = product.id;
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: {
        tenantId: owner.tenantId,
        isActive: true,
        locations: { some: { isActive: true } },
      },
      include: { locations: { where: { isActive: true }, take: 1 } },
    });
    await prisma.stockLevel.create({
      data: {
        tenantId: owner.tenantId,
        productId,
        warehouseId: warehouse.id,
        locationId: warehouse.locations[0].id,
        quantity: 12,
      },
    });
    const listing = await prisma.marketplaceListing.create({
      data: {
        tenantId: owner.tenantId,
        integrationId: integration.id,
        productId,
        externalId: marker,
        externalSku: `${marker}_SKU`,
        price: 120,
        stock: 3,
      },
    });
    listingId = listing.id;
    const analysis = await api(owner, "/repricing-analysis");
    assert.equal(analysis.status, 200);
    const item = analysis.body.data.find((x: any) => x.listingId === listingId);
    assert.ok(item);
    assert.equal(item.averageCost, 100);
    assert.equal(item.currentMarginPct, 0);
    assert.equal(item.recommendedPrice, tax ? 160 : 133.33);
    assert.equal(item.status, "MARGIN_RISK");
    assert.ok(
      [403, 404].includes(
        (
          await api(foreign, "/execute-reprice", "POST", {
            listingId,
            targetPrice: 160,
          })
        ).status,
      ),
    );
    assert.equal(
      (
        await api(owner, "/execute-reprice", "POST", {
          listingId,
          targetPrice: 130,
        })
      ).status,
      400,
    );
    assert.equal(
      Number(
        (
          await prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: listingId },
          })
        ).price,
      ),
      120,
    );
    const repriced = await api(owner, "/execute-reprice", "POST", {
      listingId,
      targetPrice: tax ? 160 : 133.33,
    });
    assert.equal(repriced.status, 200, JSON.stringify(repriced.body));
    assert.equal(
      Number(
        (
          await prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: listingId },
          })
        ).price,
      ),
      tax ? 160 : 133.33,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: owner.tenantId,
          entityId: productId,
          action: "UPDATE",
        },
      }),
      1,
    );
    const allocations = await api(owner, "/stock-allocations");
    assert.equal(allocations.status, 200);
    const allocation = allocations.body.data.find(
      (x: any) => x.productId === productId,
    );
    assert.equal(allocation.totalOnHandStock, 12);
    assert.equal(allocation.channelAllocations.length, 1);
    const reallocated = await api(owner, "/reallocate-stock", "POST", {
      productId,
    });
    assert.equal(reallocated.status, 200);
    assert.equal(
      Number(
        (
          await prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: listingId },
          })
        ).stock,
      ),
      12,
    );
    assert.ok(
      [403, 404].includes(
        (await api(foreign, "/reallocate-stock", "POST", { productId })).status,
      ),
    );
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { price: 120 },
    });
    const dry = await api(owner, "/run-batch-scan", "POST", {
      autoApply: false,
    });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.data.updatedCount, 0);
    assert.equal(
      Number(
        (
          await prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: listingId },
          })
        ).price,
      ),
      120,
    );
    console.log(
      "PASS marketplace pricing assurance: auth, permissions, validation, tenant isolation, VAT-aware margin math, margin guard, repricing, audit, stock allocation/reallocation and batch dry-run",
    );
  } finally {
    if (listingId)
      await prisma.marketplaceListingSnapshot.deleteMany({
        where: { listingId },
      });
    if (listingId)
      await prisma.marketplaceListing.deleteMany({ where: { id: listingId } });
    if (productId) {
      await prisma.auditLog.deleteMany({ where: { entityId: productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    assert.equal(
      await prisma.marketplaceListing.count({ where: { externalId: marker } }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
