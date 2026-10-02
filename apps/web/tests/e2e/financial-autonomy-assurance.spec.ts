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
const forecast = {
  generatedAt: new Date().toISOString(),
  forecastDays: 30,
  initialBalance: 800,
  totalExpectedInflow: 600,
  totalExpectedOutflow: 300,
  projectedEndBalance: 1100,
  deficitDaysCount: 1,
  fixedCostsIncluded: false,
  totalFixedCostOutflow: 0,
  dailySnapshots: [],
};
test("forecast API failure is visible and retryable", async ({ page }) => {
  let n = 0;
  await page.route(
    "**/api/financial-autonomy/cash-flow-forecast**",
    async (r) => {
      n++;
      await r.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "controlled" } }),
      });
    },
  );
  await login(page);
  await page.goto("/dashboard/finance/autonomy");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }).first(),
  ).toBeVisible();
  const before = n;
  await page
    .getByRole("button", { name: /Tekrar dene/ })
    .first()
    .click();
  await expect.poll(() => n).toBeGreaterThan(before);
});
test("forecast periods, settlement draft and audited recommendation action work", async ({
  page,
}) => {
  let days = "";
  let actions = 0;
  await page.route(
    "**/api/financial-autonomy/cash-flow-forecast**",
    async (r) => {
      days = new URL(r.request().url()).searchParams.get("days") ?? "";
      await r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { ...forecast, forecastDays: Number(days) },
        }),
      });
    },
  );
  await page.route("**/api/financial-autonomy/recommendations", async (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "rec-1",
            type: "EARLY_PAYMENT_DISCOUNT",
            title: "TEST öneri",
            description: "TEST açıklama",
            impactAmount: 30,
            actionType: "TRIGGER_COLLECTION_SETTLEMENT",
            payload: { targetDiscountPct: 3 },
          },
        ],
      }),
    }),
  );
  await page.route(
    "**/api/financial-autonomy/collection-settlement/**",
    async (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            invoiceId: "inv-1",
            invoiceNumber: "TEST-INV",
            contactName: "TEST Cari",
            totalAmount: 600,
            dueDate: "2026-09-01",
            daysOverdue: 31,
            suggestedDiscountPercent: 5,
            discountAmount: 30,
            netPayableAmount: 570,
            validUntil: "2026-10-09",
            paymentLinkUrl: "https://example.test/draft",
            installmentOptions: [],
          },
        }),
      }),
  );
  await page.route("**/api/financial-autonomy/execute-action", async (r) => {
    actions++;
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { success: true, message: "Onay kaydı oluşturuldu" },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/finance/autonomy");
  await expect(page.getByText("₺800,00")).toBeVisible();
  await page.getByRole("button", { name: "60 Gün Projeksiyon" }).click();
  await expect.poll(() => days).toBe("60");
  await page.getByPlaceholder(/Fatura ID/).fill("inv-1");
  await page.getByRole("button", { name: /Dinamik İskonto/ }).click();
  await expect(page.getByText("₺570,00")).toBeVisible();
  await page.getByRole("button", { name: "Öneriyi Onay Kaydına Al" }).click();
  await expect.poll(() => actions).toBe(1);
});
test("real finance autonomy page refreshes without module request errors", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/financial-autonomy") && r.status() >= 400)
      failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await login(page);
  await page.goto("/dashboard/finance/autonomy");
  await expect(page.getByText(/Proactive Financial Autonomy/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Proactive Financial Autonomy/)).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    errors.filter(
      (x) =>
        !x.includes("favicon") &&
        !x.includes("502 (Bad Gateway)") &&
        !x.includes("currency-rates"),
    ),
  ).toEqual([]);
});
