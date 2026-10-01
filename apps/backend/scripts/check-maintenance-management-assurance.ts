import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_MAINTENANCE_${Date.now()}`;
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
  const response = await fetch(`${baseUrl}/api/service/maintenance${query}`, {
    headers: { origin, ...(session ? { cookie: session.cookie } : {}) },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}
function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const unauthorized = await login("muhasebe@axondemo.com", "axon-demo");
  const foreign = await login("pro@axondemo.com", "axon-pro-demo");
  let contactId = "",
    productId = "",
    warehouseId = "",
    locationId = "";
  const assetIds: string[] = [];
  const requestIds: string[] = [];
  try {
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(unauthorized)).status, 403);
    for (const value of ["abc", "13", "366", "30.5", "", "Infinity"])
      assert.equal(
        (await api(owner, `?horizonDays=${encodeURIComponent(value)}`)).status,
        400,
        value,
      );
    for (const value of [14, 30, 365]) {
      const result = await api(owner, `?horizonDays=${value}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.summary.horizonDays, value);
    }
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const contact = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "CUSTOMER",
        code: `${marker}_C`,
        name: `${marker} Musteri`,
      },
    });
    contactId = contact.id;
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: owner.tenantId, code: `${marker}_W`, name: marker },
    });
    warehouseId = warehouse.id;
    const location = await prisma.location.create({
      data: {
        tenantId: owner.tenantId,
        warehouseId,
        code: `${marker}_L`,
        name: marker,
      },
    });
    locationId = location.id;
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Parca`,
        minStockLevel: 5,
      },
    });
    productId = product.id;
    await prisma.stockLevel.create({
      data: {
        tenantId: owner.tenantId,
        productId,
        warehouseId,
        locationId,
        quantity: 3,
      },
    });
    const overdue = await prisma.customerAsset.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        name: `${marker} Geciken`,
        brand: "Marka",
        model: "Model",
        serialNo: `${marker}_S1`,
        purchaseDate: daysFromNow(-100),
      },
    });
    const dueSoon = await prisma.customerAsset.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        name: `${marker} Yaklasan`,
        serialNo: `${marker}_S2`,
        purchaseDate: daysFromNow(-70),
      },
    });
    const planned = await prisma.customerAsset.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        name: `${marker} Planli`,
        serialNo: `${marker}_S3`,
        purchaseDate: daysFromNow(0),
      },
    });
    assetIds.push(overdue.id, dueSoon.id, planned.id);
    const completed = await prisma.serviceRequest.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        customerAssetId: planned.id,
        number: `${marker}_DONE`,
        subject: marker,
        status: "COMPLETED",
        priority: "LOW",
        closedAt: daysFromNow(-170),
      },
    });
    requestIds.push(completed.id);
    const fault = await prisma.serviceRequest.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        customerAssetId: overdue.id,
        number: `${marker}_FAULT`,
        subject: `${marker} Kritik Ariza`,
        status: "WAITING_PARTS",
        priority: "CRITICAL",
        items: {
          create: [
            {
              tenantId: owner.tenantId,
              productId,
              description: "Dusuk stok parcasi",
              quantity: 4,
            },
            {
              tenantId: owner.tenantId,
              description: "Baglanmamis parca",
              quantity: 2,
            },
          ],
        },
      },
    });
    requestIds.push(fault.id);
    const noAsset = await prisma.serviceRequest.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        number: `${marker}_NO_ASSET`,
        subject: `${marker} Assetsiz`,
        status: "OPEN",
        priority: "HIGH",
      },
    });
    requestIds.push(noAsset.id);

    const result30 = await api(owner, "?horizonDays=30");
    assert.equal(result30.status, 200);
    const data = result30.body.data;
    const overduePlan = data.plans.find((row: any) => row.id === overdue.id);
    assert.equal(overduePlan.status, "overdue");
    assert.equal(overduePlan.openFaultCount, 1);
    assert.equal(
      overduePlan.recommendedAction,
      "Acik ariza ile birlikte bakim planla",
    );
    assert.equal(overduePlan.lastServiceAt, null);
    const duePlan = data.plans.find((row: any) => row.id === dueSoon.id);
    assert.equal(duePlan.status, "due_soon");
    assert.equal(
      Math.abs(
        (new Date(duePlan.nextDueAt).getTime() - daysFromNow(20).getTime()) /
          86_400_000,
      ) < 1,
      true,
    );
    const completedPlan = data.plans.find((row: any) => row.id === planned.id);
    assert.equal(completedPlan.status, "due_soon");
    assert.ok(completedPlan.lastServiceAt);
    assert.equal(
      Math.abs(
        (new Date(completedPlan.nextDueAt).getTime() -
          daysFromNow(10).getTime()) /
          86_400_000,
      ) < 1,
      true,
    );
    const faultRow = data.faults.find((row: any) => row.id === fault.id);
    assert.deepEqual(
      {
        status: faultRow.status,
        priority: faultRow.priority,
        count: faultRow.sparePartCount,
        href: faultRow.href,
      },
      {
        status: "waiting_parts",
        priority: "critical",
        count: 1,
        href: `/dashboard/service/requests/${fault.id}`,
      },
    );
    assert.equal(
      data.faults.find((row: any) => row.id === noAsset.id).asset,
      null,
    );
    const linked = data.spareParts.find(
      (row: any) =>
        row.serviceRequestId === fault.id && row.product?.id === productId,
    );
    assert.deepEqual(
      {
        quantity: linked.quantity,
        availableQty: linked.availableQty,
        risk: linked.risk,
      },
      { quantity: 4, availableQty: 3, risk: "low_stock" },
    );
    const unlinked = data.spareParts.find(
      (row: any) => row.serviceRequestId === fault.id && row.product === null,
    );
    assert.equal(unlinked.risk, "unlinked");
    assert.equal(unlinked.availableQty, null);
    assert.equal(data.summary.waitingPartFaultCount >= 1, true);
    assert.equal(data.summary.lowStockPartCount >= 1, true);
    assert.equal(data.summary.sparePartLinkCount >= 1, true);
    const result14 = await api(owner, "?horizonDays=14");
    assert.equal(result14.status, 200);
    assert.equal(
      result14.body.data.plans.some((row: any) => row.id === dueSoon.id),
      false,
    );
    assert.equal(
      result14.body.data.plans.some((row: any) => row.id === overdue.id),
      true,
    );
    assert.equal(
      result14.body.data.plans.some((row: any) => row.id === planned.id),
      true,
    );
    const foreignResult = await api(foreign, "?horizonDays=365");
    assert.equal(foreignResult.status, 200);
    const serialized = JSON.stringify(foreignResult.body);
    assert.equal(serialized.includes(marker), false);
    assert.equal(serialized.includes(productId), false);
    assert.equal(serialized.includes(contactId), false);
    assert.equal(data.plans.length <= 200, true);
    assert.equal(data.faults.length <= 100, true);
    console.log(
      "PASS maintenance management assurance: auth, strict validation, plan dates/statuses, completed service history, faults, spare stock risk, horizon, navigation and tenant isolation",
    );
  } finally {
    await prisma.inventoryReservation.deleteMany({
      where: {
        OR: [
          { refId: { in: requestIds } },
          ...(productId ? [{ productId }] : []),
        ],
      },
    });
    await prisma.serviceRequest.deleteMany({
      where: { id: { in: requestIds } },
    });
    await prisma.customerAsset.deleteMany({ where: { id: { in: assetIds } } });
    if (productId) {
      await prisma.stockLevel.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (contactId)
      await prisma.contact.deleteMany({ where: { id: contactId } });
    if (locationId)
      await prisma.location.deleteMany({ where: { id: locationId } });
    if (warehouseId)
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    assert.equal(
      await prisma.customerAsset.count({
        where: { name: { startsWith: marker } },
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
