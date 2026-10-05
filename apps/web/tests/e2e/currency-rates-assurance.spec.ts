import { expect, test, type Page } from "@playwright/test";
async function prepare(page: Page) {
  await page.route("**/api/settings", async (route) =>
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
  await expect(page).toHaveURL(/\/dashboard$/);
}
const rates = {
  date: "05.10.2026",
  currencies: [
    {
      code: "USD",
      name: "ABD DOLARI",
      unit: 1,
      forexBuying: 30,
      forexSelling: 31,
      banknoteBuying: 29,
      banknoteSelling: 32,
      crossRateUSD: 1,
    },
    {
      code: "EUR",
      name: "EURO",
      unit: 1,
      forexBuying: 40,
      forexSelling: 41,
      banknoteBuying: 39,
      banknoteSelling: 42,
      crossRateUSD: 1.3,
    },
    {
      code: "GBP",
      name: "İNGİLİZ STERLİNİ",
      unit: 1,
      forexBuying: 45,
      forexSelling: 46,
      banknoteBuying: 44,
      banknoteSelling: 47,
      crossRateUSD: 1.5,
    },
    {
      code: "JPY",
      name: "JAPON YENİ",
      unit: 100,
      forexBuying: 20,
      forexSelling: 22,
      banknoteBuying: 19,
      banknoteSelling: 23,
      crossRateUSD: 0.006,
    },
  ],
};
test("TCMB error is visible and retryable", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/currency-rates/tcmb", async (route) => {
    calls++;
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "controlled" }),
    });
  });
  await prepare(page);
  await page.goto("/dashboard/currency-rates");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible({ timeout: 15_000 });
  const before = calls;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => calls).toBeGreaterThan(before);
});
test("search, tabs, refresh and unit-aware conversion work", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/currency-rates/tcmb", async (route) => {
    calls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: rates }),
    });
  });
  await prepare(page);
  await page.goto("/dashboard/currency-rates");
  await expect(
    page.getByRole("heading", { name: /Döviz Kurları/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Tümü/ }).click();
  await page.getByPlaceholder(/Döviz ara/).fill("JPY");
  await expect(page.getByText("JAPON YENİ")).toBeVisible();
  await page.getByPlaceholder(/Döviz ara/).fill("");
  await page.locator("select:visible").selectOption("JPY");
  await page.locator('input[type="number"]:visible').fill("100");
  await expect(
    page.getByText("₺20,00", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.locator('button[title*="Yönü"]:visible').click();
  await expect(
    page.getByText(/TRY → JPY/).filter({ visible: true }),
  ).toBeVisible();
  const before = calls;
  await page.getByRole("button", { name: "Yenile" }).click();
  await expect.poll(() => calls).toBeGreaterThan(before);
  await page.goto("/dashboard");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/currency-rates/);
});
