import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const suffix = `${Date.now()}`;
const marker = `TEST_E2E_MARKETPLACE_PRICING_BATCH_${suffix}`;
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
async function api(session: Session | null, path: string, body?: unknown) {
  const response = await fetch(`${base}/api/marketplace-pricing${path}`, {
    method: "POST",
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

async function createFixtureTenant(slug: string, ownerUserId: string) {
  const tenant = await prisma.tenant.create({
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
    data: { tenantId: tenant.id, userId: ownerUserId, isOwner: true },
  });
  const unit = await prisma.unit.create({
    data: { tenantId: tenant.id, code: "AD", name: "Adet" },
  });
  const tax = await prisma.taxRate.create({
    data: { tenantId: tenant.id, name: "KDV20", rate: 20 },
  });
  const integration = await prisma.marketplaceIntegration.create({
    data: { tenantId: tenant.id, channel: "TRENDYOL", name: marker },
  });
  return { tenant, unit, tax, integration };
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const denied = await login("muhasebe@axondemo.com", "axon-demo");
  const tenantA = await createFixtureTenant(
    `${marker.toLowerCase()}-a`,
    admin.id,
  );
  const tenantB = await createFixtureTenant(
    `${marker.toLowerCase()}-b`,
    admin.id,
  );
  let triggerName = "";
  try {
    const session = await login("admin@axondemo.com", tenantA.tenant.slug);
    assert.equal(
      (await api(null, "/run-batch-scan", { autoApply: true })).status,
      401,
    );
    assert.equal(
      (await api(denied, "/run-batch-scan", { autoApply: true })).status,
      403,
    );

    const product = await prisma.product.create({
      data: {
        tenantId: tenantA.tenant.id,
        unitId: tenantA.unit.id,
        taxRateId: tenantA.tax.id,
        code: `${marker}_P`,
        name: marker,
        averageCost: 100,
        purchasePrice: 90,
        salesPrice: 120,
      },
    });
    const foreignProduct = await prisma.product.create({
      data: {
        tenantId: tenantB.tenant.id,
        unitId: tenantB.unit.id,
        taxRateId: tenantB.tax.id,
        code: `${marker}_E_P`,
        name: `${marker}_E`,
        averageCost: 100,
      },
    });
    const listingData = [
      ["A", 120, true],
      ["B", 120, true],
      ["C", 160, true],
      ["D", 120, false],
    ] as const;
    const listings = [];
    for (const [name, price, isActive] of listingData)
      listings.push(
        await prisma.marketplaceListing.create({
          data: {
            tenantId: tenantA.tenant.id,
            integrationId: tenantA.integration.id,
            productId: product.id,
            externalId: `${marker}_${name}`,
            externalSku: `${marker}_${name}`,
            price,
            stock: 0,
            isActive,
          },
        }),
      );
    const foreign = await prisma.marketplaceListing.create({
      data: {
        tenantId: tenantB.tenant.id,
        integrationId: tenantB.integration.id,
        productId: foreignProduct.id,
        externalId: `${marker}_E`,
        price: 120,
        stock: 0,
      },
    });

    const first = await api(session, "/run-batch-scan", { autoApply: true });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.totalListingsScanned, 3);
    assert.equal(first.body.data.updatedCount, 2);
    assert.equal(first.body.data.marginRisksResolved, 2);
    const afterFirst = await prisma.marketplaceListing.findMany({
      where: { id: { in: [...listings.map((x) => x.id), foreign.id] } },
    });
    const prices = new Map(
      afterFirst.map((x) => [x.externalId, Number(x.price)]),
    );
    assert.equal(prices.get(`${marker}_A`), 160);
    assert.equal(prices.get(`${marker}_B`), 160);
    assert.equal(prices.get(`${marker}_C`), 160);
    assert.equal(prices.get(`${marker}_D`), 120);
    assert.equal(prices.get(`${marker}_E`), 120);
    for (const name of ["A", "B"]) {
      const gross = prices.get(`${marker}_${name}`)!;
      const net = gross / 1.2;
      assert.ok((net - 100) / net >= 0.2);
      assert.equal(gross, Math.round((100 / 0.75) * 1.2 * 100) / 100);
    }
    const initialAudits = await prisma.auditLog.count({
      where: {
        tenantId: tenantA.tenant.id,
        entityId: product.id,
        action: "UPDATE",
      },
    });
    assert.equal(initialAudits, 2);

    const retry = await api(session, "/run-batch-scan", { autoApply: true });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.updatedCount, 0);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: tenantA.tenant.id,
          entityId: product.id,
          action: "UPDATE",
        },
      }),
      initialAudits,
    );

    await prisma.marketplaceListing.updateMany({
      where: { id: { in: [listings[0].id, listings[1].id] } },
      data: { price: 120 },
    });
    const concurrent = await Promise.all([
      api(session, "/run-batch-scan", { autoApply: true }),
      api(session, "/run-batch-scan", { autoApply: true }),
    ]);
    assert.deepEqual(
      concurrent.map((x) => x.status),
      [200, 200],
    );
    assert.deepEqual(
      concurrent.map((x) => x.body.data.updatedCount).sort(),
      [0, 2],
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: tenantA.tenant.id,
          entityId: product.id,
          action: "UPDATE",
        },
      }),
      initialAudits + 2,
    );

    await prisma.marketplaceListing.updateMany({
      where: { id: { in: [listings[0].id, listings[1].id] } },
      data: { price: 120 },
    });
    triggerName = `pricing_batch_fail_${suffix}`;
    const failExternalId = `${marker}_B`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${triggerName}() RETURNS trigger AS $$ BEGIN IF NEW."externalId" = '${failExternalId}' THEN RAISE EXCEPTION 'controlled batch failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON marketplace_listings FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`,
    );
    const failed = await api(session, "/run-batch-scan", { autoApply: true });
    assert.equal(failed.status, 500);
    const afterFailure = await prisma.marketplaceListing.findMany({
      where: { id: { in: [listings[0].id, listings[1].id] } },
      orderBy: { externalId: "asc" },
    });
    assert.deepEqual(
      afterFailure.map((x) => Number(x.price)),
      [120, 120],
    );
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER ${triggerName} ON marketplace_listings`,
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION ${triggerName}()`);
    triggerName = "";

    const analysisTarget = 160;
    await prisma.product.update({
      where: { id: product.id },
      data: { averageCost: 130 },
    });
    const staleApply = await api(session, "/execute-reprice", {
      listingId: listings[0].id,
      targetPrice: analysisTarget,
    });
    assert.equal(staleApply.status, 400);
    assert.equal(
      Number(
        (
          await prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: listings[0].id },
          })
        ).price,
      ),
      120,
    );
    await prisma.product.update({
      where: { id: product.id },
      data: { averageCost: 100 },
    });

    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenantA.tenant.id, code: "MAIN", name: marker },
    });
    const location = await prisma.location.create({
      data: {
        tenantId: tenantA.tenant.id,
        warehouseId: warehouse.id,
        code: "A",
        name: "A",
      },
    });
    await prisma.stockLevel.create({
      data: {
        tenantId: tenantA.tenant.id,
        productId: product.id,
        warehouseId: warehouse.id,
        locationId: location.id,
        quantity: 11,
      },
    });
    const reallocations = await Promise.all([
      api(session, "/reallocate-stock", { productId: product.id }),
      api(session, "/reallocate-stock", { productId: product.id }),
    ]);
    assert.deepEqual(
      reallocations.map((x) => x.status),
      [200, 200],
    );
    const finalListings = await prisma.marketplaceListing.findMany({
      where: { tenantId: tenantA.tenant.id, productId: product.id },
    });
    assert.equal(
      finalListings.reduce((sum, x) => sum + Number(x.stock), 0),
      11,
    );
    assert.equal(
      Number(
        (
          await prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: foreign.id },
          })
        ).price,
      ),
      120,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: tenantB.tenant.id, entityId: product.id },
      }),
      0,
    );
    console.log(
      "PASS marketplace pricing isolated batch assurance: apply, margin math, rollback, retry, concurrency, cost race, allocation and tenant/audit isolation",
    );
  } finally {
    if (triggerName) {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${triggerName} ON marketplace_listings`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS ${triggerName}()`,
      );
    }
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
    });
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
