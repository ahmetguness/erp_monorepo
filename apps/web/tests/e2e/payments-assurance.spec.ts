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

test("payments list API failure is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/payments?**", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled payment failure" },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/payments");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("real payments page loads, refreshes and survives browser history without module errors", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/payments") && response.status() >= 400)
      failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`${message.text()} @ ${message.location().url}`);
  });
  await login(page);
  await page.goto("/dashboard/payments");
  await expect(
    page.getByRole("heading", { name: /Ödeme|Tahsilat/ }).first(),
  ).toBeVisible();
  await page.goto("/dashboard/reconciliations");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/payments/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Ödeme|Tahsilat/ }).first(),
  ).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    errors.filter(
      (value) =>
        !value.includes("favicon") &&
        !value.includes("/api/currency-rates/tcmb"),
    ),
  ).toEqual([]);
});
