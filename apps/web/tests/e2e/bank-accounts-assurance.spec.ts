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

test("bank account API failure is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/payments/bank-accounts", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled bank failure" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/payments/bank-accounts");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("bank account create, edit and soft-delete controls complete their UI flows", async ({
  page,
}) => {
  let account: any = null;
  let tenantId = "";
  await page.route("**/api/payments/bank-accounts**", async (route) => {
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
        id: "bank-1",
        tenantId,
        ...body,
        accountNumber: body.accountNumber || null,
        iban: body.iban || null,
        bankName: body.bankName || null,
        currencyCode: body.currencyCode || "TRY",
        type: "CHECKING",
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
  await page.goto("/dashboard/payments/bank-accounts");
  await expect(page.getByText("Banka hesabı bulunamadı")).toBeVisible();
  await page.getByRole("button", { name: "Yeni Hesap" }).click();
  await page.getByLabel("Hesap Adı").fill("TEST_E2E_UI_BANK");
  await page.getByLabel("Banka Adı").fill("Test Bank");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("TEST_E2E_UI_BANK")).toBeVisible();
  await page.getByRole("button", { name: "TEST_E2E_UI_BANK düzenle" }).click();
  await page.getByLabel("Hesap Adı").fill("TEST_E2E_UI_BANK_UPDATED");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("TEST_E2E_UI_BANK_UPDATED")).toBeVisible();
  await page
    .getByRole("button", { name: "TEST_E2E_UI_BANK_UPDATED sil" })
    .click();
  await expect(
    page.getByText(/geçmiş ödeme bağlantıları korunur/i),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(page.getByText("Banka hesabı bulunamadı")).toBeVisible();
});

test("real bank accounts page refresh and history are error-free", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (response) => {
    if (
      response.url().includes("/api/payments/bank-accounts") &&
      response.status() >= 400
    )
      failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await login(page);
  await page.goto("/dashboard/payments/bank-accounts");
  await expect(
    page.getByRole("heading", { name: "Banka Hesapları" }),
  ).toBeVisible();
  await page.goto("/dashboard/payments");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/payments\/bank-accounts/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Banka Hesapları" }),
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
