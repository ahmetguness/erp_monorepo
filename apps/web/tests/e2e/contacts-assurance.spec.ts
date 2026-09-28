import { test, expect, request } from "@playwright/test";

const marker = `TEST_E2E_CONTACT_${Date.now()}`;

test("contacts UI and API assurance flow", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );

  await page.goto("/login");
  await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
  await page.getByLabel("Şifre", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/dashboard/contacts");
  await expect(
    page.getByRole("heading", { name: /Cari Hesaplar/ }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Müşteri");

  const anonymousContext = await request.newContext();
  const unauthenticated = await anonymousContext.get(
    "http://localhost:3001/api/contacts",
  );
  expect(unauthenticated.status()).toBe(401);
  await anonymousContext.dispose();

  const created = await page.evaluate(async (name) => {
    const response = await fetch("http://localhost:3001/api/contacts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "BOTH",
        name,
        code: name,
        email: "test+contact@example.com",
        phone: "+90 555 000 00 00",
        creditLimit: 1250.5,
        paymentTermDays: 30,
        tags: ["VIP", "İzmir"],
      }),
    });
    return { status: response.status, body: await response.json() };
  }, marker);
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;

  await page.reload();
  const search = page.getByPlaceholder(/Ad, kod/);
  await search.fill(marker);
  await expect(page.locator("body")).toContainText(marker);
  await page.goto(`/dashboard/contacts/${id}`);
  await expect(page.locator("body")).toContainText(marker);
  await expect(page.locator("body")).toContainText("1.250,50");
  await expect(page.getByLabel("Cari etiketleri")).toContainText("VIP");
  await expect(page.getByLabel("Cari etiketleri")).toContainText("İzmir");
  await page.reload();
  await expect(page.getByLabel("Cari etiketleri")).toContainText("İzmir");
  await page.goto(`/dashboard/contacts/${id}/edit`);
  await expect(page.locator("body")).toContainText("VIP");
  await expect(page.locator("body")).toContainText("İzmir");

  const updated = await page.evaluate(
    async ({ id, name }) => {
      const response = await fetch(`http://localhost:3001/api/contacts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${name}_UPDATED`, paymentTermDays: 45 }),
      });
      return { status: response.status, body: await response.json() };
    },
    { id, name: marker },
  );
  expect(updated.status).toBe(200);
  expect(updated.body.data.paymentTermDays).toBe(45);

  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const removed = await page.evaluate(async (id) => {
    const response = await fetch(`http://localhost:3001/api/contacts/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    return response.status;
  }, id);
  expect(removed).toBe(200);
  const afterDelete = await page.evaluate(
    async (id) =>
      (
        await fetch(`http://localhost:3001/api/contacts/${id}`, {
          credentials: "include",
        })
      ).status,
    id,
  );
  expect(afterDelete).toBe(404);
});
