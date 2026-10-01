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

const response = {
  generatedAt: new Date().toISOString(),
  summary: {
    horizonDays: 30,
    openWorkOrderCount: 2,
    capacityRiskCount: 1,
    qualityRiskCount: 1,
    maintenanceActionCount: 1,
    scrapRatePct: 5,
    operationCostVariancePct: 54.5,
  },
  capacityPlan: [
    {
      workCenter: { id: "wc-1", code: "TEST-WC", name: "TEST_E2E İş Merkezi" },
      capacityHours: 240,
      allocatedHours: 230,
      queuedHours: 11,
      utilizationPct: 100.4,
      shiftCount: 1,
      recommendation: "Ek vardiya planla",
    },
  ],
  qualitySignals: [
    {
      workOrderId: "wo-1",
      workOrderNumber: "TEST_E2E_WO",
      product: { id: "p-1", code: "P-1", name: "TEST_E2E Ürün" },
      signal: "scrap",
      severity: "high",
      detail: "%10 fire oranı",
    },
  ],
  maintenancePlan: [
    {
      workCenter: { id: "wc-1", code: "TEST-WC", name: "TEST_E2E İş Merkezi" },
      openTaskCount: 1,
      utilizationPct: 100.4,
      priority: "high",
      recommendation: "Planlı bakım penceresi aç",
    },
  ],
  scrapAnalysis: [
    {
      workOrderId: "wo-1",
      workOrderNumber: "TEST_E2E_WO",
      product: { id: "p-1", code: "P-1", name: "TEST_E2E Ürün" },
      plannedQty: 100,
      producedQty: 90,
      scrapQty: 10,
      scrapRatePct: 10,
      scrapCost: 250,
      reason: "Test fire",
    },
  ],
  shiftPlan: [
    {
      workCenter: { id: "wc-1", code: "TEST-WC", name: "TEST_E2E İş Merkezi" },
      date: "2026-09-30",
      capacityHours: 8,
      shiftCount: 1,
      hoursPerShift: 8,
      utilizationPct: 87.5,
    },
  ],
  operationCosts: [
    {
      operationId: "op-1",
      workOrderId: "wo-1",
      workOrderNumber: "TEST_E2E_WO",
      operationName: "TEST_E2E Operasyon",
      workCenter: { id: "wc-1", code: "TEST-WC", name: "TEST_E2E İş Merkezi" },
      plannedHours: 11,
      actualHours: 17,
      laborCost: 170,
      overheadCost: 85,
      totalCost: 255,
      variancePct: 54.5,
    },
  ],
};

test("advanced production renders calculations and horizon/refetch interactions", async ({
  page,
}) => {
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/production/advanced**", async (route) => {
    requests.push(route.request().url());
    const horizon =
      new URL(route.request().url()).searchParams.get("horizonDays") ?? "30";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          ...response,
          summary: { ...response.summary, horizonDays: Number(horizon) },
        },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/production/advanced");
  await expect(
    page.getByRole("heading", { name: /İleri Üretim/ }),
  ).toBeVisible();
  await expect(page.getByText("TEST_E2E İş Merkezi").first()).toBeVisible();
  await expect(page.getByText("%100,4").first()).toBeVisible();
  await expect(page.getByText("₺255").first()).toBeVisible();
  await page.getByRole("combobox").selectOption("60");
  await expect
    .poll(() => requests.some((url) => url.includes("horizonDays=60")))
    .toBe(true);
  const before = requests.length;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(before);
  await page.reload();
  await expect(page.getByText("TEST_E2E İş Merkezi").first()).toBeVisible();
  await page.goBack();
  await page.goForward();
  expect(consoleErrors).toEqual([]);
});

test("advanced production exposes recoverable API error state", async ({
  page,
}) => {
  await page.route("**/api/production/advanced**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled" } }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/production/advanced");
  await expect(page.getByText(/İleri üretim verileri alınamadı/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
});
