import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_AGENT_COMMAND_${Date.now()}`;
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

async function login(
  email: string,
  password: string,
  tenantSlug: string,
): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password, tenantSlug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const operator = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const createTenant = async (suffix: string) => {
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

  const tenantA = await createTenant("a");
  const tenantB = await createTenant("b");
  try {
    const role = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_OPERATOR`,
        permissions: {
          create: [
            { module: "settings", action: "READ" },
            { module: "settings", action: "UPDATE" },
          ],
        },
      },
    });
    await prisma.tenantUser.create({
      data: { tenantId: tenantA.id, userId: operator.id, roleId: role.id },
    });

    const ownerA = await login(owner.email, "demo1234", tenantA.slug);
    const ownerB = await login(owner.email, "demo1234", tenantB.slug);
    const operatorA = await login(operator.email, "demo1234", tenantA.slug);

    assert.equal(
      (await request(null, "GET", "/api/agent-command/workflow-suggestions"))
        .status,
      401,
    );
    assert.equal(
      (
        await request(
          operatorA,
          "GET",
          "/api/agent-command/workflow-suggestions",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          operatorA,
          "POST",
          "/api/agent-command/adopt-suggestion",
          { suggestionId: "SUGG-001" },
        )
      ).status,
      403,
    );

    const invalidPrompts = [
      null,
      {},
      { prompt: "" },
      { prompt: "   " },
      { prompt: "x".repeat(2001) },
      { prompt: "ok", extra: true },
    ];
    for (const body of invalidPrompts) {
      assert.equal(
        (await request(ownerA, "POST", "/api/agent-command/parse-prompt", body))
          .status,
        400,
      );
    }
    assert.equal(
      (
        await request(ownerA, "POST", "/api/agent-command/execute-plan", {
          planId: "",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(ownerA, "POST", "/api/agent-command/execute-plan", {
          planId: "PLAN-does-not-exist",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(ownerA, "POST", "/api/agent-command/adopt-suggestion", {
          suggestionId: "SUGG-999",
        })
      ).status,
      400,
    );

    const procurement = await request(
      ownerA,
      "POST",
      "/api/agent-command/parse-prompt",
      { prompt: `${marker} PO taslagi hazirla` },
    );
    assert.equal(procurement.status, 200);
    assert.equal(procurement.body.data.intentCategory, "PROCUREMENT_DISPATCH");
    assert.equal(procurement.body.data.requiresApproval, true);
    assert.equal(procurement.body.data.steps.length, 3);
    const planId = procurement.body.data.planId as string;

    const persisted = await prisma.agentCommandPlan.findUniqueOrThrow({
      where: { id: planId },
    });
    assert.equal(persisted.tenantId, tenantA.id);
    assert.equal(persisted.userId, owner.id);
    assert.equal(persisted.status, "PENDING");
    assert.equal(persisted.approvedAt, null);
    assert.equal(
      (
        await request(ownerB, "POST", "/api/agent-command/execute-plan", {
          planId,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(operatorA, "POST", "/api/agent-command/execute-plan", {
          planId,
        })
      ).status,
      404,
    );

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(ownerA, "POST", "/api/agent-command/execute-plan", { planId }),
      ),
    );
    assert.ok(
      concurrent.every(
        (result) =>
          result.status === 200 && result.body.data.executedStepsCount === 3,
      ),
    );
    const executed = await prisma.agentCommandPlan.findUniqueOrThrow({
      where: { id: planId },
    });
    assert.equal(executed.status, "EXECUTED");
    assert.ok(executed.approvedAt);
    assert.ok(executed.executedAt);
    assert.equal(
      await prisma.agentCommandPlan.count({ where: { id: planId } }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: tenantA.id, entityId: planId, action: "UPDATE" },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: tenantB.id, entityId: planId },
      }),
      0,
    );

    const financial = await request(
      ownerA,
      "POST",
      "/api/agent-command/parse-prompt",
      { prompt: `${marker} tahsilat hatirlatmasi hazirla` },
    );
    assert.equal(financial.status, 200);
    assert.equal(financial.body.data.intentCategory, "FINANCIAL_COLLECTION");
    assert.equal(financial.body.data.steps.length, 3);
    const general = await request(
      ownerA,
      "POST",
      "/api/agent-command/parse-prompt",
      { prompt: `${marker} sistem durumunu incele` },
    );
    assert.equal(general.status, 200);
    assert.equal(general.body.data.intentCategory, "OPERATIONAL_OPTIMIZATION");
    assert.equal(general.body.data.steps.length, 2);

    const adopted = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(ownerA, "POST", "/api/agent-command/adopt-suggestion", {
          suggestionId: "SUGG-001",
        }),
      ),
    );
    assert.ok(adopted.every((result) => result.status === 200));
    assert.equal(
      await prisma.automationRule.count({
        where: {
          tenantId: tenantA.id,
          name: "Self-Healing Rule: SUGG-001",
          deletedAt: null,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.automationRule.count({
        where: { tenantId: tenantB.id, name: "Self-Healing Rule: SUGG-001" },
      }),
      0,
    );
    const suggestions = await request(
      ownerA,
      "GET",
      "/api/agent-command/workflow-suggestions",
    );
    assert.equal(suggestions.status, 200);
    assert.equal(
      suggestions.body.data.find(
        (item: { suggestionId: string }) => item.suggestionId === "SUGG-001",
      ).isAdopted,
      true,
    );

    console.log(
      "Agent Command assurance PASS: validation, RBAC, persisted ownership, tenant isolation, concurrent idempotency, audit and suggestion allow-list verified.",
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
    assert.equal(
      await prisma.agentCommandPlan.count({
        where: { prompt: { startsWith: marker } },
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
