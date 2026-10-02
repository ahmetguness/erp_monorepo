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
test("bank transaction list failure is visible and retryable", async ({
  page,
}) => {
  let requests = 0;
  await page.route(/\/api\/bank-transactions\?.*/, async (route) => {
    requests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/bank-transactions");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});
test("create modal exposes inputs and cancels without mutation", async ({
  page,
}) => {
  let posts = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/bank-transactions") &&
      request.method() === "POST"
    )
      posts += 1;
  });
  await login(page);
  await page.goto("/dashboard/bank-transactions");
  await page.getByRole("button", { name: "Yeni Hareket" }).click();
  await expect(page.getByText("Yeni Banka Hareketi")).toBeVisible();
  await expect(page.getByPlaceholder("Banka hesabı ara...")).toBeVisible();
  await page.getByLabel("Tutar").fill("125.50");
  await page.getByLabel("İşlem Sonrası Bakiye").fill("1125.50");
  await page.getByLabel("Açıklama").fill("TEST_E2E Türkçe hareket ₺");
  await page.getByLabel("Referans").fill("TEST_E2E_REF");
  await page.getByRole("button", { name: "İptal" }).click();
  await expect(page.getByText("Yeni Banka Hareketi")).not.toBeVisible();
  expect(posts).toBe(0);
});
test("real page survives filtering and refresh without module errors", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (response) => {
    if (
      response.url().includes("/api/bank-transactions") &&
      response.status() >= 400
    )
      failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await login(page);
  await page.goto("/dashboard/bank-transactions");
  await expect(
    page.getByRole("heading", { name: "Banka Hareketleri" }),
  ).toBeVisible();
  await page.getByRole("combobox").first().selectOption("DEPOSIT");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Banka Hareketleri" }),
  ).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    errors.filter(
      (value) =>
        !value.includes("favicon") &&
        !value.includes("502 (Bad Gateway)") &&
        !value.includes("currency-rates"),
    ),
  ).toEqual([]);
});
