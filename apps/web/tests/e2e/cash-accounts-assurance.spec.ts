import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page.evaluate(
    async () =>
      (
        (await (
          await fetch("http://localhost:3001/api/auth/me", {
            credentials: "include",
          })
        ).json()) as any
      ).data.tenant.id as string,
  );
}

test("cash account API failure is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/payments/cash-accounts", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled cash failure" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/payments/cash-accounts");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("cash account create, edit and soft-delete controls complete their UI flows", async ({
  page,
}) => {
  let account: any = null,
    tenantId = "";
  await page.route("**/api/payments/cash-accounts**", async (route) => {
    const method = route.request().method();
    if (method === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: account ? [account] : [] }),
      });
    if (method === "POST") {
      const body = route.request().postDataJSON();
      account = {
        id: "cash-1",
        tenantId,
        ...body,
        currencyCode: body.currencyCode || "TRY",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: account }),
      });
    }
    if (method === "PATCH") {
      account = {
        ...account,
        ...route.request().postDataJSON(),
        updatedAt: new Date().toISOString(),
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: account }),
      });
    }
    account = null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { success: true } }),
    });
  });
  tenantId = await login(page);
  await page.goto("/dashboard/payments/cash-accounts");
  await expect(page.getByText("Kasa hesabı bulunamadı")).toBeVisible();
  await page.getByRole("button", { name: "Yeni Kasa" }).click();
  await page.getByLabel("Kasa Adı").fill("TEST_E2E_UI_CASH");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("TEST_E2E_UI_CASH")).toBeVisible();
  await page.getByRole("button", { name: "TEST_E2E_UI_CASH düzenle" }).click();
  await page.getByLabel("Kasa Adı").fill("TEST_E2E_UI_CASH_UPDATED");
  await page.getByLabel("Para Birimi").fill("USD");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("TEST_E2E_UI_CASH_UPDATED")).toBeVisible();
  await expect(page.getByText("USD")).toBeVisible();
  await page
    .getByRole("button", { name: "TEST_E2E_UI_CASH_UPDATED sil" })
    .click();
  await expect(
    page.getByText(/geçmiş ödeme bağlantıları korunur/i),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(page.getByText("Kasa hesabı bulunamadı")).toBeVisible();
});

test("real cash accounts page refresh and history are error-free", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (response) => {
    if (
      response.url().includes("/api/payments/cash-accounts") &&
      response.status() >= 400
    )
      failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await login(page);
  await page.goto("/dashboard/payments/cash-accounts");
  await expect(
    page.getByRole("heading", { name: "Kasa Hesapları" }),
  ).toBeVisible();
  await page.goto("/dashboard/payments");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/payments\/cash-accounts/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kasa Hesapları" }),
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
