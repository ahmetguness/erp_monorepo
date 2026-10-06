import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function login(page: Page) {
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "wizard", key: "wizard_completed", value: "true" }],
      }),
    }),
  );
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test("workflow tabs, rule CRUD controls, scheduler contract and retry states work", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "axon-demo" },
    select: { id: true },
  });
  await prisma.$disconnect();
  const now = new Date().toISOString();
  const rule = {
    id: "workflow-rule-1",
    tenantId: tenant.id,
    name: "TEST_E2E_WORKFLOW_UI",
    description: "UI assurance",
    module: "workflow",
    trigger: "LOW_STOCK",
    action: "CREATE_TASK",
    conditions: { minDeficit: 10 },
    actionConfig: { taskType: "AUTOMATION" },
    isActive: true,
    lastRunAt: null,
    lastResult: null,
    createdAt: now,
    updatedAt: now,
  };
  let rulesFail = false;
  let createCalls = 0;
  let runCalls = 0;
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: {
          total: 0,
          counts: {
            APPROVAL: 0,
            COLLECTION: 0,
            SERVICE: 0,
            NOTIFICATION: 0,
            CHECK: 0,
            AUTOMATION: 0,
            STOCK: 0,
            FISCAL: 0,
            GENERAL: 0,
          },
        },
      }),
    }),
  );
  await page.route("**/api/tasks/exceptions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          generatedAt: now,
          total: 0,
          critical: 0,
          high: 0,
          byCategory: [],
          items: [],
        },
      }),
    }),
  );
  await page.route("**/api/intelligence/automation-rules/templates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/process-blueprints**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/automation-rules/governance/policy", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { approvalThreshold: 100000, minimumAutomaticConfidence: 0.8 },
      }),
    }),
  );
  await page.route("**/api/automation-rules/executions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/automation-rules/scheduler/jobs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            key: "executive_insights_digest",
            title: "Executive insights digest",
            description: "TEST scheduler contract",
            cadence: "daily",
            module: "reporting",
            status: "ACTIVE",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/automation-rules/scheduler/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route(
    "**/api/automation-rules/workflow-rule-1/run",
    async (route) => {
      runCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            matched: 1,
            tasksCreated: 1,
            notificationsCreated: 0,
            skipped: 0,
          },
        }),
      });
    },
  );
  await page.route("**/api/automation-rules", async (route) => {
    if (route.request().method() === "POST") {
      createCalls++;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ...rule,
            id: `created-${createCalls}`,
            name: "TEST_E2E_WORKFLOW_CREATED",
          },
        }),
      });
      return;
    }
    await route.fulfill(
      rulesFail
        ? {
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { message: "controlled" } }),
          }
        : {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: [rule] }),
          },
    );
  });

  await login(page);
  await page.goto("/dashboard/workflow");
  await expect(
    page.getByRole("heading", { level: 1, name: /Akışı.*Otomasyon/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/Mudahale gerektiren istisna bulunmuyor/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Bekleyen/ }).click();
  await expect(
    page.getByText(/Bekleyen iş bulunmuyor|Bekleyen i.* bulunmuyor/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Otomasyon Kuralları|Otomasyon Kurallar/ })
    .click();
  await expect(page.getByText(rule.name)).toBeVisible();
  await page.getByRole("button", { name: /Çalıştır|al.*tır/ }).click();
  await expect.poll(() => runCalls).toBe(1);

  const nameInput = page.getByRole("textbox", { name: /Kural adı|Kural ad/ });
  await nameInput.fill("TEST_E2E_WORKFLOW_CREATED");
  await page.getByRole("button", { name: /Kuralı oluştur|Kural.*olu/ }).click();
  await expect.poll(() => createCalls).toBe(1);

  await page.getByRole("button", { name: /Scheduler/ }).click();
  await expect(page.getByText("Executive insights digest")).toBeVisible();
  await expect(page.getByText("TEST scheduler contract")).toBeVisible();

  rulesFail = true;
  await page
    .getByRole("button", { name: /Otomasyon Kuralları|Otomasyon Kurallar/ })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: /Otomasyon Kuralları|Otomasyon Kurallar/ })
    .click();
  await expect(page.getByText(/Sunucu hatası: 500/)).toBeVisible();
  rulesFail = false;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect(page.getByText(rule.name)).toBeVisible();
  expect(consoleErrors.filter((item) => !item.includes("500"))).toEqual([]);
});
