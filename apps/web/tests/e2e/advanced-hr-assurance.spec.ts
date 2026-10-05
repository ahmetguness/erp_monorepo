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

test("advanced HR API error is visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/hr/advanced", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled HR failure" } }),
    });
  });
  await login(page);
  await page.goto("/dashboard/hr/advanced");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("advanced HR renders every derived section and refreshes", async ({
  page,
}) => {
  let requests = 0;
  const employee = {
    id: "employee-1",
    fullName: "TEST_E2E İpek Çalışkan",
    department: "Mühendislik",
    position: "Geliştirici",
  };
  await page.route("**/api/hr/advanced", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          summary: {
            employeeCount: 1,
            departmentCount: 1,
            reviewMissingCount: 0,
            trainingMissingCount: 0,
            assetMissingCount: 0,
            expenseAdvancePendingCount: 1,
            organizationNodeCount: 3,
          },
          performanceReviews: [
            {
              employee,
              status: "scheduled",
              openActionCount: 1,
              lastReviewAt: "2026-04-01T00:00:00.000Z",
              nextReviewAt: "2026-09-28T00:00:00.000Z",
            },
          ],
          trainingMatrix: [
            {
              employee,
              status: "complete",
              completedCount: 1,
              plannedCount: 1,
              missingTopics: [],
            },
          ],
          assetAssignments: [
            {
              employee,
              status: "assigned",
              assetCount: 1,
              documentCount: 1,
              lastAssignedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
          expenseAdvances: [
            {
              employee,
              type: "expense",
              status: "pending",
              openActionCount: 1,
              documentCount: 0,
              nextDueAt: "2026-10-10T00:00:00.000Z",
              lastDocumentAt: null,
            },
          ],
          organization: [
            {
              id: "department:Mühendislik",
              parentId: null,
              label: "Mühendislik",
              type: "department",
              employeeCount: 1,
            },
            {
              id: "position:Geliştirici",
              parentId: "department:Mühendislik",
              label: "Geliştirici",
              type: "position",
              employeeCount: 1,
            },
            {
              id: "employee:employee-1",
              parentId: "position:Geliştirici",
              label: employee.fullName,
              type: "employee",
              employeeCount: 1,
            },
          ],
        },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/hr/advanced");
  await expect(
    page.getByRole("heading", { name: /Gelismis IK/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Performans/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Egitim Matrisi/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Zimmet/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Masraf ve Avans/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Organizasyon/ }),
  ).toBeVisible();
  await expect(page.getByText(employee.fullName).first()).toBeVisible();
  await expect(page.getByText("Aksiyon bekliyor")).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("real advanced HR page supports refresh and browser history without module errors", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/hr/advanced") && response.status() >= 400)
      failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await login(page);
  await page.goto("/dashboard/hr/advanced");
  await expect(
    page.getByRole("heading", { name: /Gelismis IK/ }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/hr\/advanced/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Gelismis IK/ }),
  ).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    errors.filter(
      (value) =>
        !value.includes("favicon") &&
        !value.includes("currency-rates") &&
        !value.includes("502 (Bad Gateway)"),
    ),
  ).toEqual([]);
});
