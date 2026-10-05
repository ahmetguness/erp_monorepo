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

test("mail list error is visible and retryable", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/mail?*", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled mail error" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/mail");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = calls;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => calls).toBeGreaterThan(before);
});

test("mail compose deduplicates recipients and sends one bulk request", async ({
  page,
}) => {
  let bulkPayload: any;
  await page.route("**/api/mail**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/mail/bulk") {
      bulkPayload = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          sent: 1,
          failed: 0,
          results: [
            { to: "recipient@example.test", success: true, id: "mock-1" },
          ],
        }),
      });
    }
    if (url.pathname === "/api/mail/summary")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            total: 0,
            outboundCount: 0,
            inboundCount: 0,
            pendingCount: 0,
            sentCount: 0,
            failedCount: 0,
            attachmentCount: 0,
            recipientCount: 0,
            lastSentAt: null,
            lastFailureAt: null,
          },
        }),
      });
    if (url.pathname === "/api/mail/templates/lifecycle")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            total: 0,
            systemCount: 0,
            tenantCount: 0,
            approvedTenantCount: 0,
            draftTenantCount: 0,
            latestTenantVersion: 0,
            variableSchemaCount: 0,
            requiredVariableCount: 0,
          },
        }),
      });
    if (url.pathname === "/api/mail/templates")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    if (url.pathname === "/api/mail" || url.pathname === "/api/mail/")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
        }),
      });
    return route.continue();
  });
  await login(page);
  await page.goto("/dashboard/mail");
  await page.getByRole("button", { name: /Toplu mail/ }).click();
  await page
    .getByPlaceholder("ornek@sirket.com")
    .fill("recipient@example.test\nRECIPIENT@example.test");
  await page
    .getByText("Konu", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("TEST_E2E_MAIL konu");
  await page.locator("textarea").nth(1).fill("TEST_E2E_MAIL içerik");
  await page.getByRole("button", { name: /1 al.*g.*nder/ }).click();
  await expect.poll(() => bulkPayload).toBeTruthy();
  expect(bulkPayload.recipients).toEqual(["recipient@example.test"]);
  expect(bulkPayload.html).toContain("TEST_E2E_MAIL");
});
