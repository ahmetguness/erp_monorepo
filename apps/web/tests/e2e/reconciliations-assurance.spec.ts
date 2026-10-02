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
  const r = await fetch("http://localhost:3001/api/auth/login", {
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
  return ((await r.json()) as any).data.tenant.id;
}

test("reconciliation UI creates with a line, filters, refreshes and finalizes", async ({
  page,
}) => {
  const tid = await tenantId(),
    calls: string[] = [],
    accounts = [
      {
        id: "acc-1",
        tenantId: tid,
        code: "100",
        name: "TEST Kasa",
        accountType: "ASSET",
        parentId: null,
        isActive: true,
        children: [],
      },
    ];
  const rows: any[] = [
    {
      id: "rec-1",
      tenantId: tid,
      name: "TEST Açık",
      description: null,
      date: "2041-01-01T00:00:00.000Z",
      isFinalized: false,
      finalizedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { lines: 1 },
    },
  ];
  await page.route("**/api/accounting/accounts**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: accounts }),
    }),
  );
  await page.route("**/api/reconciliations**", async (route) => {
    const req = route.request();
    calls.push(`${req.method()} ${req.url()}`);
    if (req.method() === "POST" && req.url().endsWith("/finalize")) {
      rows[0].isFinalized = true;
      rows[0].finalizedAt = new Date().toISOString();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows[0] }),
      });
    }
    if (req.method() === "POST") {
      const input = req.postDataJSON();
      rows.push({
        ...rows[0],
        id: "rec-2",
        name: input.name,
        description: input.description ?? null,
        isFinalized: false,
        finalizedAt: null,
        _count: { lines: input.lines.length },
      });
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...rows.at(-1), lines: input.lines } }),
      });
    }
    const url = new URL(req.url()),
      f = url.searchParams.get("isFinalized");
    const data =
      f == null ? rows : rows.filter((x) => String(x.isFinalized) === f);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data,
        meta: { total: data.length, page: 1, pageSize: 20, totalPages: 1 },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/reconciliations");
  await expect(page.getByText("TEST Açık")).toBeVisible();
  await page.getByRole("button", { name: "Yeni mutabakat" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni mutabakat" });
  await dialog.getByLabel("Mutabakat adı").fill("TEST UI Mutabakat");
  await dialog.getByLabel("Hesap").selectOption("acc-1");
  await dialog.getByLabel("Tutar").fill("125.50");
  await dialog.getByRole("button", { name: "Oluştur" }).click();
  await expect(page.getByText("TEST UI Mutabakat")).toBeVisible();
  await page.getByRole("button", { name: "Açık", exact: true }).click();
  await expect(page.getByText("TEST Açık")).toBeVisible();
  await page.getByRole("button", { name: "Tümü" }).click();
  await page
    .getByRole("button", { name: "Tamamla", exact: true })
    .first()
    .click();
  await expect.poll(() => calls.join("\n")).toContain("/finalize");
  await page.getByRole("button", { name: "Yenile" }).click();
});

test("reconciliation list error is visible and retryable", async ({ page }) => {
  let n = 0;
  await page.route("**/api/accounting/accounts**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"data":[]}',
    }),
  );
  await page.route("**/api/reconciliations**", (r) => {
    n++;
    return r.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":{"message":"controlled"}}',
    });
  });
  await login(page);
  await page.goto("/dashboard/reconciliations");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = n;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => n).toBeGreaterThan(before);
});

test("real reconciliation page loads without module API or console errors and survives history", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/reconciliations") && r.status() >= 400)
      failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
  });
  await login(page);
  await page.goto("/dashboard/reconciliations");
  await expect(
    page.getByRole("heading", { name: "Mutabakat", exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard/accounting/fiscal-periods");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Mutabakat", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mutabakat", exact: true }),
  ).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    errors.filter(
      (x) => !x.includes("favicon") && !x.includes("/api/currency-rates/tcmb"),
    ),
  ).toEqual([]);
});
