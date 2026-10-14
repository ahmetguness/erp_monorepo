import { expect, test, type Page, type Route } from "@playwright/test";

const manager = { id: "admin-manager", email: "manager@test.invalid", name: "Test Manager", permissions: ["admin-user.read", "admin-user.manage"], mfaEnabled: true };
const users = [
  { id: manager.id, name: manager.name, email: manager.email, isActive: true, mfaEnabled: true, roles: ["SUPER_ADMIN"], lastLoginAt: "2026-10-14T08:00:00.000Z", failedLoginCount: 0, lastFailedLoginAt: null, activeSessionCount: 2, invitationExpiresAt: null, invitationStatus: "ACCEPTED" },
  { id: "admin-pending", name: "TEST_E2E Pending", email: "pending@test.invalid", isActive: false, mfaEnabled: false, roles: ["SUPPORT"], lastLoginAt: null, failedLoginCount: 1, lastFailedLoginAt: "2026-10-14T07:00:00.000Z", activeSessionCount: 0, invitationExpiresAt: "2026-10-15T08:00:00.000Z", invitationStatus: "PENDING" },
];
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function login(page: Page, permissions = manager.permissions) {
  const admin = { ...manager, permissions };
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/login")) return json(route, { data: { status: "AUTHENTICATED", admin } });
    if (path.endsWith("/auth/me")) return json(route, { data: admin });
    if (path.endsWith("/ui-preferences")) return json(route, { data: { locale: "tr-TR", highContrast: false, reduceMotion: false, density: "COMFORTABLE" } });
    return json(route, { data: [] });
  });
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(admin.email);
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}

test("list metrics, combined filters and reset are consistent", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/admin-users", (route) => json(route, { data: users }));
  await page.goto("/admin/admin-users");
  await expect(page.getByText("TEST_E2E Pending")).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  await page.getByPlaceholder(/posta ile ara/).fill("pending@test.invalid");
  await page.locator("select").nth(0).selectOption("SUPPORT");
  await page.locator("select").nth(1).selectOption("MFA_DISABLED");
  await expect(page.locator("h3", { hasText: "Test Manager" })).toHaveCount(0);
  await expect(page.getByText("TEST_E2E Pending")).toBeVisible();
  await page.getByRole("button", { name: /Filtreleri Temizle/ }).click();
  await expect(page.locator("h3", { hasText: "Test Manager" })).toBeVisible();
});

test("API error retry and empty state are explicit", async ({ page }) => {
  await login(page);
  let calls = 0;
  let recover = false;
  await page.route("**/api/admin/admin-users", (route) => { calls += 1; return json(route, recover ? { data: [] } : { error: "temporary" }, recover ? 200 : 500); });
  await page.goto("/admin/admin-users");
  await expect(page.getByText(/listesi y.klenemedi/)).toBeVisible();
  recover = true;
  await page.getByRole("button", { name: /Tekrar Dene/i }).click();
  await expect(page.getByText(/uygun y.netici bulunamad/)).toBeVisible();
});

test("manager can invite, edit and revoke sessions", async ({ page }) => {
  await login(page);
  const mutations: string[] = [];
  await page.route("**/api/admin/admin-users**", (route) => {
    const request = route.request();
    if (request.method() !== "GET") { mutations.push(`${request.method()} ${new URL(request.url()).pathname}`); return json(route, { data: { success: true } }, request.method() === "POST" ? 201 : 200); }
    return json(route, { data: users });
  });
  await page.goto("/admin/admin-users");
  await page.getByRole("button", { name: /Davet Et/ }).click();
  await page.getByPlaceholder(/Ahmet/).fill("TEST_E2E New Admin");
  await page.getByPlaceholder("admin@sirket.com").fill("new-admin@test.invalid");
  await page.getByRole("button", { name: /Davet G/ }).click();
  await expect.poll(() => mutations.some((item) => item.endsWith("/admin-users/invite"))).toBe(true);
  await page.getByText("TEST_E2E Pending").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]").getByRole("button", { name: /Yetki/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /Kaydet/ }).click();
  await expect.poll(() => mutations.some((item) => item === "PATCH /api/admin/admin-users/admin-pending")).toBe(true);
  await page.getByRole("button", { name: /Oturumlar.*Kapat \(2\)/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Oturumlar.*Kapat/ }).click();
  await expect.poll(() => mutations.some((item) => item === "POST /api/admin/admin-users/admin-manager/revoke-sessions")).toBe(true);
  await page.getByRole("button", { name: /Daveti Yenile/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Daveti G/ }).click();
  await expect.poll(() => mutations.filter((item) => item.endsWith("/admin-users/invite")).length).toBe(2);
});

test("read-only view exposes no management controls", async ({ page }) => {
  await login(page, ["admin-user.read"]);
  await page.route("**/api/admin/admin-users", (route) => json(route, { data: users }));
  await page.goto("/admin/admin-users");
  await expect(page.getByText("TEST_E2E Pending")).toBeVisible();
  await expect(page.getByRole("button", { name: /Davet Et/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Yetki/ })).toHaveCount(0);
});
