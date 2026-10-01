import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { getStockPosition } from "../src/services/inventory-rules.service.js";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_ADV_SERVICE_PARTS_${Date.now()}`;
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
async function reserve(
  session: Session,
  requestId: string,
  warehouseId: string,
) {
  const response = await fetch(
    `${baseUrl}/api/service/requests/${requestId}/automation/reserve-parts`,
    {
      method: "POST",
      headers: {
        origin,
        cookie: session.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ warehouseId }),
    },
  );
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}
async function advanced(session: Session) {
  const response = await fetch(
    `${baseUrl}/api/service/advanced?horizonDays=30`,
    { headers: { origin, cookie: session.cookie } },
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as any).data;
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const foreign = await login("pro@axondemo.com", "axon-pro-demo");
  const requestIds: string[] = [];
  const productIds: string[] = [];
  const warehouseIds: string[] = [];
  try {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const warehouseA = await prisma.warehouse.create({
      data: {
        tenantId: owner.tenantId,
        code: `${marker}_WA`,
        name: "Warehouse A",
      },
    });
    const warehouseB = await prisma.warehouse.create({
      data: {
        tenantId: owner.tenantId,
        code: `${marker}_WB`,
        name: "Warehouse B",
      },
    });
    warehouseIds.push(warehouseA.id, warehouseB.id);
    const locationA = await prisma.location.create({
      data: {
        tenantId: owner.tenantId,
        warehouseId: warehouseA.id,
        code: `${marker}_LA`,
        name: "A",
      },
    });
    const locationB = await prisma.location.create({
      data: {
        tenantId: owner.tenantId,
        warehouseId: warehouseB.id,
        code: `${marker}_LB`,
        name: "B",
      },
    });
    const products = await Promise.all(
      ["A", "B", "C"].map((suffix) =>
        prisma.product.create({
          data: {
            tenantId: owner.tenantId,
            unitId: unit.id,
            code: `${marker}_${suffix}`,
            name: `Part ${suffix}`,
          },
        }),
      ),
    );
    productIds.push(...products.map((p) => p.id));
    await prisma.stockLevel.createMany({
      data: products.flatMap((product) => [
        {
          tenantId: owner.tenantId,
          productId: product.id,
          warehouseId: warehouseA.id,
          locationId: locationA.id,
          quantity: 10,
        },
        {
          tenantId: owner.tenantId,
          productId: product.id,
          warehouseId: warehouseB.id,
          locationId: locationB.id,
          quantity: 3,
        },
      ]),
    });
    let sequence = 0;
    async function request(
      lines: Array<[number, number]>,
      status: "OPEN" | "IN_PROGRESS" = "OPEN",
    ) {
      const created = await prisma.serviceRequest.create({
        data: {
          tenantId: owner.tenantId,
          number: `${marker}_${++sequence}`,
          subject: marker,
          status,
          items: {
            create: lines.map(([productIndex, quantity]) => ({
              tenantId: owner.tenantId,
              productId: products[productIndex].id,
              description: `Part ${productIndex}`,
              quantity,
            })),
          },
        },
      });
      requestIds.push(created.id);
      return created;
    }
    async function active(requestId: string) {
      return prisma.inventoryReservation.findMany({
        where: {
          tenantId: owner.tenantId,
          refType: "OTHER",
          refId: requestId,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { productId: "asc" },
      });
    }

    const multi = await request([
      [0, 5],
      [1, 3],
      [2, 2],
    ]);
    const multiResult = await reserve(owner, multi.id, warehouseA.id);
    assert.equal(multiResult.status, 200);
    assert.equal(multiResult.body.data.reservedItemCount, 3);
    const multiRows = await active(multi.id);
    assert.equal(multiRows.length, 3);
    assert.deepEqual(
      multiRows.map((row) => Number(row.quantity)).sort((a, b) => a - b),
      [2, 3, 5],
    );
    assert.equal(
      multiRows.every(
        (row) =>
          row.tenantId === owner.tenantId &&
          row.warehouseId === warehouseA.id &&
          productIds.includes(row.productId),
      ),
      true,
    );
    assert.equal(
      (
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: multi.id },
        })
      ).status,
      "WAITING_PARTS",
    );
    await prisma.inventoryReservation.updateMany({
      where: { refId: multi.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });

    const atomicFailure = await request(
      [
        [0, 5],
        [1, 30],
        [2, 2],
      ],
      "IN_PROGRESS",
    );
    const failed = await reserve(owner, atomicFailure.id, warehouseA.id);
    assert.equal(failed.status, 400);
    assert.equal((await active(atomicFailure.id)).length, 0);
    assert.equal(
      (
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: atomicFailure.id },
        })
      ).status,
      "IN_PROGRESS",
    );

    const concurrent = await request([[0, 7]]);
    const race = await Promise.all([
      reserve(owner, concurrent.id, warehouseA.id),
      reserve(owner, concurrent.id, warehouseA.id),
    ]);
    assert.deepEqual(
      race.map((row) => row.status),
      [200, 200],
    );
    let raceRows = await active(concurrent.id);
    assert.equal(raceRows.length, 1);
    assert.equal(Number(raceRows[0].quantity), 7);
    assert.equal(
      (
        await getStockPosition(
          prisma,
          owner.tenantId,
          products[0].id,
          warehouseA.id,
        )
      ).available >= 0,
      true,
    );
    assert.equal(
      (await reserve(owner, concurrent.id, warehouseA.id)).status,
      200,
    );
    raceRows = await active(concurrent.id);
    assert.equal(raceRows.length, 1);
    assert.equal(Number(raceRows[0].quantity), 7);
    assert.equal(
      (
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: concurrent.id },
        })
      ).status,
      "WAITING_PARTS",
    );
    await prisma.inventoryReservation.updateMany({
      where: { refId: concurrent.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });

    const partial = await request([[1, 10]]);
    await prisma.inventoryReservation.create({
      data: {
        tenantId: owner.tenantId,
        productId: products[1].id,
        warehouseId: warehouseA.id,
        quantity: 4,
        refType: "OTHER",
        refId: partial.id,
      },
    });
    assert.equal((await reserve(owner, partial.id, warehouseA.id)).status, 200);
    const partialRows = await active(partial.id);
    assert.equal(partialRows.length, 1);
    assert.equal(Number(partialRows[0].quantity), 10);
    assert.equal((await reserve(owner, partial.id, warehouseA.id)).status, 200);
    assert.equal((await active(partial.id)).length, 1);
    assert.equal(Number((await active(partial.id))[0].quantity), 10);

    const expired = await request([[2, 10]]);
    await prisma.inventoryReservation.create({
      data: {
        tenantId: owner.tenantId,
        productId: products[2].id,
        warehouseId: warehouseA.id,
        quantity: 4,
        refType: "OTHER",
        refId: expired.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expiredPanel = (await advanced(owner)).sparePartReservations.find(
      (row: any) => row.serviceRequestId === expired.id,
    );
    assert.equal(expiredPanel.reservedQty, 0);
    assert.equal(expiredPanel.status, "reserve_recommended");
    assert.equal((await reserve(owner, expired.id, warehouseA.id)).status, 200);
    assert.equal((await active(expired.id)).length, 1);
    assert.equal(Number((await active(expired.id))[0].quantity), 10);
    assert.equal(
      await prisma.inventoryReservation.count({
        where: { refId: expired.id, releasedAt: { not: null } },
      }),
      1,
    );

    const insufficient = await request([[0, 10]]);
    const unavailable = await reserve(owner, insufficient.id, warehouseB.id);
    assert.equal(unavailable.status, 400);
    assert.equal((await active(insufficient.id)).length, 0);
    assert.equal(
      (
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: insufficient.id },
        })
      ).status,
      "OPEN",
    );
    assert.deepEqual(
      await getStockPosition(
        prisma,
        owner.tenantId,
        products[0].id,
        warehouseB.id,
      ),
      { onHand: 3, reserved: 0, available: 3 },
    );
    assert.equal(
      (await reserve(owner, insufficient.id, warehouseA.id)).status,
      200,
    );
    assert.equal((await active(insufficient.id))[0].warehouseId, warehouseA.id);

    const releaseRequest = await request([[1, 2]]);
    assert.equal(
      (await reserve(owner, releaseRequest.id, warehouseB.id)).status,
      200,
    );
    assert.deepEqual(
      await getStockPosition(
        prisma,
        owner.tenantId,
        products[1].id,
        warehouseB.id,
      ),
      { onHand: 3, reserved: 2, available: 1 },
    );
    const releaseRow = (await active(releaseRequest.id))[0];
    await prisma.inventoryReservation.update({
      where: { id: releaseRow.id },
      data: { releasedAt: new Date() },
    });
    assert.deepEqual(
      await getStockPosition(
        prisma,
        owner.tenantId,
        products[1].id,
        warehouseB.id,
      ),
      { onHand: 3, reserved: 0, available: 3 },
    );

    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: foreign.tenantId },
    });
    const tenantRequest = await request([[2, 1]]);
    assert.equal(
      (await reserve(owner, tenantRequest.id, foreignWarehouse.id)).status,
      404,
    );
    assert.equal((await active(tenantRequest.id)).length, 0);
    for (const product of products)
      for (const warehouse of [warehouseA, warehouseB]) {
        const position = await getStockPosition(
          prisma,
          owner.tenantId,
          product.id,
          warehouse.id,
        );
        assert.ok(position.reserved <= position.onHand);
        assert.ok(position.available >= 0);
      }
    console.log(
      "PASS service parts reservation assurance: atomic multi-item writes, status atomicity, concurrency, retry, partial/full existing, insufficient stock, warehouse/tenant isolation, release/expiry and DB invariants",
    );
  } finally {
    await prisma.inventoryReservation.deleteMany({
      where: {
        OR: [{ refId: { in: requestIds } }, { productId: { in: productIds } }],
      },
    });
    await prisma.serviceRequest.deleteMany({
      where: { id: { in: requestIds } },
    });
    await prisma.stockLevel.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.location.deleteMany({
      where: { warehouseId: { in: warehouseIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    assert.equal(
      await prisma.serviceRequest.count({
        where: { number: { startsWith: marker } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
