import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_WORKFLOW_${Date.now()}`;
type Session = { cookie: string };

async function api(
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

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug: slug }),
  });
  assert.equal(response.status, 200, `${email} login`);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const reader = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const foreignUser = await prisma.user.findUniqueOrThrow({
    where: { email: "pro@axondemo.com" },
  });
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A`,
      email: `${marker}-a@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: [],
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: [],
    },
  });
  try {
    const readRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ`,
        permissions: { create: { module: "settings", action: "READ" } },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: reader.id, roleId: readRole.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      ],
    });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);
    const readOnly = await login(reader.email, tenantA.slug);

    assert.equal((await api(null, "GET", "/api/automation-rules")).status, 401);
    assert.equal(
      (await api(readOnly, "GET", "/api/automation-rules")).status,
      200,
    );
    assert.equal(
      (await api(readOnly, "POST", "/api/automation-rules", {})).status,
      403,
    );
    assert.equal(
      (await api(a, "GET", "/api/automation-rules/scheduler/runs?limit=x"))
        .status,
      400,
    );
    assert.equal(
      (await api(a, "GET", "/api/automation-rules/scheduler/runs?limit=101"))
        .status,
      400,
    );
    assert.equal(
      (await api(a, "GET", "/api/automation-rules/scheduler/jobs")).status,
      200,
    );
    assert.equal(
      (await api(a, "GET", "/api/automation-rules/governance/policy")).status,
      200,
    );
    assert.equal(
      (
        await api(a, "PUT", "/api/automation-rules/governance/policy", {
          approvalThreshold: -1,
          minimumAutomaticConfidence: 2,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "PUT", "/api/automation-rules/governance/policy", {
          approvalThreshold: 250000,
          minimumAutomaticConfidence: 0.85,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/automation-rules/assistant/preview", {
          prompt: " ",
        })
      ).status,
      400,
    );
    assert.equal(
      (await api(a, "GET", "/api/automation-rules/scorecard?days=8")).status,
      400,
    );
    assert.equal(
      (await api(a, "GET", "/api/automation-rules/scorecard?days=7")).status,
      200,
    );
    for (const body of [
      {},
      {
        name: " ",
        module: "workflow",
        trigger: "LOW_STOCK",
        action: "CREATE_TASK",
      },
      {
        name: `${marker}_BAD_MODULE`,
        module: "admin",
        trigger: "LOW_STOCK",
        action: "CREATE_TASK",
      },
      {
        name: `${marker}_BAD_AMOUNT`,
        module: "invoicing",
        trigger: "HIGH_VALUE_INVOICE",
        action: "CREATE_TASK",
        conditions: { minAmount: -1 },
      },
      {
        name: `${marker}_NAN`,
        module: "invoicing",
        trigger: "HIGH_VALUE_INVOICE",
        action: "CREATE_TASK",
        conditions: { minAmount: "NaN" },
      },
      {
        name: `${marker}_FOREIGN_USER`,
        module: "workflow",
        trigger: "LOW_STOCK",
        action: "CREATE_NOTIFICATION",
        actionConfig: { assignedToId: foreignUser.id },
      },
    ])
      assert.equal(
        (await api(a, "POST", "/api/automation-rules", body)).status,
        400,
      );

    const unit = await prisma.unit.create({
      data: {
        tenantId: tenantA.id,
        code: `${marker}_U`,
        name: `${marker} Birim`,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenantA.id,
        code: `${marker}_W`,
        name: `${marker} Depo`,
      },
    });
    const location = await prisma.location.create({
      data: {
        tenantId: tenantA.id,
        warehouseId: warehouse.id,
        code: `${marker}_L`,
        name: `${marker} Raf`,
      },
    });
    const lowProduct = await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unit.id,
        code: `${marker}_LOW`,
        name: `${marker} Dusuk Stok`,
        minStockLevel: 20,
        salesPrice: 100,
        purchasePrice: 110,
      },
    });
    await prisma.stockLevel.create({
      data: {
        tenantId: tenantA.id,
        productId: lowProduct.id,
        warehouseId: warehouse.id,
        locationId: location.id,
        quantity: 5,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenantA.id,
        type: "CUSTOMER",
        name: `${marker} Cari`,
        code: `${marker}_C`,
      },
    });
    const oldDue = new Date(Date.now() - 10 * 86_400_000);
    const nearDue = new Date(Date.now() - 3 * 86_400_000);
    const invoice150 = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: contact.id,
        type: "SALES",
        status: "SENT",
        number: `${marker}_150`,
        date: oldDue,
        dueDate: oldDue,
        totalGross: 150_000,
        totalNet: 150_000,
        totalTax: 0,
      },
    });
    const invoice300 = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: contact.id,
        type: "SALES",
        status: "SENT",
        number: `${marker}_300`,
        date: nearDue,
        dueDate: nearDue,
        totalGross: 300_000,
        totalNet: 300_000,
        totalTax: 0,
      },
    });

    const create = await api(a, "POST", "/api/automation-rules", {
      name: `${marker}_HIGH`,
      module: "invoicing",
      trigger: "HIGH_VALUE_INVOICE",
      action: "CREATE_TASK",
      conditions: { minAmount: 250_000 },
      actionConfig: {},
      isActive: true,
    });
    assert.equal(create.status, 201);
    const highRuleId = create.body.data.id as string;
    assert.equal(
      (
        await api(a, "POST", "/api/automation-rules", {
          name: `${marker}_HIGH`,
          module: "invoicing",
          trigger: "HIGH_VALUE_INVOICE",
          action: "CREATE_TASK",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api(b, "PATCH", `/api/automation-rules/${highRuleId}`, {
          name: "hijack",
        })
      ).status,
      404,
    );
    const runHigh = await api(
      a,
      "POST",
      `/api/automation-rules/${highRuleId}/run`,
    );
    assert.equal(runHigh.status, 200);
    assert.equal(
      runHigh.body.data.matched,
      1,
      "250k threshold must exclude 150k invoice",
    );
    assert.equal(runHigh.body.data.tasksCreated, 1);
    assert.equal(
      await prisma.task.count({
        where: {
          tenantId: tenantA.id,
          source: `automation:${highRuleId}:high_value_invoice:${invoice300.id}`,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.task.count({
        where: {
          tenantId: tenantA.id,
          entityId: invoice150.id,
          source: { startsWith: `automation:${highRuleId}:` },
        },
      }),
      0,
    );
    const rerunHigh = await api(
      a,
      "POST",
      `/api/automation-rules/${highRuleId}/run`,
    );
    assert.equal(rerunHigh.status, 200);
    assert.equal(
      await prisma.task.count({
        where: {
          tenantId: tenantA.id,
          source: { startsWith: `automation:${highRuleId}:` },
        },
      }),
      1,
    );

    const notificationRule = await api(a, "POST", "/api/automation-rules", {
      name: `${marker}_OVERDUE`,
      module: "invoicing",
      trigger: "OVERDUE_INVOICE",
      action: "CREATE_NOTIFICATION",
      conditions: { overdueDays: 7 },
      actionConfig: { assignedToId: owner.id },
      isActive: true,
    });
    assert.equal(notificationRule.status, 201);
    const notificationRuleId = notificationRule.body.data.id as string;
    const concurrent = await Promise.all([
      api(a, "POST", `/api/automation-rules/${notificationRuleId}/run`),
      api(a, "POST", `/api/automation-rules/${notificationRuleId}/run`),
    ]);
    assert.equal(
      concurrent.every((item) => item.status === 200),
      true,
      JSON.stringify(concurrent),
    );
    assert.equal(
      await prisma.notification.count({
        where: {
          tenantId: tenantA.id,
          source: { startsWith: `automation:${notificationRuleId}:` },
        },
      }),
      1,
      "concurrent runs must not duplicate notification",
    );
    const notification = await prisma.notification.findFirstOrThrow({
      where: {
        tenantId: tenantA.id,
        source: { startsWith: `automation:${notificationRuleId}:` },
      },
    });
    assert.equal(
      notification.entityId,
      invoice150.id,
      "7 day condition must exclude 3 day overdue invoice",
    );
    assert.equal(notification.userId, owner.id);
    const activeResult = await api(
      a,
      "POST",
      "/api/automation-rules/run-active",
    );
    assert.equal(activeResult.status, 200);
    assert.ok(activeResult.body.data.matched >= 2);

    assert.equal(
      (
        await api(a, "PATCH", `/api/automation-rules/${highRuleId}`, {
          name: `${marker}_HIGH_UPDATED`,
          isActive: false,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api(a, "POST", `/api/automation-rules/${highRuleId}/run`)).status,
      409,
    );
    const listed = await api(a, "GET", "/api/automation-rules");
    assert.equal(listed.status, 200);
    assert.equal(
      listed.body.data.some(
        (rule: { id: string; name: string }) =>
          rule.id === highRuleId && rule.name.endsWith("_UPDATED"),
      ),
      true,
    );

    const executionList = await api(
      a,
      "GET",
      "/api/automation-rules/executions",
    );
    assert.equal(executionList.status, 200);
    assert.equal(
      executionList.body.data.some(
        (execution: { ruleId: string; status: string }) =>
          execution.ruleId === highRuleId && execution.status === "SUCCEEDED",
      ),
      true,
    );
    assert.equal(
      (await api(b, "GET", "/api/automation-rules/executions")).body.data.some(
        (execution: { ruleId: string }) => execution.ruleId === highRuleId,
      ),
      false,
    );
    const executionId = executionList.body.data.find(
      (execution: { ruleId: string }) => execution.ruleId === highRuleId,
    ).id as string;
    assert.equal(
      (
        await api(
          a,
          "POST",
          `/api/automation-rules/scorecard/feedback/${executionId}`,
          { outcome: "ACCEPTED", estimatedMinutesSaved: 5 },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await api(
          b,
          "POST",
          `/api/automation-rules/scorecard/feedback/${executionId}`,
          { outcome: "ACCEPTED" },
        )
      ).status,
      404,
    );

    const planned = await api(
      a,
      "POST",
      "/api/automation-rules/scheduler/run",
      { jobKey: "batch_expiration" },
    );
    assert.equal(planned.status, 200);
    assert.equal(planned.body.data.skipped, 1);
    assert.equal(
      await prisma.automationExecution.count({
        where: {
          tenantId: tenantA.id,
          entityId: "batch_expiration",
          status: "SUCCEEDED",
        },
      }),
      1,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/automation-rules/scheduler/run", {
          jobKey: "invalid",
        })
      ).status,
      400,
    );

    assert.equal(
      (await api(a, "DELETE", `/api/automation-rules/${highRuleId}`)).status,
      200,
    );
    const deleted = await prisma.automationRule.findUniqueOrThrow({
      where: { id: highRuleId },
    });
    assert.equal(deleted.isActive, false);
    assert.ok(deleted.deletedAt);
    assert.equal(
      (await api(a, "GET", "/api/automation-rules")).body.data.some(
        (rule: { id: string }) => rule.id === highRuleId,
      ),
      false,
    );
    assert.ok(
      (await prisma.auditLog.count({
        where: {
          tenantId: tenantA.id,
          entityId: highRuleId,
          module: "automation",
        },
      })) >= 2,
    );

    const indexRows = await prisma.$queryRaw<
      Array<{ indexdef: string }>
    >`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='notifications_tenantId_userId_source_key'`;
    assert.equal(indexRows.length, 1);
    console.log(
      JSON.stringify(
        {
          marker,
          highValueMatched: runHigh.body.data.matched,
          concurrentStatuses: concurrent.map((item) => item.status),
          notificationCount: 1,
          tenantIsolation: "PASS",
          schedulerPlanned: "PASS",
          softDelete: "PASS",
        },
        null,
        2,
      ),
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
