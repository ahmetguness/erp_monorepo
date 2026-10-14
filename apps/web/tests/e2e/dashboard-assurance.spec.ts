import { expect, test, type Page, type Route } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
  await page.getByRole("textbox", { name: "Şifre", exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("dashboard loads all tabs, metrics and cross-module links without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(page.getByText("Yönetici Özeti")).toBeVisible();
  await expect(page.getByLabel("Altı aylık satış trendi")).toBeVisible();
  await expect(page.getByText("Gelir & Gider Trendi")).toBeVisible();
  await expect(page.getByText("Son Faturalar")).toBeVisible();
  await expect(page.getByText("Cari Bakiye Özeti")).toBeVisible();

  await page.getByRole("button", { name: "Genel Bakış" }).click();
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();

  await page.getByRole("button", { name: "Operasyon", exact: true }).click();
  await expect(page.getByRole("heading", { name: /stok uyar/i })).toBeVisible();

  await page.getByRole("button", { name: "Ekip", exact: true }).click();
  await expect(page.getByText("Görevlerim")).toBeVisible();
  await expect(page.getByText("Bildirimler", { exact: true })).toBeVisible();
  await expect(page.getByText("Bekleyen Onaylar")).toBeVisible();

  await page.getByRole("button", { name: "Genel Bakış", exact: true }).click();
  const moduleLink = page.getByRole("link", { name: /İş emirleri|Siparişler/ }).first();
  if (await moduleLink.count()) {
    const href = await moduleLink.getAttribute("href");
    expect(href).toMatch(/^\/dashboard\//);
  }
  expect(errors.filter((message) => !message.includes("favicon"))).toEqual([]);
});

test("partial dashboard API failure is disclosed and retry by reload recovers", async ({ page }) => {
  await login(page);
  let fail = true;
  const failOnce = (route: Route) => fail
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "TEST_E2E" }) })
    : route.continue();
  await page.route("**/api/reports/revenue-summary**", failOnce);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Gösterilen toplamlar eksik olabilir" })).toBeVisible();
  fail = false;
  await page.reload();
  await expect(page.getByText("Yönetici Özeti")).toBeVisible();
});

test("unauthenticated dashboard navigation is redirected to login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
