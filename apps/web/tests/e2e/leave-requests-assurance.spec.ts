import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("leave request API error is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/hr/leave-requests?*", async (route) => {
    requests += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "controlled leave failure" } }) });
  });
  await login(page);
  await page.goto("/dashboard/hr/leave-requests");
  await expect(page.getByRole("heading", { name: /lem tamamlanamad/ })).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("leave workflow requires confirmation and supports filters/history", async ({ page }) => {
  let approved = false;
  let approveCalls = 0;
  await page.route("**/api/hr/leave-requests**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().includes("/approve")) {
      approveCalls += 1; approved = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "leave-1", status: "APPROVED" } }) });
    }
    const row = { id: "leave-1", employeeId: "employee-1", type: "ANNUAL", status: approved ? "APPROVED" : "PENDING", startDate: "2026-11-01T00:00:00.000Z", endDate: "2026-11-03T00:00:00.000Z", days: 3, notes: null, approvedBy: null, approvedAt: null, createdAt: "2026-10-01T00:00:00.000Z", employee: { id: "employee-1", firstName: "TEST_E2E", lastName: "Personel", department: "Ar-Ge", position: "Uzman" } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [row], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } }) });
  });
  await login(page);
  await page.goto("/dashboard/hr/leave-requests");
  await expect(page.getByText("TEST_E2E Personel")).toBeVisible();
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByRole("heading", { name: "İzin talebini onayla" })).toBeVisible();
  expect(approveCalls).toBe(0);
  await page.getByRole("button", { name: "Onayla" }).last().click();
  await expect.poll(() => approveCalls).toBe(1);
  await page.getByRole("button", { name: /Onayl/ }).first().click();
  await page.goto("/dashboard"); await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/hr\/leave-requests/);
  await page.reload();
  await expect(page.getByText("TEST_E2E Personel")).toBeVisible();
});
