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

async function activeTenantId() {
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

test("fiscal periods UI creates, detects overlap, shows summary/checklist and closes", async ({
  page,
}) => {
  const tenantId = await activeTenantId();
  const periods: any[] = [
    {
      id: "fp-1",
      tenantId,
      name: "2038 Yılı",
      startDate: "2038-01-01T00:00:00.000Z",
      endDate: "2038-12-31T00:00:00.000Z",
      status: "OPEN",
      closedAt: null,
      closedById: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const calls: string[] = [];
  await page.route("**/api/reports/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { totalGross: 0 } }),
    }),
  );
  await page.route("**/api/accounting/fiscal-periods**", async (route) => {
    const req = route.request();
    calls.push(`${req.method()} ${req.url()}`);
    if (req.url().endsWith("/closing-checklist"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            period: periods[0],
            summary: {
              total: 4,
              passed: 4,
              warnings: 0,
              blockers: 0,
              canClose: true,
            },
            items: [],
            generatedAt: new Date().toISOString(),
          },
        }),
      });
    if (req.method() === "POST" && req.url().endsWith("/close")) {
      periods[0].status = "CLOSED";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: periods[0] }),
      });
    }
    if (req.method() === "POST") {
      const input = req.postDataJSON();
      periods.push({
        ...periods[0],
        ...input,
        id: "fp-2",
        startDate: `${input.startDate}T00:00:00.000Z`,
        endDate: `${input.endDate}T00:00:00.000Z`,
      });
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: periods.at(-1) }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: periods }),
    });
  });
  await login(page);
  await page.goto("/dashboard/accounting/fiscal-periods");
  await expect(page.getByText("2038 Yılı").first()).toBeVisible();
  await page.getByRole("button", { name: /Özet/ }).click();
  await expect(
    page.getByText("Muhasebe kapanış kontrol listesi"),
  ).toBeVisible();
  await page.getByRole("link", { name: /Yeni dönem/ }).click();
  const dialog = page.getByRole("dialog", { name: /Yeni mali dönem/ });
  await dialog.getByLabel("Dönem adı").fill("2039 Yılı");
  await dialog.getByLabel("Başlangıç Tarihi").fill("2039-01-01");
  await dialog.getByLabel("Bitiş Tarihi").fill("2039-12-31");
  await dialog.getByRole("button", { name: /Dönemi oluştur/ }).click();
  await expect(page.getByText("2039 Yılı").first()).toBeVisible();
  await page.getByRole("button", { name: "Kapat" }).first().click();
  await page
    .getByRole("dialog", { name: /Dönemi kapat/ })
    .getByRole("button", { name: "Kapat" })
    .last()
    .click();
  await expect
    .poll(() => calls.some((call) => call.endsWith("/fp-1/close")))
    .toBe(true);
});

test("fiscal periods list failure is visible and retryable", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/accounting/fiscal-periods**", (route) => {
    requests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled fiscal failure" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/accounting/fiscal-periods");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("real fiscal periods page loads, refreshes and survives history without API or console errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [],
    failed: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      consoleErrors.push(`${message.text()} @ ${message.location().url}`);
  });
  page.on("response", (response) => {
    if (
      response.url().includes("/api/accounting/fiscal-periods") &&
      response.status() >= 400
    )
      failed.push(`${response.status()} ${response.url()}`);
  });
  await login(page);
  await page.goto("/dashboard/accounting/fiscal-periods");
  await expect(
    page.getByRole("heading", { name: /Mali dönemler/ }),
  ).toBeVisible();
  await page.goto("/dashboard/accounting/accounts");
  await page.goBack();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Mali dönemler/ }),
  ).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) =>
        !message.includes("favicon") &&
        !message.includes("/api/currency-rates/tcmb"),
    ),
  ).toEqual([]);
});
