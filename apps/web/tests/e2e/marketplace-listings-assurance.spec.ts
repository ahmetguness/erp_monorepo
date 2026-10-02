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
async function tenantId() {
  const r = await fetch("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: "admin@axondemo.com",
      password: "demo1234",
      tenantSlug: "axon-demo",
    }),
  });
  return ((await r.json()) as any).data.tenant.id as string;
}
test("marketplace listings renders, refreshes, edits and deletes", async ({
  page,
}) => {
  const tid = await tenantId();
  let row: any = {
    id: "listing-1",
    tenantId: tid,
    integrationId: "int-1",
    productId: "product-1",
    externalId: "TEST_E2E_BARCODE",
    externalSku: "TEST_E2E_SKU",
    price: 120,
    stock: 7,
    isActive: true,
    lastSyncAt: null,
    syncError: null,
    product: {
      id: "product-1",
      code: "TEST_P",
      name: "TEST_E2E_LISTING_PRODUCT",
      salesPrice: 120,
    },
    integration: { id: "int-1", channel: "TRENDYOL", name: "TEST CHANNEL" },
  };
  const calls: any[] = [];
  await page.route("**/api/marketplace/listings**", async (route) => {
    const req = route.request();
    calls.push({ method: req.method(), body: req.postData() });
    if (req.method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: row ? [row] : [],
          meta: {
            total: row ? 1 : 0,
            page: 1,
            pageSize: 20,
            totalPages: row ? 1 : 0,
          },
        }),
      });
    if (req.method() === "PATCH") {
      row = { ...row, price: 135, stock: 8 };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: row }),
      });
    }
    if (req.method() === "DELETE") {
      row = null;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { success: true } }),
      });
    }
    return route.fallback();
  });
  await page.route("**/api/marketplace/integrations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: { total: 0, page: 1, pageSize: 200, totalPages: 0 },
      }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/marketplace/listings");
  await expect(page.getByText("TEST_E2E_LISTING_PRODUCT")).toBeVisible();
  await expect(page.getByText("TEST_E2E_BARCODE")).toBeVisible();
  const before = calls.filter((x) => x.method === "GET").length;
  await page.getByRole("button", { name: /Yenile/ }).click();
  await expect
    .poll(() => calls.filter((x) => x.method === "GET").length)
    .toBeGreaterThan(before);
  await page.getByTitle("ERP kaydını düzenle").click();
  const dialog = page.getByRole("dialog", { name: "ERP Fiyat / Stok" });
  await dialog.getByRole("spinbutton", { name: "Fiyat" }).fill("135");
  await dialog.getByRole("spinbutton", { name: "Stok" }).fill("8");
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (x) => x.method === "PATCH" && x.body?.includes('"price":135'),
      ),
    )
    .toBe(true);
  await page.getByTitle("ERP kaydını sil").click();
  await expect.poll(() => calls.some((x) => x.method === "DELETE")).toBe(true);
});
test("marketplace listings exposes API failure with retry", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/marketplace/listings**", (route) => {
    requests++;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled listing failure" },
      }),
    });
  });
  await page.route("**/api/marketplace/integrations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/products**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: { total: 0, page: 1, pageSize: 200, totalPages: 0 },
      }),
    }),
  );
  await login(page);
  await page.goto("/dashboard/marketplace/listings");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});
