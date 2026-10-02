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

test("marketplace pricing renders calculations and invokes every action", async ({
  page,
}) => {
  const calls: Array<{ url: string; body: string | null }> = [];
  await page.route("**/api/marketplace-pricing/repricing-analysis", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            listingId: "listing-1",
            productId: "product-1",
            productName: "TEST_E2E_PRICING_PRODUCT",
            externalSku: "TEST-SKU",
            channel: "TRENDYOL",
            integrationName: "Test Channel",
            currentPrice: 120,
            averageCost: 100,
            currentMarginPct: 0,
            targetMarginPct: 25,
            recommendedPrice: 160,
            status: "MARGIN_RISK",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/marketplace-pricing/stock-allocations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            productId: "product-1",
            productName: "TEST_E2E_PRICING_PRODUCT",
            totalOnHandStock: 12,
            channelAllocations: [
              {
                integrationId: "integration-1",
                channelName: "Test Channel",
                currentAllocatedStock: 3,
                salesVelocity30Days: 10,
                recommendedStockQuota: 12,
              },
            ],
          },
        ],
      }),
    }),
  );
  for (const endpoint of [
    "execute-reprice",
    "reallocate-stock",
    "run-batch-scan",
  ]) {
    await page.route(
      `**/api/marketplace-pricing/${endpoint}`,
      async (route) => {
        calls.push({
          url: route.request().url(),
          body: route.request().postData(),
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { success: true, updatedCount: 1 } }),
        });
      },
    );
  }

  await login(page);
  await page.goto("/dashboard/marketplace/pricing");
  await expect(
    page.getByText("TEST_E2E_PRICING_PRODUCT").first(),
  ).toBeVisible();
  await expect(page.getByText("12 Adet")).toBeVisible();
  await page.getByRole("button", { name: /Fiyat.*G.*ncelle/ }).click();
  await page.getByRole("button", { name: /Kotalar.*Dengele/ }).click();
  await page.getByRole("button", { name: /Otonom Repricing/ }).click();
  await expect.poll(() => calls.length).toBe(3);
  expect(
    calls.find((call) => call.url.endsWith("execute-reprice"))?.body,
  ).toContain('"targetPrice":160');
  expect(
    calls.find((call) => call.url.endsWith("reallocate-stock"))?.body,
  ).toContain('"productId":"product-1"');
  expect(
    calls.find((call) => call.url.endsWith("run-batch-scan"))?.body,
  ).toContain('"autoApply":true');
});

test("marketplace pricing exposes API failure and retry", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/marketplace-pricing/repricing-analysis", (route) => {
    requests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled pricing failure" },
      }),
    });
  });
  await page.route("**/api/marketplace-pricing/stock-allocations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/marketplace/pricing");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});
