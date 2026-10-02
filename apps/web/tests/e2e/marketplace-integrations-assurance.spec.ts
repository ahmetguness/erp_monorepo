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

async function demoTenantId() {
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
  const body = (await response.json()) as any;
  return body.data.tenant.id as string;
}

const integration = {
  id: "int-1",
  tenantId: "tenant-1",
  channel: "TRENDYOL",
  name: "TEST_E2E_INTEGRATION",
  apiKey: null,
  apiSecret: null,
  storeId: "store-1",
  isActive: true,
  lastSyncAt: null,
  syncErrors: 0,
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
  hasApiKey: true,
  hasApiSecret: true,
  _count: { listings: 2, orders: 3 },
};
const paginated = {
  data: [],
  meta: { total: 0, page: 1, pageSize: 3, totalPages: 0 },
};

async function mockSupportingApis(page: Page) {
  await page.route("**/api/marketplace/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          totals: {
            integrations: 1,
            pendingJobs: 0,
            runningJobs: 0,
            failedJobs: 0,
            retryAvailable: 0,
            webhookReplayAvailable: 0,
            webhookFailures: 0,
          },
          items: [],
        },
      }),
    }),
  );
  for (const path of ["sync-jobs**", "webhook-events**", "listing-snapshots**"])
    await page.route(`**/api/marketplace/${path}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated),
      }),
    );
  await page.route("**/api/marketplace/drift-report**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
}

test("marketplace integrations supports create, filters, toggle and delete actions", async ({
  page,
}) => {
  integration.tenantId = await demoTenantId();
  let rows = [integration];
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  await mockSupportingApis(page);
  await page.route("**/api/marketplace/integrations**", async (route) => {
    const request = route.request();
    const url = request.url();
    calls.push({ method: request.method(), url, body: request.postData() });
    if (request.method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows }),
      });
    if (request.method() === "POST" && url.endsWith("/integrations")) {
      rows = [
        ...rows,
        {
          ...integration,
          id: "int-2",
          channel: "N11",
          name: "TEST_E2E_CREATED",
        },
      ];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: rows[1] }),
      });
    }
    if (request.method() === "PATCH") {
      rows = rows.map((row) =>
        row.id === "int-1" ? { ...row, isActive: false } : row,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows[0] }),
      });
    }
    if (request.method() === "DELETE") {
      rows = rows.filter((row) => row.id !== "int-1");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { success: true } }),
      });
    }
    return route.fallback();
  });
  await login(page);
  await page.goto("/dashboard/marketplace/integrations");
  await expect(page.getByText("TEST_E2E_INTEGRATION")).toBeVisible();
  await page.getByPlaceholder(/Entegrasyon, kanal/).fill("bulunamaz");
  await expect(page.getByText(/Filtrelerle eşleşen/)).toBeVisible();
  await page.getByRole("button", { name: /Filtreleri temizle/ }).click();
  await page.getByRole("button", { name: /Yeni entegrasyon/ }).click();
  await page.getByLabel("Kanal").selectOption("N11");
  await page.getByLabel("Entegrasyon Adı").fill("TEST_E2E_CREATED");
  await page.getByRole("button", { name: "Bağla", exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.method === "POST" && call.body?.includes("TEST_E2E_CREATED"),
      ),
    )
    .toBe(true);
  await page.getByTitle("Pasife al").click();
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.method === "PATCH" && call.body?.includes('"isActive":false'),
      ),
    )
    .toBe(true);
  await page.getByTitle("Sil").first().click();
  await page.getByText("Sil", { exact: true }).click();
  await expect
    .poll(() => calls.some((call) => call.method === "DELETE"))
    .toBe(true);
});

test("marketplace integrations exposes list failure with retry", async ({
  page,
}) => {
  let requests = 0;
  await mockSupportingApis(page);
  await page.route("**/api/marketplace/integrations", (route) => {
    requests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled integration failure" },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/marketplace/integrations");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});
