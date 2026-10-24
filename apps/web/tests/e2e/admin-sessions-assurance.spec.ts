import { expect, test, type Page, type Route } from "./fixtures/test";

const admin = { id: "admin-session", email: "sessions@test.invalid", name: "Session Admin", permissions: [], mfaEnabled: true };
const now = "2026-10-14T09:00:00.000Z";
const sessions = [
  { id: "current", deviceName: "Chrome Windows", ipAddress: "127.0.0.1", createdAt: now, lastSeenAt: now, expiresAt: "2026-10-15T09:00:00.000Z", rememberMe: false, current: true, reauthenticationExpiresAt: "2026-10-15T09:00:00.000Z" },
  { id: "remote", deviceName: "Mobile Safari", ipAddress: "10.0.0.2", createdAt: now, lastSeenAt: now, expiresAt: "2026-11-14T09:00:00.000Z", rememberMe: true, current: false, reauthenticationExpiresAt: "2026-10-15T09:00:00.000Z" },
];
const events = [{ id: "event-1", type: "ADMIN_SESSION_REVOKED", message: "TEST_E2E session revoked", ipAddress: "127.0.0.1", createdAt: now }];
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function login(page: Page) {
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

test("lists devices, events, refresh and revokes remote/all sessions", async ({ page }) => {
  await login(page);
  const calls: string[] = [];
  await page.route("**/api/admin/auth/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/me")) return json(route, { data: admin });
    if (request.method() === "GET") return json(route, { data: path.endsWith("security-events") ? events : sessions });
    calls.push(`${request.method()} ${path}`);
    return json(route, { data: { success: true } });
  });
  await page.goto("/admin/sessions");
  await expect(page.getByText("Chrome Windows").last()).toBeVisible();
  await expect(page.getByText("Mobile Safari")).toBeVisible();
  await expect(page.getByText("TEST_E2E session revoked").last()).toBeVisible();
  await page.getByRole("button", { name: /Yenile/ }).click();
  await page.getByRole("button", { name: /Oturumu Kapat/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sonland/ }).click();
  await expect.poll(() => calls).toContain("DELETE /api/admin/auth/sessions/remote");
  await page.getByRole("button", { name: /T.m Cihazlardan/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /T.m Oturumlar/ }).click();
  await expect.poll(() => calls).toContain("POST /api/admin/auth/revoke-all");
});

test("reauth form validates, toggles password and submits", async ({ page }) => {
  await login(page);
  const calls: string[] = [];
  await page.route("**/api/admin/auth/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/me")) return json(route, { data: admin });
    if (request.method() === "GET") return json(route, { data: path.endsWith("security-events") ? [] : sessions });
    calls.push(path);
    return json(route, { data: { success: true, reauthenticationExpiresAt: new Date(Date.now() + 86_400_000).toISOString() } });
  });
  await page.goto("/admin/sessions?reauth=1");
  const password = page.locator('input[type="password"]');
  await expect(password).toBeFocused();
  await password.fill("password-123");
  await page.getByPlaceholder("123456").fill("12ab3456");
  await expect(page.getByPlaceholder("123456")).toHaveValue("1234");
  await page.getByPlaceholder("123456").fill("123456");
  await page.getByRole("button", { name: /Do.rula.*Yetkilendir/ }).click();
  await expect.poll(() => calls).toContain("/api/admin/auth/reauthenticate");
  await expect(page.getByText(/Ba.ar.yla Do.ruland/)).toBeVisible();
});

test("sessions error retry and events empty state render", async ({ page }) => {
  await login(page);
  let ok = false;
  await page.route("**/api/admin/auth/sessions", (route) => json(route, ok ? { data: [] } : { error: "temporary" }, ok ? 200 : 500));
  await page.route("**/api/admin/auth/security-events", (route) => json(route, { data: [] }));
  await page.goto("/admin/sessions");
  await expect(page.getByText(/listesi y.klenemedi/)).toBeVisible();
  ok = true;
  await page.getByRole("button", { name: /Tekrar Dene/ }).click();
  await expect(page.getByText(/aktif oturum bulunamad/)).toBeVisible();
  await expect(page.getByText(/Ola.and.*uyar/)).toBeVisible();
});

test("current session close uses confirmation warning", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/auth/sessions", (route) => route.request().method() === "GET" ? json(route, { data: [sessions[0]] }) : json(route, { data: { success: true } }));
  await page.route("**/api/admin/auth/security-events", (route) => json(route, { data: [] }));
  await page.goto("/admin/sessions");
  await expect(page.getByText("Chrome Windows").last()).toBeVisible();
  await page.getByRole("region", { name: /Y.netim paneli i.eri.i/ }).getByRole("button", { name: /k.*Yap/, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(/ge.erli oturumunuzu/);
  await expect(page.getByRole("dialog").getByRole("button", { name: /k.*Yap/ })).toBeVisible();
});
