import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_STOCK_LEVEL_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
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
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${baseUrl}${path}`, {
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

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const warehouseUser = await login("depo@axondemo.com", "axon-demo");
  const unauthorized = await login("muhasebe@axondemo.com", "axon-demo");
  const foreign = await login("starter@axondemo.com", "axon-starter-demo");
  const productIds: string[] = [];
  let warehouseId = "";
  let previousNegativeStockPolicy: string | null | undefined;
  try {
    assert.equal((await api(null, "GET", "/api/stock/levels")).status, 401);
    assert.equal(
      (await api(unauthorized, "GET", "/api/stock/levels")).status,
      403,
    );
    assert.equal(
      (await api(unauthorized, "POST", "/api/stock/movements", {})).status,
      403,
    );
    for (const query of ["page=0", "page=x", "limit=0", "type=INVALID", "dateFrom=bad", "dateFrom=2026-02-02&dateTo=2026-01-01"]) {
      assert.equal((await api(owner, "GET", `/api/stock/movements?${query}`)).status, 400);
    }

    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId: owner.tenantId,
        code: `${marker}_W`,
        name: `${marker}_Depo`,
      },
    });
    warehouseId = warehouse.id;
    const [locationA, locationB] = await Promise.all([
      prisma.location.create({
        data: {
          tenantId: owner.tenantId,
          warehouseId,
          code: `${marker}_A`,
          name: "Raf A",
        },
      }),
      prisma.location.create({
        data: {
          tenantId: owner.tenantId,
          warehouseId,
          code: `${marker}_B`,
          name: "Raf B",
        },
      }),
    ]);
    const [healthy, critical] = await Promise.all([
      prisma.product.create({
        data: {
          tenantId: owner.tenantId,
          unitId: unit.id,
          code: `${marker}_HEALTHY`,
          name: `${marker} Türkçe Sağlıklı`,
          minStockLevel: 10,
        },
      }),
      prisma.product.create({
        data: {
          tenantId: owner.tenantId,
          unitId: unit.id,
          code: `${marker}_CRITICAL`,
          name: `${marker} Kritik`,
          minStockLevel: 10,
        },
      }),
    ]);
    productIds.push(healthy.id, critical.id);
    await prisma.stockLevel.createMany({
      data: [
        {
          tenantId: owner.tenantId,
          productId: healthy.id,
          warehouseId,
          locationId: locationA.id,
          quantity: 6,
        },
        {
          tenantId: owner.tenantId,
          productId: healthy.id,
          warehouseId,
          locationId: locationB.id,
          quantity: 6,
        },
        {
          tenantId: owner.tenantId,
          productId: critical.id,
          warehouseId,
          locationId: locationA.id,
          quantity: 4,
        },
      ],
    });

    const levels = await api(
      owner,
      "GET",
      `/api/stock/levels?warehouseId=${warehouseId}`,
    );
    assert.equal(levels.status, 200);
    assert.equal(
      levels.body.data.filter((row: any) => row.productId === healthy.id)
        .length,
      1,
    );
    assert.equal(
      Number(
        levels.body.data.find((row: any) => row.productId === healthy.id)
          .quantity,
      ),
      12,
    );
    assert.equal(
      Number(
        levels.body.data.find((row: any) => row.productId === critical.id)
          .quantity,
      ),
      4,
    );

    const below = await api(
      owner,
      "GET",
      `/api/stock/levels?warehouseId=${warehouseId}&belowMin=true`,
    );
    assert.deepEqual(
      below.body.data.map((row: any) => row.productId),
      [critical.id],
    );
    const location = await api(
      owner,
      "GET",
      `/api/stock/levels?locationId=${locationA.id}`,
    );
    assert.equal(
      Number(
        location.body.data.find((row: any) => row.productId === healthy.id)
          .quantity,
      ),
      6,
    );

    assert.equal(
      (
        await api(
          foreign,
          "GET",
          `/api/stock/levels?warehouseId=${warehouseId}`,
        )
      ).body.data.length,
      0,
    );
    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: foreign.tenantId },
    });
    const crossTenant = await api(owner, "POST", "/api/stock/movements", {
      idempotencyKey: `${marker}_FOREIGN`,
      productId: healthy.id,
      warehouseId: foreignWarehouse.id,
      type: "IN",
      quantity: 1,
    });
    assert.equal(crossTenant.status, 404);

    for (const payload of [
      {},
      {
        idempotencyKey: `${marker}_ZERO`,
        productId: critical.id,
        warehouseId,
        type: "IN",
        quantity: 0,
      },
      {
        idempotencyKey: `${marker}_NEG`,
        productId: critical.id,
        warehouseId,
        type: "IN",
        quantity: -1,
      },
      {
        idempotencyKey: `${marker}_TYPE`,
        productId: critical.id,
        warehouseId,
        type: "INVALID",
        quantity: 1,
      },
      {
        idempotencyKey: `${marker}_EXTRA`,
        productId: critical.id,
        warehouseId,
        type: "IN",
        quantity: 1,
        extra: true,
      },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/stock/movements", payload)).status,
        400,
      );

    const movementPayload = {
      idempotencyKey: `${marker}_IN`,
      productId: critical.id,
      warehouseId,
      type: "IN",
      quantity: 3,
      unitCost: 25.5,
      notes: marker,
    };
    assert.equal(
      (
        await api(
          warehouseUser,
          "POST",
          "/api/stock/movements",
          movementPayload,
        )
      ).status,
      201,
    );
    const replay = await api(
      warehouseUser,
      "POST",
      "/api/stock/movements",
      movementPayload,
    );
    assert.equal(replay.status, 201);
    assert.equal(
      await prisma.stockMovement.count({
        where: { tenantId: owner.tenantId, idempotencyKey: `${marker}_IN` },
      }),
      1,
    );
    const refreshed = await api(
      owner,
      "GET",
      `/api/stock/levels?warehouseId=${warehouseId}&productId=${critical.id}`,
    );
    assert.equal(Number(refreshed.body.data[0].quantity), 7);
    assert.equal(
      (
        await api(
          owner,
          "GET",
          `/api/stock/movements?warehouseId=${warehouseId}&productId=${critical.id}`,
        )
      ).body.meta.total,
      1,
    );

    assert.equal((await api(owner, "POST", "/api/stock/movements", { idempotencyKey: `${marker}_ADJUST`, productId: healthy.id, warehouseId, type: "ADJUSTMENT", quantity: 10 })).status, 201);
    assert.equal(Number((await api(owner, "GET", `/api/stock/levels?warehouseId=${warehouseId}&productId=${healthy.id}`)).body.data[0].quantity), 10);
    assert.ok((await prisma.stockLevel.findMany({ where: { productId: healthy.id, warehouseId } })).every(row => Number(row.quantity) >= 0));
    assert.equal((await api(owner, "POST", "/api/stock/movements", { idempotencyKey: `${marker}_ZERO_ADJUST`, productId: healthy.id, warehouseId, type: "ADJUSTMENT", quantity: 0 })).status, 201);
    assert.equal(Number((await api(owner, "GET", `/api/stock/levels?warehouseId=${warehouseId}&productId=${healthy.id}`)).body.data[0].quantity), 0);
    assert.equal((await api(owner, "POST", "/api/stock/movements", { idempotencyKey: `${marker}_REOPEN`, productId: healthy.id, warehouseId, type: "IN", quantity: 10 })).status, 201);
    const policy = await prisma.moduleSetting.findUnique({ where: { tenantId_module_key: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy" } } });
    previousNegativeStockPolicy = policy?.value;
    await prisma.moduleSetting.upsert({ where: { tenantId_module_key: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy" } }, create: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy", value: "BLOCK" }, update: { value: "BLOCK" } });
    const concurrentOut = await Promise.all([
      api(owner, "POST", "/api/stock/movements", { idempotencyKey: `${marker}_OUT_A`, productId: healthy.id, warehouseId, type: "OUT", quantity: 7 }),
      api(owner, "POST", "/api/stock/movements", { idempotencyKey: `${marker}_OUT_B`, productId: healthy.id, warehouseId, type: "OUT", quantity: 7 }),
    ]);
    assert.deepEqual(concurrentOut.map(result => result.status).sort(), [201, 400]);
    assert.equal(Number((await api(owner, "GET", `/api/stock/levels?warehouseId=${warehouseId}&productId=${healthy.id}`)).body.data[0].quantity), 3);
    assert.ok((await prisma.stockLevel.findMany({ where: { productId: healthy.id, warehouseId } })).every(row => Number(row.quantity) >= 0));
    const sameKey = `${marker}_CONCURRENT_IDEMPOTENT`;
    const replays = await Promise.all([
      api(owner, "POST", "/api/stock/movements", { idempotencyKey: sameKey, productId: healthy.id, warehouseId, type: "IN", quantity: 2 }),
      api(owner, "POST", "/api/stock/movements", { idempotencyKey: sameKey, productId: healthy.id, warehouseId, type: "IN", quantity: 2 }),
    ]);
    assert.deepEqual(replays.map(result => result.status), [201, 201]);
    assert.equal(await prisma.stockMovement.count({ where: { tenantId: owner.tenantId, idempotencyKey: sameKey } }), 1);
    assert.equal(Number((await api(owner, "GET", `/api/stock/levels?warehouseId=${warehouseId}&productId=${healthy.id}`)).body.data[0].quantity), 5);
    if (previousNegativeStockPolicy === undefined) await prisma.moduleSetting.delete({ where: { tenantId_module_key: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy" } } });
    else await prisma.moduleSetting.update({ where: { tenantId_module_key: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy" } }, data: { value: previousNegativeStockPolicy ?? "ALLOW" } });
    previousNegativeStockPolicy = null;

    const expired = await prisma.inventoryReservation.create({
      data: {
        tenantId: owner.tenantId,
        productId: healthy.id,
        warehouseId,
        quantity: 2,
        refType: "OTHER",
        refId: marker,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const foreignProduct = await prisma.product.findFirstOrThrow({
      where: { tenantId: foreign.tenantId, deletedAt: null },
    });
    const foreignExpired = await prisma.inventoryReservation.create({
      data: {
        tenantId: foreign.tenantId,
        productId: foreignProduct.id,
        warehouseId: foreignWarehouse.id,
        quantity: 1,
        refType: "OTHER",
        refId: marker,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const cleanup = await api(
      owner,
      "POST",
      "/api/stock/reservations/cleanup-expired",
    );
    assert.equal(cleanup.status, 200);
    assert.equal(
      (
        await prisma.inventoryReservation.findUniqueOrThrow({
          where: { id: expired.id },
        })
      ).releasedAt instanceof Date,
      true,
    );
    assert.equal(
      (
        await prisma.inventoryReservation.findUniqueOrThrow({
          where: { id: foreignExpired.id },
        })
      ).releasedAt,
      null,
    );
    assert.equal(
      (await api(owner, "GET", "/api/stock/alerts?limit=5")).status,
      200,
    );
    assert.equal(
      (await api(owner, "GET", "/api/stock/truth-gate")).status,
      200,
    );
    console.log("PASS stock levels and movements assurance (43 checks)");
  } finally {
    if (previousNegativeStockPolicy !== null) {
      if (previousNegativeStockPolicy === undefined) await prisma.moduleSetting.deleteMany({ where: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy" } });
      else await prisma.moduleSetting.updateMany({ where: { tenantId: owner.tenantId, module: "inventory", key: "negative_stock_policy" }, data: { value: previousNegativeStockPolicy } });
    }
    await prisma.inventoryReservation.deleteMany({ where: { refId: marker } });
    await prisma.stockValuation.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.stockLevel.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    if (warehouseId) {
      await prisma.location.deleteMany({ where: { warehouseId } });
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
