import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_STOCK_COUNT_${Date.now()}`;
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
  let thresholdBefore: string | undefined;

  try {
    assert.equal((await api(null, "GET", "/api/stock/counts")).status, 401);
    assert.equal(
      (await api(unauthorized, "GET", "/api/stock/counts")).status,
      403,
    );
    assert.equal(
      (await api(unauthorized, "POST", "/api/stock/counts", {})).status,
      403,
    );
    assert.equal(
      (
        await api(
          unauthorized,
          "POST",
          "/api/stock/counts/missing/finalize",
          {},
        )
      ).status,
      403,
    );

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
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Türkçe Ürün`,
        averageCost: 25,
      },
    });
    productIds.push(product.id);
    await prisma.stockLevel.createMany({
      data: [
        {
          tenantId: owner.tenantId,
          productId: product.id,
          warehouseId,
          locationId: locationA.id,
          quantity: 6,
        },
        {
          tenantId: owner.tenantId,
          productId: product.id,
          warehouseId,
          locationId: locationB.id,
          quantity: 6,
        },
      ],
    });

    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: foreign.tenantId },
    });
    const foreignProduct = await prisma.product.findFirstOrThrow({
      where: { tenantId: foreign.tenantId, deletedAt: null },
    });
    const foreignLocation = await prisma.location.findFirst({
      where: { tenantId: foreign.tenantId },
    });
    const validItem = {
      productId: product.id,
      expectedQty: 999,
      countedQty: 10,
    };
    const baseBody = {
      warehouseId,
      date: "2026-09-30",
      notes: `${marker} not`,
      items: [validItem],
    };

    for (const body of [
      {},
      { ...baseBody, date: "not-a-date" },
      { ...baseBody, notes: "x".repeat(2001) },
      { ...baseBody, items: [{ ...validItem, countedQty: -1 }] },
      { ...baseBody, items: [validItem, validItem] },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/stock/counts", body)).status,
        400,
      );
    assert.equal(
      (
        await api(owner, "POST", "/api/stock/counts", {
          ...baseBody,
          warehouseId: foreignWarehouse.id,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api(owner, "POST", "/api/stock/counts", {
          ...baseBody,
          items: [{ ...validItem, productId: foreignProduct.id }],
        })
      ).status,
      400,
    );
    if (foreignLocation) {
      assert.equal(
        (
          await api(owner, "POST", "/api/stock/counts", {
            ...baseBody,
            items: [{ ...validItem, locationId: foreignLocation.id }],
          })
        ).status,
        400,
      );
    }

    const created = await api(
      warehouseUser,
      "POST",
      "/api/stock/counts",
      baseBody,
    );
    assert.equal(created.status, 201);
    const countId = created.body.data.id as string;
    assert.equal(
      Number(created.body.data.items[0].expectedQty),
      12,
      "expectedQty must be server snapshot, not caller value",
    );
    assert.equal(Number(created.body.data.items[0].difference), -2);
    const stored = await prisma.stockCount.findUniqueOrThrow({
      where: { id: countId },
      include: { items: true },
    });
    assert.equal(stored.tenantId, owner.tenantId);
    assert.equal(stored.createdById !== null, true);
    assert.equal(Number(stored.items[0].expectedQty), 12);

    const list = await api(owner, "GET", "/api/stock/counts");
    assert.equal(list.status, 200);
    assert.equal(
      list.body.data.some((row: any) => row.id === countId),
      true,
    );
    assert.equal(
      (await api(foreign, "GET", `/api/stock/counts/${countId}`)).status,
      404,
    );
    assert.equal(
      (await api(owner, "GET", "/api/stock/counts/not-found")).status,
      404,
    );

    const concurrent = await Promise.all([
      api(owner, "POST", `/api/stock/counts/${countId}/finalize`, {
        applyAdjustments: true,
      }),
      api(owner, "POST", `/api/stock/counts/${countId}/finalize`, {
        applyAdjustments: true,
      }),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === 200).length,
      1,
    );
    assert.equal(
      concurrent.filter(
        (result) => result.status === 400 || result.status === 409,
      ).length,
      1,
    );
    const movements = await prisma.stockMovement.findMany({
      where: {
        tenantId: owner.tenantId,
        refType: "STOCK_COUNT",
        refId: countId,
      },
    });
    assert.equal(movements.length, 1);
    assert.equal(Number(movements[0].quantity), 2);
    assert.equal(movements[0].fromWarehouseId, warehouseId);
    const aggregate = await prisma.stockLevel.aggregate({
      where: { tenantId: owner.tenantId, productId: product.id, warehouseId },
      _sum: { quantity: true },
    });
    assert.equal(
      Number(aggregate._sum.quantity),
      10,
      "warehouse-wide count must reconcile all locations",
    );
    const nonNegative = await prisma.stockLevel.findMany({
      where: { tenantId: owner.tenantId, productId: product.id, warehouseId },
    });
    assert.equal(
      nonNegative.every((level) => Number(level.quantity) >= 0),
      true,
    );
    const finalized = await api(owner, "GET", `/api/stock/counts/${countId}`);
    assert.equal(finalized.body.data.isFinalized, true);
    assert.equal(finalized.body.data.finalizedById !== null, true);
    assert.equal(
      (
        await api(owner, "POST", `/api/stock/counts/${countId}/finalize`, {
          applyAdjustments: true,
        })
      ).status,
      400,
    );
    assert.equal(
      await prisma.stockMovement.count({
        where: { refType: "STOCK_COUNT", refId: countId },
      }),
      1,
    );

    const stale = await api(owner, "POST", "/api/stock/counts", {
      ...baseBody,
      items: [{ ...validItem, expectedQty: 10, countedQty: 8 }],
    });
    assert.equal(stale.status, 201);
    await prisma.stockLevel.update({
      where: { id: nonNegative[0].id },
      data: { quantity: { increment: 2 } },
    });
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/stock/counts/${stale.body.data.id}/finalize`,
          { applyAdjustments: true },
        )
      ).status,
      200,
    );
    const staleMovement = await prisma.stockMovement.findFirstOrThrow({
      where: { refType: "STOCK_COUNT", refId: stale.body.data.id },
    });
    assert.equal(
      Number(staleMovement.quantity),
      4,
      "finalize adjustment must reflect current stock, not stale snapshot delta",
    );
    const afterStale = await prisma.stockLevel.aggregate({
      where: { tenantId: owner.tenantId, productId: product.id, warehouseId },
      _sum: { quantity: true },
    });
    assert.equal(Number(afterStale._sum.quantity), 8);

    const noApply = await api(owner, "POST", "/api/stock/counts", {
      ...baseBody,
      items: [{ ...validItem, expectedQty: 8, countedQty: 0 }],
    });
    assert.equal(noApply.status, 201);
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/stock/counts/${noApply.body.data.id}/finalize`,
          { applyAdjustments: false },
        )
      ).status,
      200,
    );
    const afterNoApply = await prisma.stockLevel.aggregate({
      where: { tenantId: owner.tenantId, productId: product.id, warehouseId },
      _sum: { quantity: true },
    });
    assert.equal(Number(afterNoApply._sum.quantity), 8);
    assert.equal(
      await prisma.stockMovement.count({
        where: { refType: "STOCK_COUNT", refId: noApply.body.data.id },
      }),
      0,
    );

    const setting = await prisma.moduleSetting.findUnique({
      where: {
        tenantId_module_key: {
          tenantId: owner.tenantId,
          module: "inventory",
          key: "stock_count_approval_threshold",
        },
      },
    });
    thresholdBefore = setting?.value;
    await prisma.moduleSetting.upsert({
      where: {
        tenantId_module_key: {
          tenantId: owner.tenantId,
          module: "inventory",
          key: "stock_count_approval_threshold",
        },
      },
      create: {
        tenantId: owner.tenantId,
        module: "inventory",
        key: "stock_count_approval_threshold",
        value: "1",
      },
      update: { value: "1" },
    });
    const approval = await api(owner, "POST", "/api/stock/counts", {
      ...baseBody,
      items: [{ ...validItem, countedQty: 5 }],
    });
    assert.equal(approval.status, 201);
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/stock/counts/${approval.body.data.id}/finalize`,
          { applyAdjustments: true },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/stock/counts/${approval.body.data.id}/finalize`,
          {
            applyAdjustments: true,
            approvalReason: "TEST_E2E manager approval",
          },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await api(
          foreign,
          "POST",
          `/api/stock/counts/${approval.body.data.id}/finalize`,
          { applyAdjustments: true },
        )
      ).status,
      404,
    );

    console.log("stock-counts-assurance: PASS");
  } finally {
    if (thresholdBefore === undefined)
      await prisma.moduleSetting.deleteMany({
        where: {
          tenantId: owner.tenantId,
          module: "inventory",
          key: "stock_count_approval_threshold",
        },
      });
    else
      await prisma.moduleSetting.updateMany({
        where: {
          tenantId: owner.tenantId,
          module: "inventory",
          key: "stock_count_approval_threshold",
        },
        data: { value: thresholdBefore },
      });
    const countIds = (
      await prisma.stockCount.findMany({
        where: {
          tenantId: owner.tenantId,
          OR: [
            { notes: { contains: marker } },
            { items: { some: { productId: { in: productIds } } } },
          ],
        },
        select: { id: true },
      })
    ).map((row) => row.id);
    await prisma.stockValuation.deleteMany({
      where: { tenantId: owner.tenantId, productId: { in: productIds } },
    });
    await prisma.stockMovement.deleteMany({
      where: {
        tenantId: owner.tenantId,
        OR: [{ refId: { in: countIds } }, { productId: { in: productIds } }],
      },
    });
    await prisma.stockCountItem.deleteMany({
      where: { tenantId: owner.tenantId, stockCountId: { in: countIds } },
    });
    await prisma.stockCount.deleteMany({
      where: { tenantId: owner.tenantId, id: { in: countIds } },
    });
    await prisma.stockLevel.deleteMany({
      where: { tenantId: owner.tenantId, productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { tenantId: owner.tenantId, id: { in: productIds } },
    });
    if (warehouseId) {
      await prisma.location.deleteMany({
        where: { tenantId: owner.tenantId, warehouseId },
      });
      await prisma.warehouse.deleteMany({
        where: { tenantId: owner.tenantId, id: warehouseId },
      });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
