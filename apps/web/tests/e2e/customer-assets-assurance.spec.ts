import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const asset = {
  id: "asset-1",
  contactId: "contact-1",
  name: "TEST_E2E Türkçe Cihaz",
  brand: "Marka",
  model: "Model",
  serialNo: "SN-001",
  purchaseDate: "2026-01-01T00:00:00.000Z",
  warrantyEnd: "2027-01-01T00:00:00.000Z",
  notes: "Test notu",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  contact: { id: "contact-1", name: "TEST Müşteri", code: "C-1" },
  _count: { serviceRequests: 2 },
};

test("customer assets list, detail, create, refresh, pagination and delete work", async ({
  page,
}) => {
  const requests: Array<{ method: string; url: string; body: string | null }> =
    [];
  await page.route("**/api/contacts**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "contact-1", name: "TEST Müşteri", code: "C-1" }],
        meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
      }),
    }),
  );
  await page.route("**/api/attachments**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/entity-images**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/service/assets**", async (route) => {
    const request = route.request();
    requests.push({
      method: request.method(),
      url: request.url(),
      body: request.postData(),
    });
    if (request.method() === "POST")
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: asset }),
      });
    if (request.method() === "DELETE")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { success: true } }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [asset],
        meta: { total: 21, page: 1, pageSize: 20, totalPages: 2 },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/service/assets");
  await expect(page.getByText("TEST_E2E Türkçe Cihaz")).toBeVisible();
  await expect(page.getByText("SN-001")).toBeVisible();
  await page.getByLabel("Detay").click();
  await expect(page.getByText("Test notu")).toBeVisible();
  await page.getByRole("button", { name: "Kapat", exact: true }).last().click();
  await page.getByRole("button", { name: /Yeni varlık/ }).click();
  await expect(page.getByRole("button", { name: "Oluştur" })).toBeDisabled();
  await page.getByLabel("Varlık adı").fill("Yeni Cihaz");
  await page.getByPlaceholder(/Cari ara/).click();
  await page.getByRole("button", { name: /C-1.*TEST Müşteri/ }).click();
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect
    .poll(() =>
      requests.some(
        (entry) =>
          entry.method === "POST" && entry.body?.includes("Yeni Cihaz"),
      ),
    )
    .toBe(true);
  const before = requests.length;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(before);
  await page.getByLabel("Sil").click();
  await expect
    .poll(() => requests.some((entry) => entry.method === "DELETE"))
    .toBe(true);
});

test("customer assets exposes a recoverable API error instead of an empty table", async ({
  page,
}) => {
  await page.route("**/api/service/assets**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled asset failure" } }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/service/assets");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
});
