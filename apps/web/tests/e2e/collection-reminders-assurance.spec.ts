import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page.evaluate(
    async () =>
      (
        (await (
          await fetch("http://localhost:3001/api/auth/me", {
            credentials: "include",
          })
        ).json()) as any
      ).data.tenant.id as string,
  );
}

test("collection reminder list failure is visible and retryable", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/collection-reminders", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "controlled reminder failure" },
      }),
    });
  });
  await login(page);
  await page.goto("/dashboard/collection-reminders");
  await expect(
    page.getByRole("heading", { name: /lem tamamlanamad/ }),
  ).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});

test("status, automation, delete confirmation and create validation work", async ({
  page,
}) => {
  let tenantId = "";
  let reminder: any = {
    id: "rem-1",
    tenantId: "",
    invoiceId: "inv-1",
    contactId: "contact-1",
    dueDate: "2026-10-02T00:00:00.000Z",
    remindAt: "2026-09-29T00:00:00.000Z",
    amount: 1000,
    status: "PENDING",
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    invoice: { id: "inv-1", number: "TEST-E2E-INV" },
    contact: { id: "contact-1", name: "TEST E2E Cari" },
  };
  await page.route("**/api/collection-reminders**", async (route) => {
    const request = route.request(),
      method = request.method(),
      url = request.url();
    if (url.endsWith("/automation/run"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            generatedAt: new Date().toISOString(),
            scanned: 1,
            createdReminders: 0,
            createdTasks: 0,
            closedReminders: 0,
            items: [],
          },
        }),
      });
    if (method === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: reminder ? [reminder] : [] }),
      });
    if (method === "PATCH") {
      reminder = {
        ...reminder,
        status: "SENT",
        updatedAt: new Date().toISOString(),
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: reminder }),
      });
    }
    reminder = null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  tenantId = await login(page);
  reminder.tenantId = tenantId;
  await page.goto("/dashboard/collection-reminders");
  await expect(page.getByText("TEST-E2E-INV")).toBeVisible();
  await page.getByRole("button", { name: /TEST-E2E-INV gönderildi/ }).click();
  await expect(page.getByText("Gönderildi")).toBeVisible();
  await page.getByRole("button", { name: "Otomasyonu Calistir" }).click();
  await expect(page.getByText("Taranan")).toBeVisible();
  await page.getByRole("button", { name: "Yeni Hatırlatıcı" }).click();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Fatura seçiniz")).toBeVisible();
  await page.getByRole("button", { name: "İptal" }).click();
  await page.getByRole("button", { name: "TEST-E2E-INV sil" }).click();
  await expect(page.getByText(/kalıcı olarak silinecek/)).toBeVisible();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(page.getByText("Henüz hatırlatma kurulmamış")).toBeVisible();
});

test("real collection reminders page survives refresh and history without module errors", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/collection-reminders") && r.status() >= 400)
      failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await login(page);
  await page.goto("/dashboard/collection-reminders");
  await expect(
    page.getByRole("heading", { name: "Tahsilat Hatırlatıcıları" }),
  ).toBeVisible();
  await page.goto("/dashboard/payments");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/collection-reminders/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tahsilat Hatırlatıcıları" }),
  ).toBeVisible();
  expect(failed).toEqual([]);
  expect(
    errors.filter(
      (x) =>
        !x.includes("favicon") &&
        !x.includes("502 (Bad Gateway)") &&
        !x.includes("currency-rates"),
    ),
  ).toEqual([]);
});
