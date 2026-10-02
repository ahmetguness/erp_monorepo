import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function tenantId() {
  const response = await fetch("http://localhost:3001/api/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: "admin@axondemo.com", password: "demo1234", tenantSlug: "axon-demo" }) });
  return ((await response.json()) as any).data.tenant.id as string;
}

test("accounting accounts loads hierarchy, filters and creates an account", async ({ page }) => {
  const activeTenantId = await tenantId();
  const accounts: any[] = [{ id: "parent-1", tenantId: activeTenantId, code: "100", name: "TEST Ana Kasa", accountType: "ASSET", parentId: null, isActive: true, children: [] }];
  const calls: Array<{ method: string; body: string | null }> = [];
  await page.route("**/api/accounting/accounts**", async (route) => {
    const request = route.request(); calls.push({ method: request.method(), body: request.postData() });
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const created = { id: "child-1", tenantId: activeTenantId, code: input.code, name: input.name, accountType: input.type, parentId: input.parentId ?? null, isActive: true, parent: input.parentId ? { id: "parent-1", code: "100", name: "TEST Ana Kasa" } : undefined, children: [] };
      accounts.push(created); accounts[0].children.push({ id: created.id, code: created.code, name: created.name });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: created }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: accounts }) });
  });
  await login(page);
  await page.goto("/dashboard/accounting/accounts");
  await expect(page.getByText("TEST Ana Kasa").first()).toBeVisible();
  await page.getByPlaceholder(/Kod, ad veya/).fill("bulunamaz");
  await expect(page.getByText(/Hesap bulunamad/)).toBeVisible();
  await page.getByPlaceholder(/Kod, ad veya/).fill("");
  await page.getByRole("button", { name: /Yeni hesap/ }).click();
  const dialog = page.getByRole("dialog", { name: /Yeni hesap olu/ });
  await dialog.getByLabel(/Hesap kodu/).fill("100.01");
  await dialog.getByLabel(/Hesap ad/).fill("TEST Alt Kasa");
  await dialog.getByLabel(/st hesap/).selectOption("parent-1");
  await dialog.getByRole("button", { name: /Hesab.*kaydet/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("TEST Alt Kasa")).toBeVisible();
  expect(calls.some((call) => call.method === "POST" && call.body?.includes("100.01") && call.body.includes("parent-1"))).toBe(true);
  await page.getByRole("button", { name: /Varl/ }).first().click();
  await expect(page.getByText("TEST Alt Kasa")).toBeVisible();
});

test("accounting accounts exposes API failure with retry", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/accounting/accounts**", (route) => { requests += 1; return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "controlled accounts failure" } }) }); });
  await login(page);
  await page.goto("/dashboard/accounting/accounts");
  await expect(page.getByRole("heading", { name: /lem tamamlanamad/ })).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("accounting accounts real page has no console or accounting network errors and supports history navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.url().includes("/api/accounting/accounts") && response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  await login(page);
  await page.goto("/dashboard/accounting/accounts");
  await expect(page.getByRole("heading", { name: /Hesap plan/ })).toBeVisible();
  await page.goto("/dashboard/accounting/journal-entries");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/accounting\/accounts$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Hesap plan/ })).toBeVisible();
  expect(failedResponses).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes("favicon"))).toEqual([]);
});
