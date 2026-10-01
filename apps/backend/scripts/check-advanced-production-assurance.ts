import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_ADV_PROD_${Date.now()}`;
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

async function api(session: Session | null, query = "") {
  const response = await fetch(`${baseUrl}/api/production/advanced${query}`, {
    headers: { origin, ...(session ? { cookie: session.cookie } : {}) },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const unauthorized = await login("muhasebe@axondemo.com", "axon-demo");
  const foreign = await login("pro@axondemo.com", "axon-pro-demo");
  const productIds: string[] = [];
  const workCenterIds: string[] = [];
  const workOrderIds: string[] = [];
  try {
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(unauthorized)).status, 403);
    for (const value of [
      "abc",
      "30abc",
      "7.5",
      "0",
      "6",
      "181",
      "999999999999999999999",
    ])
      assert.equal((await api(owner, `?horizonDays=${value}`)).status, 400);

    const category = await prisma.category.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        categoryId: category.id,
        unitId: unit.id,
        code: marker,
        name: `${marker} Ürün`,
      },
    });
    productIds.push(product.id);
    for (let i = 0; i < 3; i++) {
      const wc = await prisma.workCenter.create({
        data: {
          tenantId: owner.tenantId,
          code: `${marker}_${i}`,
          name: `${marker} Merkez ${i}`,
          capacity: 8,
          laborRate: 10,
          overheadRate: 5,
        },
      });
      workCenterIds.push(wc.id);
    }
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    await prisma.workCenterCapacity.createMany({
      data: workCenterIds.flatMap((workCenterId) =>
        Array.from({ length: 30 }, (_, index) => {
          const date = new Date(start);
          date.setUTCDate(date.getUTCDate() + index);
          return {
            tenantId: owner.tenantId,
            workCenterId,
            date,
            capacity: 8,
            allocated: 1,
          };
        }),
      ),
    });

    const scrapOrder = await prisma.workOrder.create({
      data: {
        tenantId: owner.tenantId,
        productId: product.id,
        number: `${marker}_SCRAP`,
        status: "IN_PROGRESS",
        plannedQty: 100,
        producedQty: 90,
        scrapQty: 10,
        scrapCost: 250,
        scrapReason: "TEST",
        startDate: start,
      },
    });
    workOrderIds.push(scrapOrder.id);
    const cleanOrder = await prisma.workOrder.create({
      data: {
        tenantId: owner.tenantId,
        productId: product.id,
        number: `${marker}_CLEAN`,
        status: "COMPLETED",
        plannedQty: 100,
        producedQty: 100,
        scrapQty: 0,
        startDate: start,
        endDate: start,
      },
    });
    workOrderIds.push(cleanOrder.id);
    await prisma.workOrderOperation.create({
      data: {
        tenantId: owner.tenantId,
        workOrderId: scrapOrder.id,
        workCenterId: workCenterIds[2],
        name: `${marker} Operasyon`,
        stepOrder: 1,
        status: "IN_PROGRESS",
        plannedSetupTime: 60,
        plannedRunTime: 6,
        actualSetupTime: 120,
        actualRunTime: 9,
      },
    });
    const sevenDayEnd = new Date(start); sevenDayEnd.setUTCDate(sevenDayEnd.getUTCDate() + 6); sevenDayEnd.setUTCHours(23, 59, 59, 999);
    const justOutsideSevenDays = new Date(sevenDayEnd.getTime() + 1);
    const boundaryOrders = await Promise.all([
      prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: product.id, number: `${marker}_BOUNDARY_START`, status: "COMPLETED", plannedQty: 1, producedQty: 1, scrapQty: 1, startDate: start, endDate: start, updatedAt: new Date("2000-01-01T00:00:00Z") } }),
      prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: product.id, number: `${marker}_BOUNDARY_END`, status: "COMPLETED", plannedQty: 1, producedQty: 1, scrapQty: 1, startDate: sevenDayEnd, endDate: sevenDayEnd, updatedAt: new Date("2000-01-01T00:00:00Z") } }),
      prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: product.id, number: `${marker}_BOUNDARY_OUTSIDE`, status: "COMPLETED", plannedQty: 1, producedQty: 1, scrapQty: 9, startDate: justOutsideSevenDays, endDate: justOutsideSevenDays, updatedAt: new Date("2000-01-01T00:00:00Z") } }),
    ]);
    workOrderIds.push(...boundaryOrders.map((row) => row.id));

    await prisma.workOrder.createMany({
      data: Array.from({ length: 125 }, (_, index) => ({
        tenantId: owner.tenantId,
        productId: product.id,
        number: `${marker}_BULK_${String(index).padStart(3, "0")}`,
        status: "COMPLETED" as const,
        plannedQty: 10,
        producedQty: index < 100 ? 10 : 8,
        scrapQty: index < 100 ? 0 : 2,
        scrapCost: index < 100 ? 0 : 30,
        scrapReason: index < 100 ? null : "TAIL_SCRAP",
        startDate: start,
        endDate: start,
        updatedAt: new Date(start.getTime() + index * 1000),
      })),
    });
    const bulkOrders = await prisma.workOrder.findMany({
      where: { tenantId: owner.tenantId, number: { startsWith: `${marker}_BULK_` } },
      select: { id: true, number: true },
    });
    workOrderIds.push(...bulkOrders.map((row) => row.id));
    const tailOrder = bulkOrders.find((row) => row.number.endsWith("_124"))!;
    await prisma.workOrderOperation.create({
      data: {
        tenantId: owner.tenantId,
        workOrderId: tailOrder.id,
        workCenterId: workCenterIds[1],
        name: `${marker} Tail Operasyon`,
        stepOrder: 1,
        status: "COMPLETED",
        plannedSetupTime: 0,
        plannedRunTime: 6,
        actualSetupTime: 0,
        actualRunTime: 12,
      },
    });

    const response = await api(owner, "?horizonDays=30");
    assert.equal(response.status, 200);
    const data = response.body.data;
    assert.equal(data.summary.horizonDays, 30);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 29);
    end.setUTCHours(23, 59, 59, 999);
    const includedOrders = await prisma.workOrder.findMany({
      where: {
        tenantId: owner.tenantId,
        deletedAt: null,
        OR: [
          { status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } },
          { updatedAt: { gte: start } },
          { startDate: { lte: end }, endDate: null },
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        plannedQty: true,
        producedQty: true,
        scrapQty: true,
        operations: {
          select: {
            plannedSetupTime: true, plannedRunTime: true,
            actualSetupTime: true, actualRunTime: true,
            actualStartAt: true, actualEndAt: true,
            workCenter: { select: { laborRate: true, overheadRate: true } },
          },
        },
      },
    });
    const producedTotal = includedOrders.reduce(
      (sum, row) => sum + Number(row.producedQty),
      0,
    );
    const scrapTotal = includedOrders.reduce(
      (sum, row) => sum + Number(row.scrapQty ?? 0),
      0,
    );
    const expectedScrapRate =
      Math.round((scrapTotal / (producedTotal + scrapTotal)) * 1000) / 10;
    assert.equal(data.summary.scrapRatePct, expectedScrapRate);
    assert.equal(includedOrders.length > 100, true);
    const firstHundred = includedOrders.slice(0, 100);
    const limitedProduced = firstHundred.reduce((sum, row) => sum + Number(row.producedQty), 0);
    const limitedScrap = firstHundred.reduce((sum, row) => sum + Number(row.scrapQty ?? 0), 0);
    const limitedRate = Math.round((limitedScrap / (limitedProduced + limitedScrap)) * 1000) / 10;
    assert.notEqual(expectedScrapRate, limitedRate);
    assert.equal(data.summary.qualityRiskCount >= 26, true);
    const capacity = data.capacityPlan.find(
      (row: any) => row.workCenter.id === workCenterIds[2],
    );
    assert.equal(capacity.capacityHours, 240);
    assert.equal(capacity.allocatedHours, 30);
    assert.equal(capacity.queuedHours, 11);
    assert.equal(capacity.utilizationPct, 17.1);
    const cost = data.operationCosts.find(
      (row: any) => row.workOrderId === scrapOrder.id,
    );
    assert.equal(cost.plannedHours, 11);
    assert.equal(cost.actualHours, 17);
    assert.equal(cost.laborCost, 170);
    assert.equal(cost.overheadCost, 85);
    assert.equal(cost.totalCost, 255);
    assert.equal(cost.variancePct, 54.5);
    const tailCost = data.operationCosts.find((row: any) => row.workOrderId === tailOrder.id);
    assert.equal(tailCost.plannedHours, 1);
    assert.equal(tailCost.actualHours, 2);
    assert.equal(tailCost.totalCost, 30);
    assert.equal(tailCost.variancePct, 100);
    let plannedCostTotal = 0;
    let actualCostTotal = 0;
    for (const order of includedOrders) for (const operation of order.operations) {
      const quantity = Number(order.plannedQty);
      const plannedHours = (Number(operation.plannedSetupTime ?? 0) + Number(operation.plannedRunTime ?? 0) * quantity) / 60;
      const explicitMinutes = Number(operation.actualSetupTime ?? 0) + Number(operation.actualRunTime ?? 0) * quantity;
      const elapsedHours = operation.actualStartAt && operation.actualEndAt ? Math.max(0, (operation.actualEndAt.getTime() - operation.actualStartAt.getTime()) / 3_600_000) : 0;
      const actualHours = explicitMinutes > 0 ? explicitMinutes / 60 : elapsedHours > 0 ? elapsedHours : plannedHours;
      const rate = Number(operation.workCenter.laborRate ?? 0) + Number(operation.workCenter.overheadRate ?? 0);
      plannedCostTotal += plannedHours * rate;
      actualCostTotal += actualHours * rate;
    }
    const expectedCostVariance = Math.round(((actualCostTotal - plannedCostTotal) / plannedCostTotal) * 1000) / 10;
    assert.equal(data.summary.operationCostVariancePct, expectedCostVariance);
    assert.equal(data.scrapAnalysis.length <= 20, true);
    assert.equal(data.qualitySignals.length <= 20, true);
    assert.equal(data.shiftPlan.length <= 60, true);

    for (const horizon of [7, 30, 180]) {
      const horizonResponse = await api(owner, `?horizonDays=${horizon}`);
      assert.equal(horizonResponse.status, 200);
      const horizonEnd = new Date(start); horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizon - 1); horizonEnd.setUTCHours(23, 59, 59, 999);
      const rows = await prisma.workOrder.findMany({ where: { tenantId: owner.tenantId, deletedAt: null, OR: [{ status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } }, { updatedAt: { gte: start } }, { startDate: { lte: horizonEnd }, endDate: null }, { startDate: { lte: horizonEnd }, endDate: { gte: start } }] }, select: { id: true, producedQty: true, scrapQty: true } });
      const produced = rows.reduce((sum, row) => sum + Number(row.producedQty), 0);
      const scrapQuantity = rows.reduce((sum, row) => sum + Number(row.scrapQty ?? 0), 0);
      const rate = Math.round((scrapQuantity / (produced + scrapQuantity)) * 1000) / 10;
      assert.equal(horizonResponse.body.data.summary.scrapRatePct, rate);
      if (horizon === 7) {
        assert.equal(rows.some((row) => row.id === boundaryOrders[0].id), true);
        assert.equal(rows.some((row) => row.id === boundaryOrders[1].id), true);
        assert.equal(rows.some((row) => row.id === boundaryOrders[2].id), false);
      }
    }

    const foreignResponse = await api(foreign, "?horizonDays=30");
    assert.equal(foreignResponse.status, 200);
    assert.equal(
      foreignResponse.body.data.capacityPlan.some((row: any) =>
        workCenterIds.includes(row.workCenter.id),
      ),
      false,
    );
    assert.equal(
      foreignResponse.body.data.scrapAnalysis.some((row: any) =>
        workOrderIds.includes(row.workOrderId),
      ),
      false,
    );
    assert.equal(
      foreignResponse.body.data.operationCosts.some((row: any) => workOrderIds.includes(row.workOrderId)),
      false,
    );
    console.log(
      "PASS advanced production assurance: auth, validation, tenant isolation, capacity, scrap, quality and operation-cost mathematics",
    );
  } finally {
    await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
    await prisma.workCenter.deleteMany({
      where: { id: { in: workCenterIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
