import { expect, test, type Page, type Route } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
const fulfill = (route: Route, data: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });

test("reports API error is visible and retryable", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/reports/revenue-summary**", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled reports error" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/reports");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = calls;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => calls).toBeGreaterThan(before);
});

test("prepared report tabs render deterministic API results", async ({
  page,
}) => {
  await page.route("**/api/reports/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/revenue-summary"))
      return fulfill(route, {
        period: { from: "2026-09-15", to: "2026-09-15" },
        invoiceCount: 1,
        totalNet: 100,
        totalTax: 20,
        totalGross: 120,
      });
    if (path.endsWith("/expense-summary"))
      return fulfill(route, {
        period: { from: "2026-09-15", to: "2026-09-15" },
        invoiceCount: 1,
        totalNet: 50,
        totalTax: 10,
        totalGross: 60,
      });
    if (path.endsWith("/stock-summary"))
      return fulfill(route, {
        summary: { totalLines: 1, belowMinStockCount: 1, totalStockValue: 30 },
        stockLevels: [],
        belowMinStock: [
          {
            productId: "p1",
            productCode: "TEST_E2E",
            productName: "TEST Ürün",
            warehouseName: "TEST Depo",
            quantity: 3,
            minStockLevel: 5,
          },
        ],
      });
    if (path.endsWith("/contact-balance"))
      return fulfill(route, {
        contacts: [
          {
            contactId: "c1",
            name: "TEST Cari",
            code: "TEST",
            type: "CUSTOMER",
            balance: 300,
            lastEntryDate: "2026-09-15T10:00:00.000Z",
          },
        ],
        summary: { totalReceivable: 300, totalPayable: 0 },
      });
    if (path.endsWith("/collection-list"))
      return fulfill(route, {
        payments: [],
        summary: { totalCollected: 250, count: 1 },
      });
    if (path.endsWith("/top-products"))
      return fulfill(route, {
        period: { from: "2026-09-15", to: "2026-09-15" },
        products: [
          {
            productId: "p1",
            productCode: "TEST_E2E",
            productName: "TEST Ürün",
            quantity: 2,
            revenue: 120,
            invoiceCount: 1,
          },
        ],
        summary: { count: 1, totalQuantity: 2, totalRevenue: 120 },
      });
    if (path.endsWith("/saved")) return fulfill(route, []);
    if (path.endsWith("/registry"))
      return fulfill(route, {
        datasets: [],
        chartTypes: [],
        capabilities: {
          savedKpi: true,
          dashboardPinning: true,
          scheduledReportEmail: true,
          exportAudit: true,
          permissionAwareDatasetFields: true,
        },
      });
    if (path.endsWith("/decision-insights"))
      return fulfill(route, { summary: {}, signals: [], recommendations: [] });
    return fulfill(route, []);
  });
  await login(page);
  await page.goto("/dashboard/reports");
  await expect(
    page.getByRole("heading", { name: "Raporlar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Stok kritik seviye/ }).click();
  await expect(page.getByText("TEST Ürün")).toBeVisible();
  await page.getByRole("button", { name: /En çok satan ürünler/i }).click();
  await expect(page.getByText("TEST Ürün")).toBeVisible();
  await page.getByRole("button", { name: /Cari Bakiye/i }).click();
  await expect(page.getByText("TEST Cari")).toBeVisible();
  await page.goto("/dashboard");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/reports/);
});
