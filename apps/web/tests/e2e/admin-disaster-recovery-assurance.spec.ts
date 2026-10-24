import { expect, test, type Page, type Route } from "./fixtures/test";

const manager = { id: "admin-dr", email: "dr@test.local", name: "DR Admin", permissions: ["operations.read", "operations.manage", "tenant.read"] };
const reader = { ...manager, id: "admin-dr-reader", permissions: ["operations.read", "tenant.read"] };
const now = "2026-10-13T08:00:00.000Z";
const backup = { id: "backup-1", providerRef: "TEST_E2E_DR_BACKUP", status: "SUCCESS", sizeBytes: "1073741824", encrypted: true, encryptionKeyRef: "kms-test", region: "eu-central-1", replicaRegion: "eu-west-1", replicationLagSeconds: 12, startedAt: "2026-10-13T07:50:00.000Z", completedAt: now, recordedAt: now };
const drill = { id: "drill-1", backupId: backup.id, status: "RUNNING", environment: "dr-validation", runbookUrl: "https://runbooks.example/dr", approvalId: "APR-1", requestedById: manager.id, startedAt: now, completedAt: null, recoveryPointAt: null, actualRpoMinutes: null, actualRtoMinutes: null, notes: null, createdAt: now };
const overview = { policy: { targetRpoMinutes: 60, targetRtoMinutes: 240, maxReplicationLagSeconds: 300 }, health: "DEGRADED", lastSuccessfulBackup: backup, latestBackup: backup, lastRestoreDrill: null, backups: [backup], restoreDrills: [drill] };
const tenant = { id: "tenant-1", slug: "test-e2e-dr", companyName: "TEST_E2E_DR_TENANT", email: "dr-tenant@test.local", plan: "STARTER", status: "ACTIVE", createdAt: now, updatedAt: now, _count: { users: 1, products: 0, invoices: 0, contacts: 0 } };
const deployment = { settings: { environmentName: "production", releaseChannel: "stable", backupEnabled: true, backupFrequency: "daily", backupRetentionDays: 30, backupLastRunAt: null, backupLastStatus: null, maintenanceWindow: "Sun 02:00" }, snapshot: { tenant: { id: tenant.id, companyName: tenant.companyName, plan: "STARTER", deploymentType: "CLOUD" }, environment: { name: "production", nodeEnv: "development", appRole: "api", releaseChannel: "stable", version: "1.0.0", maintenanceWindow: "Sun 02:00" }, backup: { enabled: true, frequency: "daily", retentionDays: 30, lastRunAt: null, lastStatus: null }, health: { status: "warn", checks: [{ key: "backup", label: "Yedek", status: "warn", message: "Son koşum bekleniyor." }] }, migrations: { pendingMigrations: [], latestMigration: "migration", appliedMigrations: 95, checkedAt: now }, generatedAt: now } };

function json(route: Route, body: unknown, status = 200) { return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }
async function login(page: Page, identity = manager) {
  await page.route("**/api/admin/**", (route) => json(route, { data: [] }));
  await page.route("**/api/admin/auth/login", (route) => json(route, { data: { status: "AUTHENTICATED", admin: identity } }));
  await page.route("**/api/admin/auth/me", (route) => json(route, { data: identity }));
  await page.route("**/api/admin/ui-preferences", (route) => json(route, { data: { locale: "tr-TR", highContrast: false, reduceMotion: false, density: "COMFORTABLE" } }));
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(identity.email);
  await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
}
async function mockReads(page: Page) {
  await page.route("**/api/admin/disaster-recovery", (route) => json(route, { data: overview }));
  await page.route("**/api/admin/tenants?**", (route) => json(route, { data: [tenant], meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 } }));
  await page.route("**/api/admin/tenants/tenant-1/deployment-operations", (route) => json(route, { data: deployment }));
}

test("overview, health, evidence and read-only permission rendering work", async ({ page }) => {
  await login(page, reader); await mockReads(page); await page.goto("/admin/disaster-recovery");
  await expect(page.getByRole("heading", { name: "Yedekleme ve Felaket Kurtarma" })).toBeVisible();
  await expect(page.getByText("Sağlık: DEGRADED")).toBeVisible();
  await expect(page.getByText("TEST_E2E_DR_BACKUP").first()).toBeVisible();
  await expect(page.getByText("1.00 GB").first()).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^TEST_E2E_DR_TENANT$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yedek Kanıtı Kaydet" })).toHaveCount(0);
  await page.getByRole("button", { name: "Yenile" }).last().click();
});

test("manager can submit backup, restore lifecycle and tenant deployment actions", async ({ page }) => {
  await login(page); await mockReads(page);
  const writes: string[] = [];
  await page.route("**/api/admin/disaster-recovery/backups", async (route) => { writes.push("backup"); return json(route, { data: backup }, 201); });
  await page.route("**/api/admin/disaster-recovery/restore-drills", async (route) => { writes.push("drill"); return json(route, { data: drill }, 201); });
  await page.route("**/api/admin/disaster-recovery/restore-drills/drill-1", async (route) => { writes.push("result"); return json(route, { data: { ...drill, status: "PASSED", completedAt: now } }); });
  await page.route("**/api/admin/tenants/tenant-1/deployment-operations/backup-simulation", async (route) => { writes.push("simulation"); return json(route, { data: { lastRunAt: now, lastStatus: "success", snapshot: deployment.snapshot } }); });
  await page.route("**/api/admin/tenants/tenant-1/deployment-operations", async (route) => route.request().method() === "PUT" ? (writes.push("settings"), json(route, { data: { success: true } })) : json(route, { data: deployment }));
  await page.goto("/admin/disaster-recovery");
  await page.getByPlaceholder("Provider referansı").fill("TEST_E2E_DR_NEW");
  await page.getByPlaceholder("Boyut (byte)").fill("1024");
  await page.getByPlaceholder("Ana bölge").fill("eu-central-1");
  await page.getByPlaceholder("KMS anahtar referansı").fill("kms-test");
  const dates = page.locator('input[type="datetime-local"]');
  await dates.nth(0).fill("2026-10-13T10:00"); await dates.nth(1).fill("2026-10-13T10:10");
  const backupPanel = page.getByRole("heading", { name: "Yedek Kanıtı Kaydet" }).locator("..");
  await backupPanel.getByRole("button", { name: "Kaydet", exact: true }).click();
  const drillPanel = page.getByRole("heading", { name: "İzole Restore Tatbikatı" }).locator("..");
  await drillPanel.getByRole("combobox").selectOption("backup-1");
  await page.getByPlaceholder("https://runbook...").fill("https://runbooks.example/dr");
  await page.getByPlaceholder("Onay kimliği").fill("APR-1");
  await page.getByRole("button", { name: "Tatbikatı Başlat" }).click();
  const resultPanel = page.getByRole("heading", { name: "Tatbikat Sonucu Doğrula" }).locator("..");
  await resultPanel.getByRole("combobox").first().selectOption("drill-1");
  await dates.nth(2).fill("2026-10-13T09:50");
  await page.getByPlaceholder("Gerçek RPO (dk)").fill("10"); await page.getByPlaceholder("Gerçek RTO (dk)").fill("20");
  await page.getByPlaceholder("Doğrulama notu").fill("İzole restore veri bütünlüğü doğrulandı");
  await page.getByRole("button", { name: "Sonucu Kaydet" }).click();
  await page.getByRole("button", { name: "Yedek testi" }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Yedek doğrulama simülasyonu tamamlandı.' })).toBeVisible();
  const deploymentForm = page.getByLabel("Ortam adı").locator("..");
  await page.getByLabel("Ortam adı").fill("dr-test"); await deploymentForm.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => writes.sort()).toEqual(["backup", "drill", "result", "settings", "simulation"]);
});

test("overview, mutation and tenant-list errors are explicit", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/disaster-recovery", (route) => json(route, { error: { message: "overview failed" } }, 500));
  await page.route("**/api/admin/tenants?**", (route) => json(route, { error: { message: "tenant failed" } }, 500));
  await page.goto("/admin/disaster-recovery");
  await expect(page.getByText(/Felaket kurtarma görünümü yüklenemedi/)).toBeVisible();
  await expect(page.getByText("Tenant listesi alınamadı.")).toBeVisible();
});

test("mutation rejection is shown instead of failing silently", async ({ page }) => {
  await login(page); await mockReads(page);
  await page.route("**/api/admin/disaster-recovery/backups", (route) => json(route, { error: { message: "validation failed" } }, 400));
  await page.goto("/admin/disaster-recovery");
  await page.getByPlaceholder("Provider referansı").fill("BAD");
  const backupPanel = page.getByRole("heading", { name: "Yedek Kanıtı Kaydet" }).locator("..");
  await backupPanel.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText(/İşlem tamamlanamadı/)).toBeVisible();
});
