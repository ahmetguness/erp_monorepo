import { expect, test, type Page, type Route } from "./fixtures/test";

const admin = {
  id: "admin-pilot",
  email: "pilot-admin@test.local",
  name: "Pilot Admin",
  permissions: ["operations.read", "tenant.read"],
};
const tenants = [
  { id: "tenant-a", slug: "test-e2e-pilot-a", companyName: "TEST_E2E_PILOT A", email: "a@test.local", plan: "STARTER", status: "ACTIVE", createdAt: "2026-10-13T08:00:00.000Z", updatedAt: "2026-10-13T08:00:00.000Z", _count: { users: 1, products: 0, invoices: 0, contacts: 0 } },
  { id: "tenant-b", slug: "test-e2e-pilot-b", companyName: "TEST_E2E_PILOT B", email: "b@test.local", plan: "PROFESSIONAL", status: "TRIAL", createdAt: "2026-10-13T08:00:00.000Z", updatedAt: "2026-10-13T08:00:00.000Z", _count: { users: 1, products: 0, invoices: 0, contacts: 0 } },
];
const checks = [
  { key: "stock_integrity", label: "Stok bütünlüğü", status: "PASS", detail: "Temiz", evidence: ["Negatif stok seviyesi: 0", "Tenant-çapraz stok seviyesi: 0"] },
  { key: "retry_safety", label: "Retry ve idempotency güvenliği", status: "FAIL", detail: "Kanıt eksik", evidence: ["PILOT_RETRY_VERIFIED_AT eksik veya geçersiz."] },
  { key: "tenant_isolation", label: "Tenant izolasyonu", status: "FAIL", detail: "Kanıt eksik", evidence: ["Tenant-çapraz fatura: 0", "Tenant-çapraz stok: 0"] },
  { key: "deterministic_flow", label: "Deterministik pilot akışı", status: "FAIL", detail: "Koşu eksik", evidence: ["Başarılı koşu: 0/3"] },
] as const;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}
async function login(page: Page) {
  await page.route("**/api/admin/**", (route) => json(route, { data: [] }));
  await page.route("**/api/admin/auth/login", (route) => json(route, { data: { status: "AUTHENTICATED", admin } }));
  await page.route("**/api/admin/auth/me", (route) => json(route, { data: admin }));
  await page.route("**/api/admin/ui-preferences", (route) => json(route, { data: { locale: "tr-TR", highContrast: false, reduceMotion: false, density: "COMFORTABLE" } }));
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(admin.email);
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
function readiness(tenant = tenants[0]) {
  return { tenant, report: { decision: "NO_GO", generatedAt: "2026-10-13T09:00:00.000Z", checks, blockers: ["retry_safety", "tenant_isolation", "deterministic_flow"] } };
}

test("tenant selection, search, decision evidence and refresh work", async ({ page }) => {
  await login(page);
  let listCalls = 0;
  let readinessCalls = 0;
  let selectedId = "";
  await page.route("**/api/admin/tenants?**", (route) => {
    listCalls += 1;
    const search = new URL(route.request().url()).searchParams.get("search");
    const data = search ? tenants.filter((item) => item.companyName.includes(search.toUpperCase())) : tenants;
    return json(route, { data, meta: { total: data.length, page: 1, pageSize: 50, totalPages: 1 } });
  });
  await page.route(/\/api\/admin\/tenants\/[^/]+\/pilot-readiness$/, (route) => {
    readinessCalls += 1;
    selectedId = route.request().url().match(/tenants\/([^/]+)\/pilot-readiness/)?.[1] ?? "";
    const tenant = tenants.find((item) => item.id === selectedId) ?? tenants[0];
    return json(route, { data: readiness(tenant) });
  });
  await page.goto("/admin/pilot-readiness");
  await expect(page.getByRole("heading", { name: "Pilot GO / NO-GO" })).toBeVisible();
  await expect(page.getByText("NO-GO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1/4 kontrol başarılı")).toBeVisible();
  await expect(page.getByText("3 blokaj:")).toBeVisible();
  await expect(page.getByText("Negatif stok seviyesi: 0")).toBeVisible();
  await page.getByLabel("Değerlendirilecek tenant").selectOption("tenant-b");
  await expect(page.getByRole("heading", { name: "TEST_E2E_PILOT B" })).toBeVisible();
  expect(selectedId).toBe("tenant-b");
  await page.getByRole("button", { name: "Yeniden değerlendir" }).click();
  await expect.poll(() => readinessCalls).toBeGreaterThan(2);
  await page.getByPlaceholder("Şirket adı, slug veya e-posta").fill("pilot b");
  await expect.poll(() => listCalls).toBeGreaterThan(1);
});

test("tenant list error is explicit and retry recovers", async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route("**/api/admin/tenants?**", (route) => json(route, failing ? { error: { message: "tenant list failed" } } : { data: tenants, meta: { total: 2, page: 1, pageSize: 50, totalPages: 1 } }, failing ? 500 : 200));
  await page.route(/\/api\/admin\/tenants\/[^/]+\/pilot-readiness$/, (route) => json(route, { data: readiness() }));
  await page.goto("/admin/pilot-readiness");
  await expect(page.getByText("Tenant listesi alınamadı")).toBeVisible();
  await expect(page.getByText("Değerlendirmek için bir tenant seçin.")).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByRole("heading", { name: "TEST_E2E_PILOT A" })).toBeVisible();
});

test("readiness error fails closed and header retry recovers", async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route("**/api/admin/tenants?**", (route) => json(route, { data: [tenants[0]], meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 } }));
  await page.route(/\/api\/admin\/tenants\/[^/]+\/pilot-readiness$/, (route) => json(route, failing ? { error: { message: "evidence failed" } } : { data: readiness() }, failing ? 500 : 200));
  await page.goto("/admin/pilot-readiness");
  await expect(page.getByText("Hazırlık verisi alınamadı")).toBeVisible();
  await expect(page.getByText(/NO-GO kabul edilmelidir/)).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Yeniden değerlendir" }).click();
  await expect(page.getByText("1/4 kontrol başarılı")).toBeVisible();
});

test("empty tenant result disables evaluation", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/tenants?**", (route) => json(route, { data: [], meta: { total: 0, page: 1, pageSize: 50, totalPages: 0 } }));
  await page.goto("/admin/pilot-readiness");
  await expect(page.getByLabel("Değerlendirilecek tenant")).toBeDisabled();
  await expect(page.getByLabel("Değerlendirilecek tenant")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Yeniden değerlendir" })).toBeDisabled();
  await expect(page.getByText("Değerlendirmek için bir tenant seçin.")).toBeVisible();
});
