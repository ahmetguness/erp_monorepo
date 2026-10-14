import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
type Session = { token: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200, `${email}/${tenantSlug} login failed`);
  const body = (await response.json()) as {
    data: { token: string; tenant: { id: string } };
  };
  return { token: body.data.token, tenantId: body.data.tenant.id };
}

async function get(session: Session | null, path: string) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      origin,
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const amount = (value: unknown, rate: unknown) =>
  Number(value ?? 0) * Number(rate ?? 1);
const finite = (value: unknown) =>
  assert.ok(Number.isFinite(Number(value)), `non-finite metric: ${value}`);

async function verifyOwner(session: Session) {
  const [executive, production, procurement] = await Promise.all([
    get(session, "/api/dashboard/basic/executive"),
    get(session, "/api/dashboard/basic/production"),
    get(session, "/api/dashboard/basic/procurement"),
  ]);
  for (const result of [executive, production, procurement])
    assert.equal(result.status, 200);

  const openPurchaseStatuses = ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] as const;
  const purchaseRows = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: session.tenantId,
      deletedAt: null,
      status: { in: [...openPurchaseStatuses] },
    },
    select: { totalGross: true, exchangeRate: true },
  });
  assert.equal(procurement.body.data.openOrders.count, purchaseRows.length);
  assert.equal(
    procurement.body.data.openOrders.amount,
    Math.round(
      purchaseRows.reduce(
        (sum, row) => sum + amount(row.totalGross, row.exchangeRate),
        0,
      ) * 100,
    ) / 100,
  );

  const openWorkStatuses = ["PLANNED", "IN_PROGRESS", "PAUSED"] as const;
  const workRows = await prisma.workOrder.findMany({
    where: {
      tenantId: session.tenantId,
      deletedAt: null,
      status: { in: [...openWorkStatuses] },
    },
    select: { status: true, plannedQty: true, producedQty: true },
  });
  assert.equal(
    Object.values(production.body.data.workOrders.openByStatus).reduce(
      (sum: number, value) => sum + Number(value),
      0,
    ),
    workRows.length,
  );
  assert.equal(
    production.body.data.output.planned,
    Math.round(
      workRows.reduce((sum, row) => sum + Number(row.plannedQty), 0) * 100,
    ) / 100,
  );
  assert.equal(
    production.body.data.output.produced,
    Math.round(
      workRows.reduce((sum, row) => sum + Number(row.producedQty), 0) * 100,
    ) / 100,
  );

  [
    executive.body.data.sales.today,
    executive.body.data.sales.currentMonth,
    executive.body.data.receivables.total,
    executive.body.data.cash.total,
    executive.body.data.salesOrders.openAmount,
    production.body.data.scrap.rate,
    procurement.body.data.openOrders.amount,
  ].forEach(finite);
  assert.equal(executive.body.data.sales.trend.length, 6);
  assert.deepEqual(
    [
      ...executive.body.data.sales.trend.map(
        (row: { period: string }) => row.period,
      ),
    ].sort(),
    executive.body.data.sales.trend.map(
      (row: { period: string }) => row.period,
    ),
  );
  return {
    executive: executive.body.data,
    production: production.body.data,
    procurement: procurement.body.data,
  };
}

async function main() {
  assert.equal((await get(null, "/api/dashboard/basic/executive")).status, 401);
  const tenantA = await login("admin@axondemo.com", "axon-demo");
  const a = await verifyOwner(tenantA);
  const restricted = await login("muhasebe@axondemo.com", "axon-demo");
  const tenantB = await login("starter@axondemo.com", "axon-starter-demo");
  const b = await verifyOwner(tenantB);
  assert.notEqual(tenantA.tenantId, tenantB.tenantId);
  assert.equal(
    (await get(restricted, "/api/dashboard/basic/production")).status,
    403,
  );
  assert.equal(
    (await get(restricted, "/api/dashboard/basic/procurement")).status,
    403,
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      unauthenticated: 401,
      restrictedProduction: 403,
      restrictedProcurement: 403,
      tenantIsolation: true,
      tenantA: {
        openPO: a.procurement.openOrders.count,
        openWO: Object.values(a.production.workOrders.openByStatus).reduce(
          (s: number, v) => s + Number(v),
          0,
        ),
      },
      tenantB: {
        openPO: b.procurement.openOrders.count,
        openWO: Object.values(b.production.workOrders.openByStatus).reduce(
          (s: number, v) => s + Number(v),
          0,
        ),
      },
    }),
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
