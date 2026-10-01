import { test, expect, type Page } from "@playwright/test";
async function login(p: Page) {
  await p.goto("/login");
  await p.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await p.getByRole("textbox", { name: /ifre/, exact: true }).fill("demo1234");
  await p.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(p).toHaveURL(/\/dashboard$/);
}
const job = {
  id: "sr-1",
  number: "TEST-MOBILE-1",
  subject: "TEST Saha Isi",
  status: "IN_PROGRESS",
  priority: "CRITICAL",
  assignedToId: "tech",
  contact: {
    id: "c",
    code: "C",
    name: "TEST Musteri",
    phone: "555",
    address: "Test Sokak",
    city: "Istanbul",
  },
  asset: null,
  createdAt: "2026-10-01T00:00:00Z",
  routeStop: {
    serviceRequestId: "sr-1",
    serviceRequestNumber: "TEST-MOBILE-1",
    sequence: 1,
    title: "TEST Saha Isi",
    address: "Test Sokak",
    city: "Istanbul",
    contactPhone: "555",
  },
  photoCount: 1,
  signatureCount: 0,
  serviceFormSubmitted: false,
  customerApproved: false,
  offlineReady: true,
  pendingSyncCount: 2,
  lastOfflineSyncAt: null,
  steps: [
    {
      key: "assignment",
      label: "Teknisyen atama",
      status: "complete",
      detail: "ok",
    },
    { key: "route", label: "Rota", status: "complete", detail: "ok" },
    { key: "photos", label: "Fotograf", status: "complete", detail: "1" },
    { key: "signature", label: "Imza", status: "pending", detail: "0" },
    {
      key: "service_form",
      label: "Servis formu",
      status: "pending",
      detail: "bekliyor",
    },
    {
      key: "customer_approval",
      label: "Musteri onayi",
      status: "blocked",
      detail: "bekliyor",
    },
  ],
  href: "/dashboard/service/requests/sr-1",
};
const payload = {
  data: {
    summary: {
      totalJobs: 1,
      assignedJobCount: 1,
      routeReadyCount: 1,
      photoReadyCount: 1,
      signatureReadyCount: 0,
      formSubmittedCount: 0,
      customerApprovedCount: 0,
      offlineReadyCount: 1,
      pendingSyncCount: 2,
    },
    route: [job.routeStop],
    jobs: [job],
  },
};
test("mobile flow renders, refreshes, submits checkpoints and navigates", async ({
  page,
}) => {
  const methods: string[] = [];
  await page.route("**/api/service/mobile-flow**", async (r) => {
    methods.push(r.request().method());
    if (r.request().method() === "POST")
      return r.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "a1" } }),
      });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  await login(page);
  await page.goto("/dashboard/service/mobile-flow");
  await expect(page.getByText("TEST Saha Isi").first()).toBeVisible();
  await expect(page.getByText("2 kuyruk").first()).toBeVisible();
  const before = methods.length;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect.poll(() => methods.length).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Form" }).click();
  await page.getByLabel(/M.*teri ad/).fill("Ayşe");
  await page.getByLabel("Not").fill("Türkçe servis notu");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect.poll(() => methods.filter((x) => x === "POST").length).toBe(1);
  await page
    .locator("button")
    .filter({ hasText: "TEST-MOBILE-1" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard\/service\/requests\/sr-1$/);
});
test("mobile flow exposes recoverable API error", async ({ page }) => {
  await page.route("**/api/service/mobile-flow**", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled" } }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/service/mobile-flow");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
});
