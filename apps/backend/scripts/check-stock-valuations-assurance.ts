import assert from "node:assert/strict";
import { CostingMethod, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_STOCK_VALUATION_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
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
  rawBody?: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body !== undefined || rawBody !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const warehouseUser = await login("depo@axondemo.com", "axon-demo");
  const unauthorized = await login("muhasebe@axondemo.com", "axon-demo");
  const starter = await login("starter@axondemo.com", "axon-starter-demo");
  const productIds: string[] = [];
  const warehouseIds: string[] = [];
  const foreignMovementIds: string[] = [];
  try {
    assert.equal((await api(null, "GET", "/api/stock-valuations")).status, 401);
    assert.equal(
      (await api(unauthorized, "GET", "/api/stock-valuations")).status,
      403,
    );
    assert.equal(
      (await api(unauthorized, "POST", "/api/stock-valuations", {})).status,
      403,
    );
    assert.equal(
      (await api(starter, "GET", "/api/stock-valuations")).status,
      200,
    );
    assert.equal(
      (await api(starter, "POST", "/api/stock-valuations", {})).status,
      403,
    );
    assert.equal(
      (await api(warehouseUser, "GET", "/api/stock-valuations")).status,
      200,
    );

    for (const query of [
      "page=0",
      "page=x",
      "limit=0",
      "limit=101",
      "dateFrom=bad",
      "dateFrom=2026-02-02&dateTo=2026-01-01",
      "movement=INVALID",
    ]) {
      assert.equal(
        (await api(owner, "GET", `/api/stock-valuations?${query}`)).status,
        400,
        query,
      );
    }

    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId: owner.tenantId,
        code: `${marker}_W`,
        name: `${marker} Depo`,
      },
    });
    warehouseIds.push(warehouse.id);
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Türkçe Ürün`,
        costingMethod: CostingMethod.MOVING_AVERAGE,
        averageCost: 0,
        purchasePrice: 8,
      },
    });
    productIds.push(product.id);
    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: starter.tenantId },
    });
    const foreignProduct = await prisma.product.findFirstOrThrow({
      where: { tenantId: starter.tenantId, deletedAt: null },
    });
    const otherWarehouse = await prisma.warehouse.create({
      data: {
        tenantId: owner.tenantId,
        code: `${marker}_W2`,
        name: `${marker} Other Warehouse`,
      },
    });
    warehouseIds.push(otherWarehouse.id);
    const otherProduct = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P2`,
        name: `${marker} Other Product`,
        costingMethod: CostingMethod.MOVING_AVERAGE,
      },
    });
    productIds.push(otherProduct.id);

    for (const payload of [
      {},
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: "bad",
        qtyBalance: 1,
        unitCost: 1,
        totalValue: 1,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyIn: -1,
        qtyBalance: 1,
        unitCost: 1,
        totalValue: 1,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyIn: 1,
        qtyOut: 1,
        qtyBalance: 1,
        unitCost: 1,
        totalValue: 1,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyBalance: 2,
        unitCost: 3,
        totalValue: 99,
      },
      {
        productId: foreignProduct.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyBalance: 1,
        unitCost: 1,
        totalValue: 1,
      },
      {
        productId: product.id,
        warehouseId: foreignWarehouse.id,
        date: new Date().toISOString(),
        qtyBalance: 1,
        unitCost: 1,
        totalValue: 1,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyIn: 0.0001,
        qtyBalance: 0.0001,
        unitCost: 1,
        totalValue: 0,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyIn: 1,
        qtyBalance: 1,
        unitCost: 0.00001,
        totalValue: 0,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyIn: 1,
        qtyBalance: 1,
        unitCost: 1,
        totalValue: 1.001,
      },
      {
        productId: product.id,
        warehouseId: warehouse.id,
        date: new Date().toISOString(),
        qtyIn: 1e15,
        qtyBalance: 1e15,
        unitCost: 1,
        totalValue: 1e15,
      },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/stock-valuations", payload)).status,
        400,
      );
    assert.equal(
      (await api(owner, "POST", "/api/stock-valuations", undefined, "{"))
        .status,
      400,
    );
    assert.equal(
      (
        await api(
          owner,
          "POST",
          "/api/stock-valuations",
          undefined,
          JSON.stringify({
            productId: product.id,
            warehouseId: warehouse.id,
            date: new Date().toISOString(),
            qtyIn: 1,
            qtyBalance: 1,
            unitCost: 1,
          }).replace('"unitCost":1', '"unitCost":1e309'),
        )
      ).status,
      400,
    );

    let movementSequence = 0;
    const movement = async (
      type: "IN" | "OUT",
      quantity: number,
      unitCost?: number,
    ) =>
      api(owner, "POST", "/api/stock/movements", {
        idempotencyKey: `${marker}_${++movementSequence}`,
        productId: product.id,
        warehouseId: warehouse.id,
        type,
        quantity,
        ...(unitCost === undefined ? {} : { unitCost }),
        notes: `${marker}_${type}`,
      });
    assert.equal((await movement("IN", 10, 10)).status, 201);
    assert.equal((await movement("IN", 10, 20)).status, 201);
    assert.equal((await movement("OUT", 4)).status, 201);

    const valuations = await prisma.stockValuation.findMany({
      where: { productId: product.id },
      orderBy: { date: "asc" },
    });
    assert.equal(valuations.length, 3);
    assert.deepEqual(
      valuations.map((row) => Number(row.qtyBalance)),
      [10, 20, 16],
    );
    assert.deepEqual(
      valuations.map((row) => Number(row.unitCost)),
      [10, 20, 15],
    );
    assert.deepEqual(
      valuations.map((row) => Number(row.totalValue)),
      [100, 400, 240],
    );
    assert.equal(
      Number(
        (
          await prisma.stockLevel.findFirstOrThrow({
            where: { productId: product.id, warehouseId: warehouse.id },
          })
        ).quantity,
      ),
      16,
    );
    assert.equal(
      Number(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .averageCost,
      ),
      15,
    );

    const list = await api(
      owner,
      "GET",
      `/api/stock-valuations?productId=${product.id}&page=1&limit=2`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 2);
    assert.equal(list.body.meta.total, 3);
    assert.equal(list.body.meta.totalPages, 2);
    assert.ok(
      new Date(list.body.data[0].date) >= new Date(list.body.data[1].date),
    );
    assert.equal(
      (
        await api(
          owner,
          "GET",
          `/api/stock-valuations?search=${encodeURIComponent("türkçe ürün")}`,
        )
      ).body.meta.total,
      3,
    );
    assert.equal(
      (
        await api(
          owner,
          "GET",
          `/api/stock-valuations?productId=${product.id}&movement=in`,
        )
      ).body.meta.total,
      2,
    );
    assert.equal(
      (
        await api(
          owner,
          "GET",
          `/api/stock-valuations?productId=${product.id}&movement=out`,
        )
      ).body.meta.total,
      1,
    );
    assert.equal(
      (
        await api(
          owner,
          "GET",
          `/api/stock-valuations?warehouseId=${foreignWarehouse.id}`,
        )
      ).body.data.length,
      0,
    );
    assert.equal(
      (
        await api(
          starter,
          "GET",
          `/api/stock-valuations?productId=${product.id}`,
        )
      ).body.data.length,
      0,
    );

    const summary = await api(
      owner,
      "GET",
      `/api/stock-valuations/summary?productId=${product.id}`,
    );
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.length, 1);
    assert.equal(Number(summary.body.data[0].qtyBalance), 16);
    assert.equal(Number(summary.body.data[0].totalValue), 240);

    const existingMovementId = valuations[0].movementId!;
    const duplicate = {
      productId: product.id,
      warehouseId: warehouse.id,
      movementId: existingMovementId,
      date: new Date().toISOString(),
      qtyIn: 10,
      qtyBalance: 10,
      unitCost: 10,
      totalValue: 100,
    };
    assert.equal(
      (await api(owner, "POST", "/api/stock-valuations", duplicate)).status,
      409,
    );

    // Real concurrent requests for one movement: the database unique constraint is the final arbiter.
    const unvaluedMovement = await prisma.stockMovement.create({
      data: {
        tenantId: owner.tenantId,
        productId: product.id,
        type: "IN",
        quantity: 2,
        unitCost: 7,
        toWarehouseId: warehouse.id,
        refType: "MANUAL",
        idempotencyKey: `${marker}_DIRECT_SAME`,
      },
    });
    const sameMovementPayload = {
      productId: product.id,
      warehouseId: warehouse.id,
      movementId: unvaluedMovement.id,
      date: new Date().toISOString(),
      qtyIn: 2,
      qtyOut: 0,
      qtyBalance: 18,
      unitCost: 7,
      totalValue: 126,
    };
    const concurrentSame = await Promise.all([
      api(owner, "POST", "/api/stock-valuations", sameMovementPayload),
      api(owner, "POST", "/api/stock-valuations", sameMovementPayload),
    ]);
    assert.deepEqual(
      concurrentSame.map((result) => result.status).sort(),
      [201, 409],
    );
    assert.equal(
      await prisma.stockValuation.count({
        where: { movementId: unvaluedMovement.id },
      }),
      1,
    );

    // A valid movement cannot be rebound to another product, warehouse or tenant.
    for (const payload of [
      {
        ...sameMovementPayload,
        movementId: unvaluedMovement.id,
        productId: otherProduct.id,
      },
      {
        ...sameMovementPayload,
        movementId: unvaluedMovement.id,
        warehouseId: otherWarehouse.id,
      },
      {
        ...sameMovementPayload,
        movementId: unvaluedMovement.id,
        qtyIn: 0,
        qtyOut: 2,
      },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/stock-valuations", payload)).status,
        400,
      );
    const foreignMovement = await prisma.stockMovement.create({
      data: {
        tenantId: starter.tenantId,
        productId: foreignProduct.id,
        type: "IN",
        quantity: 1,
        unitCost: 1,
        toWarehouseId: foreignWarehouse.id,
        refType: "MANUAL",
        idempotencyKey: `${marker}_FOREIGN`,
      },
    });
    foreignMovementIds.push(foreignMovement.id);
    assert.equal(
      (
        await api(owner, "POST", "/api/stock-valuations", {
          ...sameMovementPayload,
          movementId: foreignMovement.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (await api(starter, "POST", "/api/stock-valuations", sameMovementPayload))
        .status,
      403,
    );

    // Two distinct movements for the same inventory position remain independently valid.
    const [movementA, movementB] = await Promise.all([
      prisma.stockMovement.create({
        data: {
          tenantId: owner.tenantId,
          productId: otherProduct.id,
          type: "IN",
          quantity: 1,
          unitCost: 4,
          toWarehouseId: warehouse.id,
          refType: "MANUAL",
          idempotencyKey: `${marker}_DIRECT_A`,
        },
      }),
      prisma.stockMovement.create({
        data: {
          tenantId: owner.tenantId,
          productId: otherProduct.id,
          type: "IN",
          quantity: 1,
          unitCost: 6,
          toWarehouseId: warehouse.id,
          refType: "MANUAL",
          idempotencyKey: `${marker}_DIRECT_B`,
        },
      }),
    ]);
    const dateA = new Date(Date.now() + 1_000).toISOString();
    const dateB = new Date(Date.now() + 2_000).toISOString();
    const concurrentDifferent = await Promise.all([
      api(owner, "POST", "/api/stock-valuations", {
        productId: otherProduct.id,
        warehouseId: warehouse.id,
        movementId: movementA.id,
        date: dateA,
        qtyIn: 1,
        qtyOut: 0,
        qtyBalance: 1,
        unitCost: 4,
        totalValue: 4,
      }),
      api(owner, "POST", "/api/stock-valuations", {
        productId: otherProduct.id,
        warehouseId: warehouse.id,
        movementId: movementB.id,
        date: dateB,
        qtyIn: 1,
        qtyOut: 0,
        qtyBalance: 2,
        unitCost: 6,
        totalValue: 12,
      }),
    ]);
    assert.deepEqual(
      concurrentDifferent.map((result) => result.status),
      [201, 201],
    );
    const distinctValuations = await prisma.stockValuation.findMany({
      where: { movementId: { in: [movementA.id, movementB.id] } },
      orderBy: { date: "asc" },
    });
    assert.equal(distinctValuations.length, 2);
    assert.deepEqual(
      distinctValuations.map((row) => [
        Number(row.qtyBalance),
        Number(row.unitCost),
        Number(row.totalValue),
      ]),
      [
        [1, 4, 4],
        [2, 6, 12],
      ],
    );

    // Fault injection: valuation Decimal overflow occurs after movement/level/product writes, so all must roll back.
    const atomicProduct = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_ATOMIC`,
        name: `${marker} Atomic`,
        costingMethod: CostingMethod.MOVING_AVERAGE,
        averageCost: 0,
      },
    });
    productIds.push(atomicProduct.id);
    const faultKey = `${marker}_FAULT`;
    const failedAtomic = await api(owner, "POST", "/api/stock/movements", {
      idempotencyKey: faultKey,
      productId: atomicProduct.id,
      warehouseId: warehouse.id,
      type: "IN",
      quantity: 100_000_000_000_000,
      unitCost: 1_000,
    });
    assert.ok(failedAtomic.status >= 400);
    assert.equal(
      await prisma.stockMovement.count({
        where: { tenantId: owner.tenantId, idempotencyKey: faultKey },
      }),
      0,
    );
    assert.equal(
      await prisma.stockLevel.count({
        where: { tenantId: owner.tenantId, productId: atomicProduct.id },
      }),
      0,
    );
    assert.equal(
      await prisma.stockValuation.count({
        where: { tenantId: owner.tenantId, productId: atomicProduct.id },
      }),
      0,
    );
    assert.equal(
      Number(
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: atomicProduct.id },
          })
        ).averageCost,
      ),
      0,
    );

    const retryPayload = {
      idempotencyKey: faultKey,
      productId: atomicProduct.id,
      warehouseId: warehouse.id,
      type: "IN",
      quantity: 1,
      unitCost: 10,
    };
    assert.equal(
      (await api(owner, "POST", "/api/stock/movements", retryPayload)).status,
      201,
    );
    assert.equal(
      (await api(owner, "POST", "/api/stock/movements", retryPayload)).status,
      201,
    );
    assert.equal(
      await prisma.stockMovement.count({
        where: { tenantId: owner.tenantId, idempotencyKey: faultKey },
      }),
      1,
    );
    assert.equal(
      await prisma.stockValuation.count({
        where: { tenantId: owner.tenantId, productId: atomicProduct.id },
      }),
      1,
    );
    assert.equal(
      Number(
        (
          await prisma.stockLevel.findFirstOrThrow({
            where: { tenantId: owner.tenantId, productId: atomicProduct.id },
          })
        ).quantity,
      ),
      1,
    );
    const concurrentOperations = await Promise.all([
      api(owner, "POST", "/api/stock/movements", {
        idempotencyKey: `${marker}_OP_A`,
        productId: atomicProduct.id,
        warehouseId: warehouse.id,
        type: "IN",
        quantity: 2,
        unitCost: 10,
      }),
      api(owner, "POST", "/api/stock/movements", {
        idempotencyKey: `${marker}_OP_B`,
        productId: atomicProduct.id,
        warehouseId: warehouse.id,
        type: "IN",
        quantity: 3,
        unitCost: 20,
      }),
    ]);
    assert.deepEqual(
      concurrentOperations.map((result) => result.status),
      [201, 201],
    );
    const atomicLevel = await prisma.stockLevel.findFirstOrThrow({
      where: {
        tenantId: owner.tenantId,
        productId: atomicProduct.id,
        warehouseId: warehouse.id,
      },
    });
    const atomicAfter = await prisma.product.findUniqueOrThrow({
      where: { id: atomicProduct.id },
    });
    const atomicLatest = await prisma.stockValuation.findFirstOrThrow({
      where: {
        tenantId: owner.tenantId,
        productId: atomicProduct.id,
        warehouseId: warehouse.id,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    assert.equal(Number(atomicLevel.quantity), 6);
    assert.ok(Math.abs(Number(atomicAfter.averageCost) - 15) < 0.0001);
    assert.equal(Number(atomicLatest.qtyBalance), 6);
    assert.equal(
      Number(atomicLatest.totalValue),
      Number(atomicLatest.qtyBalance) * Number(atomicLatest.unitCost),
    );
    assert.equal(
      await prisma.stockValuation.count({
        where: {
          movementId: {
            in: concurrentOperations.map((result) => result.body.data.id),
          },
        },
      }),
      2,
    );
    const manual = await api(owner, "POST", "/api/stock-valuations", {
      productId: product.id,
      warehouseId: warehouse.id,
      date: "2020-01-01T00:00:00.000Z",
      qtyBalance: 2,
      unitCost: 3,
      totalValue: 6,
    });
    assert.equal(manual.status, 201);
    assert.equal(
      await prisma.stockValuation.count({
        where: { id: manual.body.data.id, tenantId: owner.tenantId },
      }),
      1,
    );

    const reconciliation = await api(
      owner,
      "GET",
      "/api/stock/valuation/reconciliation",
    );
    assert.equal(reconciliation.status, 200);
    assert.ok(reconciliation.body.data);
    const expectedInventoryValue = (
      await prisma.stockLevel.findMany({
        where: { tenantId: owner.tenantId, product: { deletedAt: null } },
        include: { product: { select: { averageCost: true } } },
      })
    ).reduce(
      (sum, level) =>
        sum + Number(level.quantity) * Number(level.product.averageCost ?? 0),
      0,
    );
    assert.ok(
      Math.abs(
        reconciliation.body.data.totalInventoryValuation -
          expectedInventoryValue,
      ) < 0.01,
    );
    assert.equal(
      reconciliation.body.data.status,
      Math.abs(reconciliation.body.data.discrepancy) < 0.01
        ? "RECONCILED"
        : "DISCREPANCY",
    );
    console.log(
      "stock valuation assurance passed: auth/plan/permission, validation, tenant isolation, calculations, pagination, filters, summary, DB and reconciliation",
    );
  } finally {
    await prisma.stockValuation.deleteMany({
      where: { movementId: { in: foreignMovementIds } },
    });
    await prisma.stockMovement.deleteMany({
      where: { id: { in: foreignMovementIds } },
    });
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
    await prisma.location.deleteMany({
      where: { warehouseId: { in: warehouseIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
