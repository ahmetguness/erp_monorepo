import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function tenantId() {
  const response = await fetch("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: "admin@axondemo.com",
      password: "demo1234",
      tenantSlug: "axon-demo",
    }),
  });
  return ((await response.json()) as any).data.tenant.id as string;
}

test("journal UI creates, filters, posts, reverses and runs automatic posting", async ({
  page,
}) => {
  const activeTenantId = await tenantId();
  const accounts = [
    {
      id: "acc-1",
      tenantId: activeTenantId,
      code: "100",
      name: "TEST Kasa",
      accountType: "ASSET",
      parentId: null,
      isActive: true,
      children: [],
    },
    {
      id: "acc-2",
      tenantId: activeTenantId,
      code: "300",
      name: "TEST Sermaye",
      accountType: "EQUITY",
      parentId: null,
      isActive: true,
      children: [],
    },
  ];
  const line = (
    id: string,
    accountId: string,
    debit: number,
    credit: number,
  ) => ({
    id,
    accountId,
    debit,
    credit,
    description: null,
    sortOrder: 0,
    account: accounts.find((account) => account.id === accountId),
  });
  const entries: any[] = [
    {
      id: "je-draft",
      tenantId: activeTenantId,
      fiscalPeriodId: null,
      type: "MANUAL",
      number: "JE-TEST-1",
      date: "2026-10-02T00:00:00.000Z",
      description: "TEST Taslak",
      isPosted: false,
      refType: null,
      refId: null,
      postedAt: null,
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      lines: [line("l1", "acc-1", 100, 0), line("l2", "acc-2", 0, 100)],
    },
    {
      id: "je-posted",
      tenantId: activeTenantId,
      fiscalPeriodId: null,
      type: "MANUAL",
      number: "JE-TEST-2",
      date: "2026-10-02T00:00:00.000Z",
      description: "TEST Onaylı",
      isPosted: true,
      refType: null,
      refId: null,
      postedAt: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      lines: [line("l3", "acc-1", 50, 0), line("l4", "acc-2", 0, 50)],
    },
  ];
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  await page.route("**/api/accounting/accounts**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: accounts }),
    }),
  );
  await page.route("**/api/accounting/posting-engine/run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          generatedAt: new Date().toISOString(),
          source: "ALL",
          scanned: 0,
          posted: 0,
          skipped: 0,
          failed: 0,
          mappings: [],
          items: [],
        },
      }),
    }),
  );
  await page.route("**/api/accounting/journal-entries**", async (route) => {
    const request = route.request(),
      url = request.url();
    calls.push({ method: request.method(), url, body: request.postData() });
    if (request.method() === "POST" && url.endsWith("/post")) {
      const item = entries.find((entry) => url.includes(entry.id));
      item.isPosted = true;
      item.postedAt = new Date().toISOString();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: item }),
      });
    }
    if (request.method() === "POST" && url.endsWith("/reverse")) {
      const original = entries.find((entry) => url.includes(entry.id));
      const reversal = {
        ...original,
        id: "je-reversal",
        number: "JE-TEST-3",
        description: "Ters kayıt TEST",
        refType: "JOURNAL_REVERSAL",
        refId: original.id,
        lines: [line("lr1", "acc-1", 0, 50), line("lr2", "acc-2", 50, 0)],
      };
      entries.push(reversal);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: reversal }),
      });
    }
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const created = {
        ...entries[0],
        id: "je-created",
        number: "JE-TEST-4",
        description: input.description,
        lines: [
          line(
            "lc1",
            input.lines[0].accountId,
            input.lines[0].debit,
            input.lines[0].credit,
          ),
          line(
            "lc2",
            input.lines[1].accountId,
            input.lines[1].debit,
            input.lines[1].credit,
          ),
        ],
      };
      entries.push(created);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: created }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: entries,
        meta: { total: entries.length, page: 1, pageSize: 20, totalPages: 1 },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/accounting/journal-entries");
  await expect(page.getByText("JE-TEST-1")).toBeVisible();
  await expect(page.getByText("JE-TEST-2")).toBeVisible();
  await page.getByRole("button", { name: /Taslak/ }).click();
  await expect(page.getByText("JE-TEST-2")).toBeHidden();
  await page.getByRole("button", { name: /Tümü/ }).click();
  await page.getByRole("link", { name: /Yeni fi/ }).click();
  const dialog = page.getByRole("dialog", { name: /Yeni Yevmiye/ });
  await dialog.getByPlaceholder(/Fi.*açıklaması/).fill("TEST UI Fiş");
  const selects = dialog.locator("select");
  await selects.nth(0).selectOption("acc-1");
  await selects.nth(1).selectOption("acc-2");
  const numbers = dialog.locator('input[type="number"]');
  await numbers.nth(0).fill("75");
  await numbers.nth(3).fill("75");
  await dialog.getByRole("button", { name: /Fi.*Kaydet/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("JE-TEST-4")).toBeVisible();
  await page
    .getByRole("button", { name: /Onayla/ })
    .first()
    .click();
  await expect
    .poll(() => calls.some((call) => call.url.endsWith("/post")))
    .toBe(true);
  page.once("dialog", (prompt) => prompt.accept("TEST UI reversal"));
  await page
    .getByRole("button", { name: /Ters kayıt/ })
    .first()
    .click();
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.url.endsWith("/reverse") &&
          call.body?.includes("TEST UI reversal"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: /Otomatik posting/ }).click();
  await expect(page.getByText("0 fiş", { exact: true })).toBeVisible();
});

test("journal list failure is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/accounting/accounts**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/accounting/journal-entries**", (route) => {
    requests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled journal failure" },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/accounting/journal-entries");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("real journal page loads without journal network or console errors and survives history navigation", async ({
  page,
}) => {
  const consoleErrors: string[] = [],
    failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      consoleErrors.push(`${message.text()} @ ${message.location().url}`);
  });
  page.on("response", (response) => {
    if (
      response.url().includes("/api/accounting/journal-entries") &&
      response.status() >= 400
    )
      failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await login(page);
  await page.goto("/dashboard/accounting/journal-entries");
  await expect(page.getByRole("heading", { name: /Yevmiye fi/ })).toBeVisible();
  await page.goto("/dashboard/accounting/accounts");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/accounting\/journal-entries$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Yevmiye fi/ })).toBeVisible();
  expect(failedResponses).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) =>
        !message.includes("favicon") &&
        !message.includes("/api/currency-rates/tcmb"),
    ),
  ).toEqual([]);
});
