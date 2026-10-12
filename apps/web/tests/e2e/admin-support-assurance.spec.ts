import { expect, test, type Page, type Route } from "@playwright/test";

const admin = {
  id: "admin-support-1",
  email: "support-admin@example.test",
  name: "Support Admin",
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  roles: ["SUPPORT"],
  permissions: [
    "dashboard.read",
    "tenant.read",
    "support-ticket.read",
    "support-session.manage",
  ],
};
const tenant = {
  id: "tenant-support-1",
  companyName: "TEST_E2E_SUPPORT Türkçe A.Ş.",
  slug: "test-e2e-support",
  plan: "PRO",
  status: "ACTIVE",
};
const target = {
  id: "target-support-1",
  name: "TEST_E2E Hedef",
  email: "hedef@example.test",
};
const session = {
  id: "support-session-1",
  tenantId: tenant.id,
  adminId: admin.id,
  targetUserId: target.id,
  reason: "TEST_E2E güvenli destek incelemesi",
  ticketId: "TCK-TEST-1",
  scopes: ["CONTACTS"],
  expiresAt: "2099-01-01T00:00:00.000Z",
  approvedAt: "2026-10-09T00:00:00.000Z",
  revokedAt: null,
  writeRequested: true,
  writeApprovedAt: "2026-10-09T00:01:00.000Z",
  admin: { name: admin.name, email: admin.email },
  targetUser: target,
};
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function login(page: Page, identity = admin) {
  await page.route("**/api/admin/**", (route) => json(route, { data: [] }));
  await page.route("**/api/admin/auth/login", (route) =>
    json(route, { data: { status: "AUTHENTICATED", admin: identity } }),
  );
  await page.route("**/api/admin/auth/me", (route) =>
    json(route, { data: identity }),
  );
  await page.route("**/api/admin/ui-preferences", (route) =>
    json(route, {
      data: {
        locale: "tr-TR",
        highContrast: false,
        reduceMotion: false,
        density: "COMFORTABLE",
      },
    }),
  );
  await page.route("**/api/admin/metrics", (route) =>
    json(route, {
      data: {
        tenants: { total: 0, active: 0, trial: 0, suspended: 0 },
        plans: { starter: 0, professional: 0, enterprise: 0 },
        totals: { users: 0, products: 0, invoices: 0, payments: 0 },
      },
    }),
  );
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(identity.email);
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("tenant selection and complete support request payload work", async ({
  page,
}) => {
  let request: Record<string, unknown> | undefined;
  const tenantQueries: string[] = [];
  await login(page);
  await page.route("**/api/admin/tenants?**", (route) => {
    tenantQueries.push(route.request().url());
    return json(route, {
      data: [tenant],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    });
  });
  await page.goto("/admin/support");
  await page.getByPlaceholder(/Firma adı/).fill("Türkçe");
  await expect
    .poll(() =>
      tenantQueries.some((url) => url.includes("search=T%C3%BCrk%C3%A7e")),
    )
    .toBe(true);
  await page.getByRole("button", { name: /TEST_E2E_SUPPORT/ }).click();
  await expect(page).toHaveURL(new RegExp(`tenantId=${tenant.id}`));
  await page.route(
    `**/api/admin/tenants/${tenant.id}/support-targets`,
    (route) => json(route, { data: [target] }),
  );
  await page.route("**/api/admin/support-sessions", (route) => {
    request = route.request().postDataJSON();
    return json(route, { data: { success: true } }, 201);
  });
  await page.reload();
  await page.getByRole("combobox").selectOption(target.id);
  await page.getByPlaceholder(/TCK-2026/).fill("TCK-TEST-1");
  await page
    .getByPlaceholder(/Destek oturumu talep/)
    .fill("TEST_E2E güvenli destek incelemesi");
  await page.getByLabel(/Cari Destek Notu/).check();
  await page.getByRole("button", { name: "Destek Oturumu Talep Et" }).click();
  await expect
    .poll(() => request)
    .toEqual(
      expect.objectContaining({
        tenantId: tenant.id,
        targetUserId: target.id,
        ticketId: "TCK-TEST-1",
        durationMinutes: 30,
        scopes: ["CONTACTS"],
        writeRequested: true,
      }),
    );
  await expect(page.getByText(/başarıyla oluşturuldu/)).toBeVisible();
});

test("session list, filtering, scoped viewer and revoke work", async ({
  page,
}) => {
  let revoked = false;
  await login(page);
  await page.route(
    `**/api/admin/tenants/${tenant.id}/support-sessions`,
    (route) => json(route, { data: [session] }),
  );
  await page.route(
    `**/api/admin/tenants/${tenant.id}/support-sessions/${session.id}/revoke`,
    (route) => {
      revoked = true;
      return json(route, { data: { success: true } });
    },
  );
  await page.route("**/api/contacts**", (route) =>
    json(route, {
      data: [
        {
          id: "contact-1",
          name: "TEST_E2E Cari",
          code: "C-1",
          notes: "Güvenli not",
        },
      ],
      meta: { totalPages: 1 },
    }),
  );
  await page.goto(`/admin/support?tenantId=${tenant.id}`);
  await page.getByRole("button", { name: /Tüm Oturumlar/ }).click();
  await page.getByRole("button", { name: /Aktif/ }).click();
  await expect(page.getByText(session.reason)).toBeVisible();
  await page.locator("article button").first().click();
  await expect(page.getByText("TEST_E2E Cari")).toBeVisible();
  await page.getByRole("button", { name: /Oturum Listesine Dön/ }).click();
  await page.getByRole("button", { name: "Sonlandır" }).click();
  await expect.poll(() => revoked).toBe(true);
});

test("admin without manage permission is redirected before support data loads", async ({
  page,
}) => {
  const reader = {
    ...admin,
    id: "reader",
    permissions: ["dashboard.read", "tenant.read"],
  };
  await login(page, reader);
  await page.goto(`/admin/support?tenantId=${tenant.id}`);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("button", { name: "Destek Oturumu Talep Et" }),
  ).toHaveCount(0);
});
