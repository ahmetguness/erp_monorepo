import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const policy = {
  autoCreateContact: true,
  autoCreateSalesOrder: true,
  autoReserveStock: true,
  autoCreateInvoice: false,
  autoSyncErpStockToMarketplace: true,
};
const summary = {
  policy,
  totalMarketplaceOrders: 7,
  matchedContactCount: 5,
  salesOrderCount: 4,
  reservationCount: 3,
  unmatchedSkuCount: 2,
};
const order = {
  id: "mp-order-1",
  integrationId: "int-1",
  externalId: "TEST-MP-1",
  channel: "TRENDYOL",
  status: "PENDING",
  customerName: "TEST Müşteri",
  customerEmail: null,
  customerPhone: null,
  shippingAddress: null,
  totalAmount: 240,
  orderDate: "2026-10-01T00:00:00Z",
  syncedAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  items: [],
};

test("marketplace automation renders metrics, updates policies, refreshes and reruns an order", async ({
  page,
}) => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  await page.route("**/api/marketplace/automation/summary", async (route) => {
    calls.push({
      method: route.request().method(),
      url: route.request().url(),
      body: null,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: summary }),
    });
  });
  await page.route("**/api/marketplace/automation/policy", async (route) => {
    calls.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postData(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...policy, autoCreateContact: false } }),
    });
  });
  await page.route(
    "**/api/marketplace/orders/mp-order-1/automate",
    async (route) => {
      calls.push({
        method: route.request().method(),
        url: route.request().url(),
        body: null,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            marketplaceOrderId: order.id,
            externalId: order.externalId,
            contactId: "c1",
            contactCreated: false,
            matchedSkuCount: 1,
            unmatchedSkuCount: 0,
            salesOrderId: "so1",
            reservationIds: ["r1"],
            statusSynced: true,
            errors: [],
          },
        }),
      });
    },
  );
  await page.route("**/api/marketplace/orders**", (route) => {
    if (route.request().url().includes("/automate")) {
      calls.push({
        method: route.request().method(),
        url: route.request().url(),
        body: null,
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            marketplaceOrderId: order.id,
            externalId: order.externalId,
            contactId: "c1",
            contactCreated: false,
            matchedSkuCount: 1,
            unmatchedSkuCount: 0,
            salesOrderId: "so1",
            reservationIds: ["r1"],
            statusSynced: true,
            errors: [],
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [order],
        meta: { total: 1, page: 1, pageSize: 15, totalPages: 1 },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/marketplace/automation");
  await expect(page.getByText("TEST-MP-1")).toBeVisible();
  await expect(page.getByText("7", { exact: true })).toBeVisible();
  await page
    .getByRole("switch", { name: "Otomatik müşteri carisi oluştur" })
    .click();
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.method === "POST" &&
          call.url.includes("/automation/policy") &&
          call.body?.includes("autoCreateContact"),
      ),
    )
    .toBe(true);
  const before = calls.filter((call) =>
    call.url.includes("/automation/summary"),
  ).length;
  await page.getByRole("button", { name: /Verileri Güncelle/ }).click();
  await expect
    .poll(
      () =>
        calls.filter((call) => call.url.includes("/automation/summary")).length,
    )
    .toBeGreaterThan(before);
  await page.getByRole("button", { name: "Çalıştır" }).click();
  await expect
    .poll(() =>
      calls.some((call) => call.url.includes("/orders/mp-order-1/automate")),
    )
    .toBe(true);
});

test("marketplace automation exposes summary and order API failures with retry", async ({
  page,
}) => {
  await page.route("**/api/marketplace/automation/summary", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled marketplace failure" },
      }),
    }),
  );
  await page.route("**/api/marketplace/orders**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: { total: 0, page: 1, pageSize: 15, totalPages: 0 },
      }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/marketplace/automation");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
});
