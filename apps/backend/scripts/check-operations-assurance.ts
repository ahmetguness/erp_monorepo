import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_OPERATIONS_${Date.now()}`;
type Session = { cookie: string };

async function request(
  session: Session | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
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

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const reader = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const makeTenant = async (suffix: string) => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-${suffix}`,
        companyName: `${marker}_${suffix}`,
        email: `${suffix}-${marker}@example.test`,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        modules: [],
      },
    });
    await prisma.tenantUser.create({
      data: { tenantId: tenant.id, userId: owner.id, isOwner: true },
    });
    return tenant;
  };
  const tenantA = await makeTenant("a");
  const tenantB = await makeTenant("b");
  try {
    const readRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ`,
        permissions: { create: { module: "operations", action: "READ" } },
      },
    });
    await prisma.tenantUser.create({
      data: { tenantId: tenantA.id, userId: reader.id, roleId: readRole.id },
    });
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenantA.id,
        type: "CUSTOMER",
        name: marker,
        code: marker,
      },
    });
    const order = await prisma.salesOrder.create({
      data: {
        tenantId: tenantA.id,
        contactId: contact.id,
        number: `${marker}_SO`,
        date: new Date(),
        status: "CONFIRMED",
        totalGross: 120,
      },
    });
    await prisma.salesOrderHistory.create({
      data: {
        tenantId: tenantA.id,
        orderId: order.id,
        fromStatus: "DRAFT",
        toStatus: "CONFIRMED",
        notes: marker,
      },
    });
    const draftInvoice = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: contact.id,
        salesOrderId: order.id,
        type: "SALES",
        status: "DRAFT",
        number: `${marker}_INV_DRAFT`,
        date: new Date(),
        totalNet: 100,
        totalTax: 20,
        totalGross: 120,
      },
    });
    const paidInvoice = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: contact.id,
        type: "SALES",
        status: "PAID",
        number: `${marker}_INV_PAID`,
        date: new Date(),
        totalGross: 50,
      },
    });
    const deliveredOrder = await prisma.salesOrder.create({
      data: {
        tenantId: tenantA.id,
        contactId: contact.id,
        number: `${marker}_SO_DELIVERED`,
        date: new Date(),
        status: "DELIVERED",
      },
    });
    const unit = await prisma.unit.create({
      data: { tenantId: tenantA.id, name: marker, code: marker },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unit.id,
        code: marker,
        name: marker,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenantA.id, code: marker, name: marker },
    });

    const recent = new Date();
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const succeeded = await prisma.automationExecution.create({
      data: {
        tenantId: tenantA.id,
        status: "SUCCEEDED",
        action: "CREATE_NOTIFICATION",
        completedAt: recent,
      },
    });
    await prisma.automationExecution.create({
      data: {
        tenantId: tenantA.id,
        status: "FAILED",
        action: "CREATE_NOTIFICATION",
        error: marker,
      },
    });
    await prisma.automationExecution.create({
      data: {
        tenantId: tenantA.id,
        status: "FAILED",
        action: "CREATE_NOTIFICATION",
        error: marker,
        createdAt: old,
        startedAt: old,
      },
    });
    await prisma.automationExecution.create({
      data: {
        tenantId: tenantA.id,
        status: "RUNNING",
        action: "CREATE_NOTIFICATION",
      },
    });
    await prisma.domainEventOutbox.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}.recent`,
        source: "assurance",
        idempotencyKey: `${marker}-recent`,
        entityType: "OTHER",
        entityId: marker,
        payload: {},
        context: {},
        status: "FAILED",
        lastError: marker,
      },
    });
    await prisma.domainEventOutbox.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}.old`,
        source: "assurance",
        idempotencyKey: `${marker}-old`,
        entityType: "OTHER",
        entityId: marker,
        payload: {},
        context: {},
        status: "FAILED",
        lastError: marker,
        createdAt: old,
        updatedAt: old,
      },
    });
    await prisma.domainEventOutbox.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}.dead`,
        source: "assurance",
        idempotencyKey: `${marker}-dead`,
        entityType: "OTHER",
        entityId: marker,
        payload: {},
        context: {},
        status: "DEAD_LETTER",
        lastError: marker,
      },
    });

    const ownerA = await login(owner.email, tenantA.slug);
    const ownerB = await login(owner.email, tenantB.slug);
    const readerA = await login(reader.email, tenantA.slug);
    assert.equal(
      (await request(null, "GET", "/api/operations/health")).status,
      401,
    );
    assert.equal(
      (await request(readerA, "GET", "/api/operations/health")).status,
      200,
    );
    assert.equal(
      (
        await request(readerA, "POST", "/api/integrity/scan", {
          autoFix: false,
        })
      ).status,
      403,
    );

    const health = await request(ownerA, "GET", "/api/operations/health");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body.data.automationHealth, {
      totalExecutions: 4,
      succeededCount: 1,
      failedCount: 2,
      successRatePct: 33,
    });
    assert.equal(health.body.data.domainEvents.totalEvents, 3);
    assert.equal(health.body.data.domainEvents.failedCount, 2);
    assert.equal(health.body.data.domainEvents.deadLetterCount, 1);
    assert.equal(health.body.data.apiFailures.recentErrorCount, 2);
    assert.equal(
      health.body.data.accountingPostingErrors.unpostedInvoiceCount,
      1,
    );
    assert.equal(
      (await request(ownerB, "GET", "/api/operations/health")).body.data
        .domainEvents.totalEvents,
      0,
    );

    const orderTimeline = await request(
      ownerA,
      "GET",
      `/api/operations/timeline/SO/${encodeURIComponent(order.number)}`,
    );
    assert.equal(orderTimeline.status, 200);
    assert.equal(orderTimeline.body.data.entityCode, order.number);
    assert.equal(orderTimeline.body.data.events.length, 3);
    assert.ok(
      new Date(orderTimeline.body.data.events[0].timestamp) <=
        new Date(orderTimeline.body.data.events[1].timestamp),
    );
    const invoiceTimeline = await request(
      ownerA,
      "GET",
      `/api/operations/timeline/INVOICE/${draftInvoice.id}`,
    );
    assert.equal(invoiceTimeline.status, 200);
    assert.equal(invoiceTimeline.body.data.entityCode, draftInvoice.number);
    assert.equal(
      (await request(ownerA, "GET", "/api/operations/timeline/PRODUCT/x"))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          ownerA,
          "GET",
          "/api/operations/timeline/INVOICE/not-found",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          ownerB,
          "GET",
          `/api/operations/timeline/INVOICE/${draftInvoice.id}`,
        )
      ).status,
      404,
    );

    for (const body of [
      null,
      {},
      { autoFix: "yes" },
      { autoFix: false, extra: true },
    ]) {
      assert.equal(
        (await request(ownerA, "POST", "/api/integrity/scan", body)).status,
        body && Object.keys(body).length === 0 ? 200 : 400,
      );
    }
    const scan = await request(ownerA, "POST", "/api/integrity/scan", {
      autoFix: false,
    });
    assert.equal(scan.status, 200);
    assert.equal(scan.body.data.totalRulesChecked, 6);
    const anomalyId = `anomaly-rule1-${paidInvoice.id}`;
    assert.ok(
      scan.body.data.anomalies.some(
        (item: { id: string }) => item.id === anomalyId,
      ),
    );
    assert.equal(
      (
        await request(
          ownerA,
          "POST",
          "/api/integrity/exceptions/fake/resolve",
          { notes: "x" },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          ownerB,
          "POST",
          `/api/integrity/exceptions/${anomalyId}/resolve`,
          { notes: "x" },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          ownerA,
          "POST",
          `/api/integrity/exceptions/${anomalyId}/resolve`,
          { notes: 1 },
        )
      ).status,
      400,
    );
    const resolved = await request(
      ownerA,
      "POST",
      `/api/integrity/exceptions/${anomalyId}/resolve`,
      { notes: `${marker} çözüldü` },
    );
    assert.equal(resolved.status, 200);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: tenantA.id,
          module: "integrity",
          entityId: anomalyId,
        },
      }),
      1,
    );
    const reservation = await prisma.inventoryReservation.create({
      data: {
        tenantId: tenantA.id,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: 2,
        refType: "SALES_ORDER",
        refId: deliveredOrder.id,
      },
    });
    const afterResolve = await request(ownerA, "POST", "/api/integrity/scan", {
      autoFix: false,
    });
    assert.ok(
      !afterResolve.body.data.anomalies.some(
        (item: { id: string }) => item.id === anomalyId,
      ),
    );
    assert.ok(
      afterResolve.body.data.anomalies.some(
        (item: { id: string }) =>
          item.id === `anomaly-rule5-${deliveredOrder.id}`,
      ),
    );
    const autoFixed = await request(ownerA, "POST", "/api/integrity/scan", {
      autoFix: true,
    });
    assert.equal(autoFixed.status, 200);
    assert.equal(autoFixed.body.data.autoFixedCount, 1);
    assert.ok(
      (
        await prisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).releasedAt,
    );
    const idempotentScan = await request(
      ownerA,
      "POST",
      "/api/integrity/scan",
      { autoFix: true },
    );
    assert.equal(idempotentScan.body.data.autoFixedCount, 0);

    const scorecard = await request(
      ownerA,
      "GET",
      "/api/automation-rules/scorecard?days=30",
    );
    assert.equal(scorecard.status, 200);
    assert.equal(scorecard.body.data.totals.executions, 4);
    assert.equal(
      (await request(ownerA, "GET", "/api/automation-rules/scorecard?days=31"))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          ownerB,
          "POST",
          `/api/automation-rules/scorecard/feedback/${succeeded.id}`,
          { outcome: "ACCEPTED" },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          ownerA,
          "POST",
          `/api/automation-rules/scorecard/feedback/${succeeded.id}`,
          { outcome: "INVALID" },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          ownerA,
          "POST",
          `/api/automation-rules/scorecard/feedback/${succeeded.id}`,
          { outcome: "ACCEPTED", reason: marker },
        )
      ).status,
      200,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: tenantA.id,
          module: "automation-scorecard",
          entityId: succeeded.id,
        },
      }),
      1,
    );

    console.log(
      "Operations assurance PASS: health math, 24h window, timelines, RBAC, tenant isolation, integrity resolution and scorecard verified.",
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
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
