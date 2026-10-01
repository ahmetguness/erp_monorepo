import { test, expect, type Page } from "@playwright/test";
async function login(p: Page) {
  await p.goto("/login");
  await p.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await p.getByRole("textbox", { name: /ifre/, exact: true }).fill("demo1234");
  await p.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(p).toHaveURL(/\/dashboard$/);
}
const row = {
  id: "sr-1",
  number: "TEST-SR-1",
  subject: "TEST Türkçe Arıza",
  description: "Açıklama",
  status: "OPEN",
  priority: "CRITICAL",
  assignedToId: null,
  warrantyEnd: null,
  closedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  contact: { id: "c1", name: "TEST Müşteri", code: "C1" },
  customerAsset: {
    id: "a1",
    name: "TEST Makine",
    brand: "B",
    model: "M",
    serialNo: "SN",
  },
  _count: { items: 1, activities: 1 },
  sla: { isBreached: true, remainingMinutes: -10 },
};
test("service request list filters, creates, refreshes and navigates", async ({
  page,
}) => {
  const urls: string[] = [],
    methods: string[] = [];
  await page.route("**/api/service/requests**", async (r) => {
    urls.push(r.request().url());
    methods.push(r.request().method());
    if (r.request().method() === "POST")
      return r.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: row }),
      });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [row],
        meta: { total: 21, page: 1, pageSize: 20, totalPages: 2 },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/service/requests");
  await expect(page.getByText("TEST Türkçe Arıza")).toBeVisible();
  await page.getByRole("button", { name: "Açık", exact: true }).click();
  await expect
    .poll(() => urls.some((x) => x.includes("status=OPEN")))
    .toBe(true);
  await page.getByRole("combobox").first().selectOption("CRITICAL");
  await expect
    .poll(() => urls.some((x) => x.includes("priority=CRITICAL")))
    .toBe(true);
  await page.getByRole("button", { name: "Yeni talep" }).click();
  await expect(page.getByRole("button", { name: "Oluştur" })).toBeDisabled();
  await page.getByLabel("Konu").fill("Yeni Türkçe Talep");
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect.poll(() => methods.includes("POST")).toBe(true);
  const before = urls.length;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect.poll(() => urls.length).toBeGreaterThan(before);
  await page.getByLabel("Detay").click();
  await expect(page).toHaveURL(/\/dashboard\/service\/requests\/sr-1$/);
});
test("service request detail changes status and exposes related data", async ({
  page,
}) => {
  const methods: string[] = [];
  await page.route("**/api/service/requests/sr-1**", async (r) => {
    methods.push(r.request().method());
    if (r.request().method() === "POST")
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...row, status: "IN_PROGRESS" } }),
      });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          ...row,
          items: [
            {
              id: "i1",
              description: "Parça",
              quantity: 2,
              unitPrice: 10,
              lineTotal: 20,
              product: { id: "p", code: "P1", name: "Parça" },
            },
          ],
          activities: [
            {
              id: "ac1",
              activityType: "NOTE",
              notes: "Test notu",
              createdAt: "2026-10-01T00:00:00Z",
            },
          ],
          history: [],
        },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/service/requests/sr-1");
  await expect(page.getByText("TEST-SR-1 — TEST Türkçe Arıza")).toBeVisible();
  await expect(page.getByText("Test notu")).toBeVisible();
  await page.getByRole("button", { name: /Başlat/ }).click();
  await expect.poll(() => methods.includes("POST")).toBe(true);
});
test("service request list and detail expose recoverable API errors", async ({
  page,
}) => {
  await page.route("**/api/service/requests**", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled" } }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/service/requests");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  await page.goto("/dashboard/service/requests/missing");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
});
