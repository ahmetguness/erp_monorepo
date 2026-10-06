import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "wizard", key: "wizard_completed", value: "true" }],
      }),
    }),
  );
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test("bulk operations preview, execute, reset, import analysis and API errors work", async ({
  page,
}) => {
  let previewCalls = 0;
  let executeCalls = 0;
  let analyzeCalls = 0;
  let profileCalls = 0;
  let failPreview = false;
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const result = (mode: "preview" | "execute") => ({
    data: {
      batchId: `batch-${mode}`,
      target: "contacts",
      mode,
      dryRun: mode === "preview",
      field: "city",
      totalRequested: 2,
      matched: 1,
      changed: 1,
      skipped: 0,
      missingIds: ["missing-id"],
      changes: [
        {
          id: "contact-1",
          label: "TEST_E2E_BULK_UI",
          field: "city",
          oldValue: "Ankara",
          newValue: "İstanbul",
          changed: true,
        },
      ],
      rollbackLogId: mode === "execute" ? "audit-1" : null,
      auditLogId: mode === "execute" ? "audit-1" : null,
      auditHref:
        mode === "execute"
          ? "/dashboard/settings/audit-log?selected=audit-1"
          : null,
      rollbackStrategy: {
        type: "audit_snapshot",
        available: true,
        label: "Snapshot",
        description: "TEST rollback",
        auditLogId: mode === "execute" ? "audit-1" : null,
      },
    },
  });
  await page.route("**/api/bulk-operations/contacts/preview", async (route) => {
    previewCalls++;
    await route.fulfill(
      failPreview
        ? {
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: { message: "controlled preview error" },
            }),
          }
        : {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(result("preview")),
          },
    );
  });
  await page.route("**/api/bulk-operations/contacts/execute", async (route) => {
    executeCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result("execute")),
    });
  });
  await page.route("**/api/bulk-operations/imports/analyze", async (route) => {
    analyzeCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          fingerprint: "cariadi|sehir|vergino",
          profile: null,
          mappings: [
            {
              source: "Cari Adı",
              target: "name",
              confidence: 0.9,
              learned: false,
            },
            {
              source: "Vergi No",
              target: "taxNumber",
              confidence: 0.9,
              learned: false,
            },
            {
              source: "Şehir",
              target: "city",
              confidence: 0.9,
              learned: false,
            },
          ],
          normalizedRows: [
            { name: "Örnek Ltd", taxNumber: "1234567890", city: "İstanbul" },
          ],
          issues: [
            {
              row: 1,
              column: "Cari Adı",
              severity: "auto_fixed",
              code: "NORMALIZED_VALUE",
              message: "normalize",
            },
          ],
          summary: {
            totalRows: 1,
            autoFixed: 1,
            reviewRequired: 0,
            duplicateCandidates: 0,
            unchangedRows: 0,
          },
          execution: {
            strategy: "background_resumable",
            chunkSize: 500,
            deltaImport: false,
            resumeSupported: false,
            status: "planning_only",
          },
        },
      }),
    });
  });
  await page.route("**/api/bulk-operations/imports/profiles", async (route) => {
    profileCalls++;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "profile-1",
          name: "TEST_E2E profile",
          target: "contacts",
          fingerprint: "cariadi|sehir|vergino",
          mappings: [],
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await login(page);
  await page.goto("/dashboard/bulk-operations");
  await expect(
    page.getByRole("heading", { level: 1, name: /Toplu/ }),
  ).toBeVisible();
  await expect(page.getByText(/Ak.*aktarma/).first()).toBeVisible();
  const ids = page.locator("textarea").nth(1);
  await ids.fill("contact-1\nmissing-id");
  await page.getByLabel(/Yeni de/).selectOption("false");
  await page.getByLabel(/Alan/).selectOption("city");
  await page.getByLabel(/Yeni de/).fill(" İstanbul ");
  await page.getByRole("button", { name: /Onizle|nizle/ }).click();
  await expect.poll(() => previewCalls).toBe(1);
  await expect(page.getByText("TEST_E2E_BULK_UI")).toBeVisible();
  await expect(page.getByText(/1 eksik ID/)).toBeVisible();
  await page.getByRole("button", { name: /venli g/ }).click();
  await expect.poll(() => executeCalls).toBe(1);
  await expect(page.getByText(/Rollback log: audit-1/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Audit/ })).toHaveAttribute(
    "href",
    "/dashboard/settings/audit-log?selected=audit-1",
  );

  await page.getByRole("button", { name: /Temizle/ }).click();
  await expect(ids).toHaveValue("");
  await page.getByRole("button", { name: /analiz et/ }).click();
  await expect.poll(() => analyzeCalls).toBe(1);
  await expect(page.getByText(/Worker bekleniyor/)).toBeVisible();
  await page.getByLabel(/Profil ad/).fill("TEST_E2E profile");
  await page.getByRole("button", { name: /ren/ }).click();
  await expect.poll(() => profileCalls).toBe(1);

  failPreview = true;
  await ids.fill("contact-1");
  await page.getByRole("button", { name: /Onizle|nizle/ }).click();
  await expect.poll(() => previewCalls).toBe(2);
  await expect(
    page.getByRole("alert").filter({ hasText: /Sunucu hatası/ }),
  ).toBeVisible();
  expect(consoleErrors.filter((item) => !item.includes("400"))).toEqual([]);
});
