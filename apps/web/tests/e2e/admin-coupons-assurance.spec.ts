import { expect, test, type Page, type Route } from "@playwright/test";

const admin = {
  id: "admin-coupon",
  email: "coupon-admin@example.test",
  name: "Coupon Admin",
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  roles: ["SUPER_ADMIN"],
  permissions: ["tenant.read", "tenant.plan.update"],
};
const baseCoupon = {
  id: "coupon-1",
  code: "TEST_E2E_COUPON_10",
  percent: 10,
  plan: "STARTER",
  expiresAt: "2027-12-31T23:59:00.000Z",
  maxRedemptions: 10,
  redemptionCount: 1,
  isActive: true,
  description: "Türkçe kampanya",
  createdAt: "2026-10-12T00:00:00.000Z",
  _count: { discounts: 1 },
  discounts: [
    {
      id: "discount-1",
      tenantId: "tenant-1",
      couponId: "coupon-1",
      createdAt: "2026-10-12T00:00:00.000Z",
      expiresAt: "2027-12-31T23:59:00.000Z",
      tenant: {
        id: "tenant-1",
        companyName: "TEST_E2E Tenant",
        slug: "test-e2e",
        plan: "STARTER",
        status: "ACTIVE",
      },
    },
  ],
};
const cors = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,idempotency-key",
};

async function json(route: Route, body: unknown, status = 200) {
  if (route.request().method() === "OPTIONS")
    return route.fulfill({ status: 204, headers: cors });
  return route.fulfill({
    status,
    headers: cors,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function login(page: Page) {
  await page.route("**/api/admin/auth/login**", (route) =>
    json(route, { data: { status: "AUTHENTICATED", admin } }),
  );
  await page.route("**/api/admin/auth/me**", (route) =>
    json(route, { data: admin }),
  );
  await page.route("**/api/admin/ui-preferences**", (route) =>
    json(route, {
      data: {
        locale: "tr-TR",
        highContrast: false,
        reduceMotion: false,
        density: "COMFORTABLE",
      },
    }),
  );
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(admin.email);
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("coupon list, tenant relation, search, plan/status filters and status mutation work", async ({
  page,
}) => {
  let coupon = structuredClone(baseCoupon);
  await login(page);
  await page.route("**/api/admin/billing/coupons", (route) =>
    json(route, { data: [coupon] }),
  );
  await page.route(
    "**/api/admin/billing/coupons/coupon-1/status**",
    async (route) => {
      if (route.request().method() === "OPTIONS") return json(route, {});
      coupon.isActive = Boolean(
        (await route.request().postDataJSON()).isActive,
      );
      return json(route, { data: { success: true } });
    },
  );
  await page.goto("/admin/coupons");
  await expect(page.getByText("TEST_E2E_COUPON_10")).toBeVisible();
  await expect(page.getByText("TEST_E2E Tenant")).toBeVisible();
  await page.getByPlaceholder(/Kupon kodu/).fill("bulunmayan");
  await expect(page.getByText("Filtre sonucu bulunamadı")).toBeVisible();
  await page.getByPlaceholder(/Kupon kodu/).fill("Türkçe");
  await expect(page.getByText("TEST_E2E_COUPON_10")).toBeVisible();
  await page.getByRole("button", { name: "Devre Dışı Bırak" }).click();
  await expect(
    page.getByRole("button", { name: "Yeniden Etkinleştir" }),
  ).toBeVisible();
});

test("coupon create sends normalized complete payload and refreshes the list", async ({
  page,
}) => {
  const coupons: Array<Record<string, unknown>> = [];
  let payload: Record<string, unknown> | undefined;
  await login(page);
  await page.route("**/api/admin/billing/coupons", async (route: Route) => {
    if (route.request().method() === "POST") {
      payload = await route.request().postDataJSON();
      const created = {
        ...baseCoupon,
        id: "coupon-created",
        code: payload?.code,
        percent: payload?.percent,
        plan: payload?.plan,
        maxRedemptions: payload?.maxRedemptions,
        description: payload?.description,
        expiresAt: payload?.expiresAt,
        redemptionCount: 0,
        _count: { discounts: 0 },
        discounts: [],
      };
      coupons.push(created);
      return json(route, { data: created }, 201);
    }
    return json(route, { data: coupons });
  });
  await page.goto("/admin/coupons");
  await page.getByRole("button", { name: "Yeni Kupon" }).click();
  await page.getByPlaceholder("SUMMER25").fill("test_e2e_coupon_25");
  await page.locator('input[type="number"]').nth(0).fill("25");
  await page
    .locator("form")
    .getByRole("button", { name: "Professional" })
    .click();
  await page.locator('input[type="number"]').nth(1).fill("5");
  await page.getByPlaceholder(/Kampanya adı/).fill('TEST_E2E Türkçe, "özel"');
  await page.getByRole("button", { name: "Kuponu Oluştur" }).click();
  await expect.poll(() => payload?.code).toBe("TEST_E2E_COUPON_25");
  expect(payload).toMatchObject({
    percent: 25,
    plan: "PROFESSIONAL",
    maxRedemptions: 5,
    description: 'TEST_E2E Türkçe, "özel"',
  });
  await expect(page.getByText("TEST_E2E_COUPON_25")).toBeVisible();
});

test("coupon list exposes API error and recovers with retry", async ({
  page,
}) => {
  let failing = true;
  await login(page);
  await page.route("**/api/admin/billing/coupons", (route) =>
    json(
      route,
      failing
        ? {
            error: {
              code: "INTERNAL_ERROR",
              message: "controlled coupon list error",
            },
          }
        : { data: [baseCoupon] },
      failing ? 500 : 200,
    ),
  );
  await page.goto("/admin/coupons");
  await expect(page.getByText("controlled coupon list error")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect(page.getByText("TEST_E2E_COUPON_10")).toBeVisible();
});
