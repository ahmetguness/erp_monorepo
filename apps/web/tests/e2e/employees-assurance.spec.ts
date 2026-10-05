import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("employee list API error is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route(/\/api\/hr\/employees\?(?!.*departments)/, async (route) => {
    requests += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "controlled employee failure" } }) });
  });
  await login(page);
  await page.goto("/dashboard/hr/employees");
  await expect(page.getByRole("heading", { name: /lem tamamlanamad/ })).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("employee page supports filters, confirmation, refresh and history", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/hr/employees") && response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await login(page);
  await page.goto("/dashboard/hr/employees");
  await expect(page.getByRole("heading", { name: "Personel" })).toBeVisible();
  await expect(page.getByLabel("Personel ara")).toBeVisible();
  await expect(page.getByLabel("Departman filtresi")).toBeVisible();
  await expect(page.getByLabel("Durum filtresi")).toBeVisible();
  const deleteButton = page.getByRole("button", { name: /personelini sil/ }).first();
  const editButton = page.getByRole("button", { name: /personelini duzenle/ }).first();
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
    await expect(page.getByRole("heading", { name: "Personeli Duzenle" })).toBeVisible();
    await page.getByRole("button", { name: /ptal/ }).click();
  }
  if (await deleteButton.isVisible().catch(() => false)) {
    await deleteButton.click();
    await expect(page.getByRole("heading", { name: "Personeli sil" })).toBeVisible();
    await page.getByRole("button", { name: /ptal/ }).click();
  }
  await page.goto("/dashboard");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/hr\/employees/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Personel" })).toBeVisible();
  expect(failed).toEqual([]);
});
