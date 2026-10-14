import { expect, test, type Page, type Route } from "@playwright/test";

const entry = { id: "audit-1", actor: { id: "admin-1", name: "Test Admin", email: "admin@test.invalid" }, action: "UPDATE", module: "TENANTS", targetType: "tenant", targetId: "tenant-1", outcome: "SUCCESS", reason: "TEST_E2E_AUDIT", approvalId: "approval-1", ipAddress: "127.0.0.1", device: "playwright", requestId: "request-1", correlationId: "correlation-1", changes: [{ field: "status", before: "ACTIVE", after: "SUSPENDED" }], previousHash: null, hash: "a".repeat(64), retentionUntil: "2033-10-13T00:00:00.000Z", createdAt: "2026-10-13T10:00:00.000Z" };
const pageData = { data: [entry], meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 }, integrity: { valid: true, checked: 1, brokenAtId: null }, retentionDays: 2555 };
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function login(page: Page, permissions = ["audit.read", "audit.manage"]) {
  const admin = { id: "admin-1", email: "admin@test.invalid", name: "Test Admin", permissions, mfaEnabled: true };
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

test("audit list, filters, detail, exports and retention work", async ({ page }) => {
  await login(page);
  const requests: string[] = [];
  await page.route("**/api/admin/audit-logs**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); requests.push(`${request.method()} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/export")) return route.fulfill({ status: 200, contentType: "text/csv", body: "id\r\naudit-1" });
    if (url.pathname.endsWith("/retention")) return json(route, { data: { retentionDays: 2190 } });
    return json(route, pageData);
  });
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Platform Denetim Kayıtları" })).toBeVisible();
  await expect(page.getByText("Kriptografik zincir sağlam")).toBeVisible();
  await page.getByPlaceholder("Modül").fill("TENANTS");
  await expect.poll(() => requests.some((item) => item.includes("module=TENANTS"))).toBe(true);
  await page.getByText("TENANTS · UPDATE").click();
  await expect(page.getByText("Denetim detayı ve alan farkı")).toBeVisible();
  await expect(page.getByText("SUSPENDED")).toBeVisible();
  await page.getByRole("button", { name: "Kapat" }).click();
  await page.getByRole("button", { name: "CSV İndir" }).click();
  await page.getByRole("button", { name: "JSON İndir" }).click();
  await expect.poll(() => requests.some((item) => item.includes("/export") && item.includes("format=csv"))).toBe(true);
  await expect.poll(() => requests.some((item) => item.includes("/export") && item.includes("format=json"))).toBe(true);
  await page.getByLabel("Saklama süresi (gün)").fill("2190");
  await page.getByRole("button", { name: "Saklamayı güncelle" }).click();
  await expect.poll(() => requests.some((item) => item === "PUT /api/admin/audit-logs/retention")).toBe(true);
});

test("read-only admin cannot manage retention", async ({ page }) => {
  await login(page, ["audit.read"]);
  await page.route("**/api/admin/audit-logs**", (route) => json(route, pageData));
  await page.goto("/admin/audit");
  await expect(page.getByRole("button", { name: "Saklamayı güncelle" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CSV İndir" })).toBeVisible();
});

test("empty state is explicit", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/audit-logs**", async (route) => {
    return json(route, { ...pageData, data: [], meta: { ...pageData.meta, total: 0 } });
  });
  await page.goto("/admin/audit");
  await expect(page.getByText("Filtrelerle eşleşen denetim kaydı bulunamadı.")).toBeVisible();
});

test("loading, API retry and integrity failure are rendered correctly", async ({ page }) => {
  await login(page);
  let calls = 0;
  await page.route("**/api/admin/audit-logs**", async (route) => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return json(route, { error: { message: "temporary" } }, 500);
    }
    return json(route, { ...pageData, integrity: { valid: false, checked: 1, brokenAtId: entry.id } });
  });
  await page.goto("/admin/audit");
  await expect(page.getByRole("status")).toContainText("yükleniyor");
  await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(1);
  await expect(page.getByText("Bozuk", { exact: true })).toBeVisible();
  await expect(page.getByText("Bozulma tespit edildi")).toBeVisible();
});

test("retention mutation failure is explicit", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/audit-logs**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/retention")) return json(route, { error: { message: "failed" } }, 500);
    return json(route, pageData);
  });
  await page.goto("/admin/audit");
  await page.getByLabel("Saklama süresi (gün)").fill("2190");
  await page.getByRole("button", { name: "Saklamayı güncelle" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Saklama politikası güncellenemedi" })).toBeVisible();
});
