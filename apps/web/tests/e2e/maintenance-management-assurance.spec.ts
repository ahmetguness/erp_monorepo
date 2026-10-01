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
const payload = {
  data: {
    summary: {
      horizonDays: 90,
      assetCount: 3,
      duePlanCount: 2,
      overduePlanCount: 1,
      openFaultCount: 1,
      waitingPartFaultCount: 1,
      sparePartLinkCount: 1,
      lowStockPartCount: 1,
    },
    plans: [
      {
        id: "asset-1",
        asset: {
          id: "asset-1",
          name: "TEST Bakim Makinesi",
          brand: "Marka",
          model: "M1",
          serialNo: "SN1",
        },
        contact: { id: "c1", code: "C1", name: "TEST Musteri" },
        nextDueAt: "2026-09-20T00:00:00.000Z",
        lastServiceAt: null,
        status: "overdue",
        openFaultCount: 1,
        recommendedAction: "Acik ariza ile birlikte bakim planla",
      },
    ],
    faults: [
      {
        id: "sr-1",
        number: "TEST-SR-1",
        asset: {
          id: "asset-1",
          name: "TEST Bakim Makinesi",
          brand: "Marka",
          model: "M1",
          serialNo: "SN1",
        },
        contact: { id: "c1", code: "C1", name: "TEST Musteri" },
        subject: "Kritik ariza",
        status: "waiting_parts",
        priority: "critical",
        createdAt: "2026-10-01T00:00:00.000Z",
        sparePartCount: 1,
        href: "/dashboard/service/requests/sr-1",
      },
    ],
    spareParts: [
      {
        id: "item-1",
        serviceRequestId: "sr-1",
        serviceRequestNumber: "TEST-SR-1",
        asset: {
          id: "asset-1",
          name: "TEST Bakim Makinesi",
          brand: "Marka",
          model: "M1",
          serialNo: "SN1",
        },
        product: { id: "p1", code: "PART-1", name: "Test Parca" },
        description: "Test Parca",
        quantity: 4,
        availableQty: 3,
        risk: "low_stock",
      },
    ],
  },
};
test("maintenance dashboard renders all panels, changes horizon, refreshes and navigates", async ({
  page,
}) => {
  const urls: string[] = [];
  await page.route("**/api/service/maintenance**", async (route) => {
    urls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  await login(page);
  await page.goto("/dashboard/service/maintenance");
  await expect(
    page.getByRole("heading", { name: /Bak.m y.netimi/ }),
  ).toBeVisible();
  await expect(page.getByText("TEST Bakim Makinesi").first()).toBeVisible();
  await expect(page.getByText("Kritik ariza")).toBeVisible();
  await expect(page.getByText("Test Parca")).toBeVisible();
  await expect(page.getByText(/1 geciken bak.m/)).toBeVisible();
  await page.getByRole("combobox").selectOption("180");
  await expect
    .poll(() => urls.some((url) => url.includes("horizonDays=180")))
    .toBe(true);
  const before = urls.length;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect.poll(() => urls.length).toBeGreaterThan(before);
  await page.getByText("Kritik ariza").click();
  await expect(page).toHaveURL(/\/dashboard\/service\/requests\/sr-1$/);
});
test("maintenance dashboard exposes recoverable API error", async ({
  page,
}) => {
  await page.route("**/api/service/maintenance**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "controlled" } }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/service/maintenance");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
});
