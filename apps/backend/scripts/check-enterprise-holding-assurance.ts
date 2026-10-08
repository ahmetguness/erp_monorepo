import assert from "node:assert/strict";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_HOLDING_${Date.now()}`;
type Session = { cookie: string };

async function api(session: Session | null, path = "/api/enterprise/holding") {
  const response = await fetch(`${base}${path}`, {
    headers: { origin, ...(session ? { cookie: session.cookie } : {}) },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug: slug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A`,
      email: `${marker}-a@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      city: "Istanbul",
      taxNumber: "1111111111",
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
    },
  });
  const tenantP = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-p`,
      companyName: `${marker}_P`,
      email: `${marker}-p@example.test`,
      plan: "PROFESSIONAL",
      status: "ACTIVE",
    },
  });
  try {
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: member.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
        { tenantId: tenantP.id, userId: owner.id, isOwner: true },
      ],
    });
    const [unitA, unitB] = await Promise.all([
      prisma.unit.create({
        data: { tenantId: tenantA.id, code: "AD", name: "Adet" },
      }),
      prisma.unit.create({
        data: { tenantId: tenantB.id, code: "AD", name: "Adet" },
      }),
    ]);
    const [contactA, contactB] = await Promise.all([
      prisma.contact.create({
        data: {
          tenantId: tenantA.id,
          type: "BOTH",
          name: `${marker}_A_CONTACT`,
        },
      }),
      prisma.contact.create({
        data: {
          tenantId: tenantB.id,
          type: "BOTH",
          name: `${marker}_B_CONTACT`,
        },
      }),
    ]);
    const [productA, productB] = await Promise.all([
      prisma.product.create({
        data: {
          tenantId: tenantA.id,
          unitId: unitA.id,
          code: `${marker}_PA`,
          name: "Holding Urun A",
          averageCost: 15,
        },
      }),
      prisma.product.create({
        data: {
          tenantId: tenantB.id,
          unitId: unitB.id,
          code: `${marker}_PB`,
          name: "Holding Urun B",
          averageCost: 99,
        },
      }),
    ]);
    const [warehouseA1, warehouseA2, inactiveA, warehouseB] = await Promise.all(
      [
        prisma.warehouse.create({
          data: {
            tenantId: tenantA.id,
            code: "A1",
            name: "Merkez",
            address: "Istanbul",
          },
        }),
        prisma.warehouse.create({
          data: {
            tenantId: tenantA.id,
            code: "A2",
            name: "Sube",
            address: "Ankara",
          },
        }),
        prisma.warehouse.create({
          data: {
            tenantId: tenantA.id,
            code: "AX",
            name: "Pasif",
            isActive: false,
          },
        }),
        prisma.warehouse.create({
          data: { tenantId: tenantB.id, code: "B1", name: "Foreign" },
        }),
      ],
    );
    const locations = await Promise.all(
      [warehouseA1, warehouseA2, inactiveA, warehouseB].map((warehouse) =>
        prisma.location.create({
          data: {
            tenantId: warehouse.tenantId,
            warehouseId: warehouse.id,
            code: "MAIN",
            name: "Main",
          },
        }),
      ),
    );
    await prisma.stockLevel.createMany({
      data: [
        {
          tenantId: tenantA.id,
          productId: productA.id,
          warehouseId: warehouseA1.id,
          locationId: locations[0]!.id,
          quantity: 10,
        },
        {
          tenantId: tenantA.id,
          productId: productA.id,
          warehouseId: warehouseA2.id,
          locationId: locations[1]!.id,
          quantity: 4,
        },
        {
          tenantId: tenantA.id,
          productId: productA.id,
          warehouseId: inactiveA.id,
          locationId: locations[2]!.id,
          quantity: 500,
        },
        {
          tenantId: tenantB.id,
          productId: productB.id,
          warehouseId: warehouseB.id,
          locationId: locations[3]!.id,
          quantity: 999,
        },
      ],
    });
    const invoices: Prisma.InvoiceCreateManyInput[] = Array.from(
      { length: 1001 },
      (_, index) => ({
        tenantId: tenantA.id,
        contactId: contactA.id,
        type: "SALES",
        number: `${marker}-S-${index}`,
        date: new Date(),
        totalGross: 10,
      }),
    );
    invoices.push({
      tenantId: tenantA.id,
      contactId: contactA.id,
      type: "PURCHASE" as const,
      number: `${marker}-P-1`,
      date: new Date(),
      totalGross: 40,
    });
    await prisma.invoice.createMany({ data: invoices });
    await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: contactA.id,
        type: "SALES",
        number: `${marker}-DELETED`,
        date: new Date(),
        totalGross: 99999,
        deletedAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: {
        tenantId: tenantB.id,
        contactId: contactB.id,
        type: "SALES",
        number: `${marker}-FOREIGN`,
        date: new Date(),
        totalGross: 777777,
      },
    });
    await prisma.payment.createMany({
      data: Array.from({ length: 1002 }, (_, index) => ({
        tenantId: tenantA.id,
        date: new Date(),
        amount: 3,
        direction: "RECEIVE",
        reference: `${marker}-${index}`,
      })),
    });
    await prisma.payment.createMany({
      data: [
        {
          tenantId: tenantA.id,
          date: new Date(),
          amount: 99999,
          direction: "PAY",
        },
        {
          tenantId: tenantA.id,
          date: new Date(),
          amount: 99999,
          direction: "RECEIVE",
          deletedAt: new Date(),
        },
        {
          tenantId: tenantB.id,
          date: new Date(),
          amount: 888888,
          direction: "RECEIVE",
        },
      ],
    });
    await prisma.stockMovement.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        tenantId: tenantA.id,
        productId: productA.id,
        type: "TRANSFER" as const,
        quantity: index + 1,
        fromWarehouseId: warehouseA1.id,
        toWarehouseId: warehouseA2.id,
        idempotencyKey: `${marker}-${index}`,
      })),
    });
    await prisma.stockMovement.create({
      data: {
        tenantId: tenantB.id,
        productId: productB.id,
        type: "TRANSFER",
        quantity: 999,
        fromWarehouseId: warehouseB.id,
        toWarehouseId: warehouseB.id,
      },
    });

    const a = await login(owner.email, tenantA.slug),
      b = await login(owner.email, tenantB.slug),
      p = await login(owner.email, tenantP.slug),
      unauthorized = await login(member.email, tenantA.slug);
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(unauthorized)).status, 403);
    assert.equal((await api(p)).status, 403);
    const response = await api(a);
    assert.equal(response.status, 200);
    const data = response.body.data;
    assert.equal(data.summary.companyCount, 1);
    assert.equal(data.summary.branchCount, 2);
    assert.equal(data.summary.warehouseCount, 2);
    assert.equal(data.summary.consolidatedSales, 10010);
    assert.equal(data.summary.consolidatedPurchases, 40);
    assert.equal(data.summary.consolidatedCollections, 3006);
    assert.equal(data.summary.consolidatedStockValue, 210);
    assert.equal(data.summary.intercompanyTransferCount, 25);
    assert.equal(data.intercompanyTransfers.length, 20);
    assert.equal(data.organization.length, 4);
    assert.deepEqual(
      data.organization.map((node: { type: string }) => node.type),
      ["holding", "company", "branch", "branch"],
    );
    assert.equal(data.organization[0].stockValue, 210);
    assert.equal(
      data.organization.some((node: { label: string }) =>
        node.label.includes("Foreign"),
      ),
      false,
    );
    const reportMap = new Map(
      data.consolidatedReports.map(
        (row: { key: string; amount: number; recordCount: number }) => [
          row.key,
          row,
        ],
      ),
    );
    assert.deepEqual(reportMap.get("sales"), {
      key: "sales",
      label: "Konsolide satis",
      amount: 10010,
      recordCount: 1001,
    });
    assert.deepEqual(reportMap.get("purchases"), {
      key: "purchases",
      label: "Konsolide satin alma",
      amount: 40,
      recordCount: 1,
    });
    assert.deepEqual(reportMap.get("collections"), {
      key: "collections",
      label: "Konsolide tahsilat",
      amount: 3006,
      recordCount: 1002,
    });
    assert.deepEqual(reportMap.get("stock"), {
      key: "stock",
      label: "Konsolide stok degeri",
      amount: 210,
      recordCount: 2,
    });
    assert.equal(JSON.stringify(data).includes(`${marker}_B`), false);
    assert.equal(JSON.stringify(data).includes("777777"), false);
    assert.equal(JSON.stringify(data).includes("888888"), false);
    const foreign = await api(b);
    assert.equal(foreign.status, 200);
    assert.equal(foreign.body.data.summary.consolidatedSales, 777777);
    assert.equal(foreign.body.data.summary.consolidatedCollections, 888888);
    assert.equal(foreign.body.data.summary.consolidatedStockValue, 98901);
    assert.equal(foreign.body.data.summary.intercompanyTransferCount, 1);
    console.log(
      JSON.stringify(
        {
          marker,
          over1000Sales: "PASS",
          over1000Collections: "PASS",
          transferCountVsPreview: { count: 25, preview: 20 },
          stockValue: 210,
          tenantIsolation: "PASS",
          permission: "PASS",
          planGuard: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id, tenantP.id] } },
    });
    assert.equal(
      await prisma.tenant.count({
        where: { companyName: { startsWith: marker } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
