import { expect, test, type Page, type Route } from "@playwright/test";

const admin = { id: "security-admin", email: "security@test.invalid", name: "Security Admin", permissions: ["security.read", "security.manage"], mfaEnabled: true };
const finding = { id: "finding-1", key: "TEST_E2E_SECURITY", title: "TEST_E2E TLS Türkçe", category: "TRANSPORT", severity: "CRITICAL", status: "OPEN", verificationStatus: "FAIL", owner: null, remediation: "HTTPS yapılandırmasını tamamlayın.", evidence: ["HTTPS kanıtı bulunamadı"], ticketId: null, firstSeenAt: "2026-10-14T08:00:00.000Z", lastSeenAt: "2026-10-14T09:00:00.000Z", verifiedAt: null, resolvedAt: null };
const warning = { ...finding, id: "finding-2", key: "TEST_E2E_CSP", title: "TEST_E2E CSP", category: "HTTP_SECURITY", severity: "HIGH", verificationStatus: "WARN", evidence: ["CSP inceleme gerekli"] };
const center = { summary: { status: "FAIL", total: 2, passing: 0, warning: 1, failing: 1, open: 2, lastScannedAt: "2026-10-14T09:00:00.000Z" }, findings: [finding, warning] };
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function login(page: Page, permissions = admin.permissions) {
  const current = { ...admin, permissions };
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/login")) return json(route, { data: { status: "AUTHENTICATED", admin: current } });
    if (path.endsWith("/auth/me")) return json(route, { data: current });
    if (path.endsWith("/ui-preferences")) return json(route, { data: { locale: "tr-TR", highContrast: false, reduceMotion: false, density: "COMFORTABLE" } });
    return json(route, { data: [] });
  });
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(current.email);
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}

test("summary, evidence and combined filters render consistently", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/security/findings", (route) => json(route, { data: center }));
  await page.goto("/admin/security");
  await expect(page.getByText("TEST_E2E TLS Türkçe")).toBeVisible();
  await expect(page.getByText("HTTPS kanıtı bulunamadı")).toBeVisible();
  await page.locator("select").nth(0).selectOption("WARN");
  await page.locator("select").nth(1).selectOption("HTTP_SECURITY");
  await expect(page.getByText("TEST_E2E CSP")).toBeVisible();
  await expect(page.getByText("TEST_E2E TLS Türkçe")).toHaveCount(0);
  await expect(page.getByText(/G.r.nt.lenen: 1 bulgu/)).toBeVisible();
});

test("manager scan, ownership and ticket actions call correct APIs", async ({ page }) => {
  await login(page);
  const mutations: string[] = [];
  await page.route("**/api/admin/security/**", (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return json(route, { data: center });
    mutations.push(`${request.method()} ${path}`);
    if (path.endsWith("/scan")) return json(route, { data: center });
    return json(route, { data: { ...finding, owner: "Security Operations", ticketId: path.endsWith("/ticket") ? "SEC-1" : null } }, path.endsWith("/ticket") ? 201 : 200);
  });
  await page.goto("/admin/security");
  await page.getByRole("button", { name: /Taramay.*al/ }).click();
  await expect.poll(() => mutations).toContain("POST /api/admin/security/scan");
  const card = page.getByRole("article").filter({ hasText: "TEST_E2E TLS Türkçe" });
  await card.getByPlaceholder(/Sahip ekip/).fill("Security Operations");
  await card.getByRole("button", { name: /Sahibi Kaydet/ }).click();
  await card.getByRole("button", { name: /Ticket Olu/ }).click();
  await expect.poll(() => mutations.some((item) => item === "PATCH /api/admin/security/findings/finding-1")).toBe(true);
  await expect.poll(() => mutations.some((item) => item === "POST /api/admin/security/findings/finding-1/ticket")).toBe(true);
});

test("read-only admin has evidence but no mutation controls", async ({ page }) => {
  await login(page, ["security.read"]);
  await page.route("**/api/admin/security/findings", (route) => json(route, { data: center }));
  await page.goto("/admin/security");
  await expect(page.getByText("TEST_E2E TLS Türkçe")).toBeVisible();
  await expect(page.getByRole("button", { name: /Taramay.*al/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sahibi Kaydet/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ticket Olu/ })).toHaveCount(0);
});

test("API error retry recovers and empty state is explicit", async ({ page }) => {
  await login(page);
  let recover = false;
  await page.route("**/api/admin/security/findings", (route) => json(route, recover ? { data: { ...center, summary: { ...center.summary, total: 0 }, findings: [] } } : { error: "temporary" }, recover ? 200 : 500));
  await page.goto("/admin/security");
  await expect(page.getByRole("alert").filter({ hasText: /y.klenemedi/ })).toBeVisible();
  recover = true;
  await page.getByRole("button", { name: /Tekrar Dene/ }).click();
  await expect(page.getByText(/bulgular.*olu.turmak/)).toBeVisible();
});
