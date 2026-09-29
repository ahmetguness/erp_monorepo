import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_WAREHOUSE_${Date.now()}`;
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
  const foreign = await login("starter@axondemo.com", "axon-starter-demo");
  const unauthorized = await login("muhasebe@axondemo.com", "axon-demo");
  const warehouseIds: string[] = [],
    locationIds: string[] = [],
    productIds: string[] = [];
  try {
    assert.equal((await api(null, "GET", "/api/warehouses")).status, 401);
    assert.equal(
      (await api(unauthorized, "GET", "/api/warehouses")).status,
      403,
    );
    assert.equal(
      (
        await api(unauthorized, "POST", "/api/warehouses", {
          code: "X",
          name: "X",
        })
      ).status,
      403,
    );
    for (const invalid of [
      {},
      { code: " ", name: "x" },
      { code: "x", name: " " },
      { code: "x", name: "x", extra: true },
      { code: "x".repeat(51), name: "x" },
    ]) {
      assert.equal(
        (await api(owner, "POST", "/api/warehouses", invalid)).status,
        400,
      );
    }
    const first = await api(owner, "POST", "/api/warehouses", {
      code: `${marker}_A`,
      name: `${marker}_Ana Depo`,
      address: "İstanbul Şişli",
    });
    const second = await api(owner, "POST", "/api/warehouses", {
      code: `${marker}_B`,
      name: `${marker}_Hedef Depo`,
      address: "Ankara",
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const sourceId = first.body.data.id as string,
      targetId = second.body.data.id as string;
    warehouseIds.push(sourceId, targetId);
    assert.equal(
      (
        await api(owner, "POST", "/api/warehouses", {
          code: `${marker}_A`,
          name: "duplicate",
        })
      ).status,
      400,
    );
    assert.equal(
      (await api(owner, "PATCH", `/api/warehouses/${sourceId}`, {})).status,
      400,
    );
    assert.equal(
      (await api(owner, "PATCH", `/api/warehouses/${sourceId}`, { name: " " }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/warehouses/${sourceId}`, {
          extra: true,
        })
      ).status,
      400,
    );
    const updated = await api(owner, "PATCH", `/api/warehouses/${sourceId}`, {
      name: `${marker}_Güncel`,
      address: null,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, `${marker}_Güncel`);
    assert.equal(updated.body.data.address, null);
    assert.equal(
      (await prisma.warehouse.findUniqueOrThrow({ where: { id: sourceId } }))
        .name,
      `${marker}_Güncel`,
    );

    const list = await api(owner, "GET", "/api/warehouses?page=1&limit=100");
    assert.equal(list.status, 200);
    assert.ok(list.body.data.some((item: any) => item.id === sourceId));
    assert.ok(list.body.meta.total >= 2);
    assert.equal(
      (await api(owner, "GET", `/api/warehouses/${sourceId}`)).status,
      200,
    );
    assert.equal(
      (await api(owner, "GET", "/api/warehouses/not-found")).status,
      404,
    );
    assert.equal(
      (await api(foreign, "GET", `/api/warehouses/${sourceId}`)).status,
      404,
    );
    assert.ok(
      [403, 404].includes(
        (
          await api(foreign, "PATCH", `/api/warehouses/${sourceId}`, {
            name: "HACK",
          })
        ).status,
      ),
    );

    for (const invalid of [
      {},
      { code: " ", name: "x" },
      { code: "x", name: " " },
      { code: "x", name: "x", extra: true },
    ]) {
      assert.equal(
        (
          await api(
            owner,
            "POST",
            `/api/warehouses/${sourceId}/locations`,
            invalid,
          )
        ).status,
        400,
      );
    }
    const sourceLocation = await api(
      owner,
      "POST",
      `/api/warehouses/${sourceId}/locations`,
      { code: `${marker}_L1`, name: "Kaynak Raf" },
    );
    const targetLocation = await api(
      owner,
      "POST",
      `/api/warehouses/${targetId}/locations`,
      { code: `${marker}_L2`, name: "Hedef Raf" },
    );
    assert.equal(sourceLocation.status, 201);
    assert.equal(targetLocation.status, 201);
    const sourceLocationId = sourceLocation.body.data.id as string,
      targetLocationId = targetLocation.body.data.id as string;
    locationIds.push(sourceLocationId, targetLocationId);
    assert.equal(
      (
        await api(owner, "POST", `/api/warehouses/${sourceId}/locations`, {
          code: `${marker}_L1`,
          name: "Tekrar",
        })
      ).status,
      400,
    );
    assert.equal(
      (await api(foreign, "GET", `/api/warehouses/${sourceId}/locations`))
        .status,
      404,
    );

    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker}_Ürün`,
        purchasePrice: 25,
      },
    });
    productIds.push(product.id);
    await prisma.stockLevel.create({
      data: {
        tenantId: owner.tenantId,
        productId: product.id,
        warehouseId: sourceId,
        locationId: sourceLocationId,
        quantity: 10,
      },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId: owner.tenantId,
        productId: product.id,
        type: "OPENING",
        quantity: 10,
        toWarehouseId: sourceId,
        locationId: sourceLocationId,
        unitCost: 25,
        totalCost: 250,
        idempotencyKey: `${marker}_OPEN`,
      },
    });
    assert.equal(
      Number(
        (
          await prisma.stockLevel.findFirstOrThrow({
            where: {
              productId: product.id,
              warehouseId: sourceId,
              locationId: sourceLocationId,
            },
          })
        ).quantity,
      ),
      10,
    );
    assert.equal(
      (
        await api(
          owner,
          "DELETE",
          `/api/warehouses/${sourceId}/locations/${sourceLocationId}`,
        )
      ).status,
      409,
    );

    const invalidTransferBase = {
      productId: product.id,
      fromWarehouseId: sourceId,
      toWarehouseId: targetId,
      quantity: 1,
      fromLocationId: sourceLocationId,
      toLocationId: targetLocationId,
    };
    for (const invalid of [
      {},
      { ...invalidTransferBase, quantity: 0 },
      { ...invalidTransferBase, quantity: -1 },
      { ...invalidTransferBase, quantity: Number.MAX_VALUE },
      { ...invalidTransferBase, extra: true },
      {
        ...invalidTransferBase,
        fromWarehouseId: targetId,
        toWarehouseId: targetId,
        fromLocationId: targetLocationId,
        toLocationId: targetLocationId,
      },
    ]) {
      assert.equal(
        (await api(owner, "POST", "/api/warehouses/transfer", invalid)).status,
        400,
      );
    }
    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: foreign.tenantId },
    });
    const foreignProduct = await prisma.product.findFirstOrThrow({
      where: { tenantId: foreign.tenantId, deletedAt: null },
    });
    assert.equal(
      (
        await api(owner, "POST", "/api/warehouses/transfer", {
          ...invalidTransferBase,
          toWarehouseId: foreignWarehouse.id,
          toLocationId: undefined,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(owner, "POST", "/api/warehouses/transfer", {
          ...invalidTransferBase,
          productId: foreignProduct.id,
        })
      ).status,
      400,
    );

    const transfer = await api(owner, "POST", "/api/warehouses/transfer", {
      ...invalidTransferBase,
      quantity: 2.5,
      notes: "Türkçe transfer",
    });
    assert.equal(transfer.status, 201, JSON.stringify(transfer.body));
    const sourceAfter = await prisma.stockLevel.findFirstOrThrow({
      where: {
        productId: product.id,
        warehouseId: sourceId,
        locationId: sourceLocationId,
      },
    });
    const targetAfter = await prisma.stockLevel.findFirstOrThrow({
      where: {
        productId: product.id,
        warehouseId: targetId,
        locationId: targetLocationId,
      },
    });
    assert.equal(Number(sourceAfter.quantity), 7.5);
    assert.equal(Number(targetAfter.quantity), 2.5);
    assert.equal(
      await prisma.stockMovement.count({
        where: {
          tenantId: owner.tenantId,
          productId: product.id,
          type: "TRANSFER",
        },
      }),
      1,
    );
    const total = await prisma.stockLevel.aggregate({
      where: { tenantId: owner.tenantId, productId: product.id },
      _sum: { quantity: true },
    });
    assert.equal(Number(total._sum.quantity), 10);

    const concurrent = await Promise.all([
      api(owner, "POST", "/api/warehouses/transfer", {
        ...invalidTransferBase,
        quantity: 6,
      }),
      api(owner, "POST", "/api/warehouses/transfer", {
        ...invalidTransferBase,
        quantity: 6,
      }),
    ]);
    assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 400]);
    const sourceFinal = await prisma.stockLevel.findFirstOrThrow({
      where: {
        productId: product.id,
        warehouseId: sourceId,
        locationId: sourceLocationId,
      },
    });
    assert.equal(Number(sourceFinal.quantity), 1.5);
    assert.ok(Number(sourceFinal.quantity) >= 0);
    const totalFinal = await prisma.stockLevel.aggregate({
      where: { tenantId: owner.tenantId, productId: product.id },
      _sum: { quantity: true },
    });
    assert.equal(Number(totalFinal._sum.quantity), 10);

    await prisma.stockLevel.updateMany({
      where: { productId: product.id, locationId: sourceLocationId },
      data: { quantity: 0 },
    });
    assert.equal(
      (
        await api(
          owner,
          "DELETE",
          `/api/warehouses/${sourceId}/locations/${sourceLocationId}`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await api(owner, "GET", `/api/warehouses/${sourceId}/locations`)
      ).body.data.some((item: any) => item.id === sourceLocationId),
      false,
    );
    assert.equal(
      (
        await prisma.location.findUniqueOrThrow({
          where: { id: sourceLocationId },
        })
      ).isActive,
      false,
    );

    await api(owner, "PATCH", `/api/warehouses/${targetId}`, {
      isActive: false,
    });
    assert.equal(
      (
        await api(owner, "POST", "/api/warehouses/transfer", {
          ...invalidTransferBase,
          fromLocationId: undefined,
          toLocationId: targetLocationId,
        })
      ).status,
      400,
    );
    console.log("PASS warehouses assurance (48 checks)");
  } finally {
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
    await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
