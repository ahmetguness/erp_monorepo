import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("lot serial create, server search, filters, pagination and traceability", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_LOT_UI_${Date.now()}`;
  const consoleErrors: string[] = [],
    networkFailures: string[] = [];
  let productId = "",
    batchId = "";
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("lot-serials"))
      networkFailures.push(request.url());
  });
  page.on("response", (response) => {
    if (response.url().includes("lot-serials") && response.status() >= 500)
      networkFailures.push(`${response.status()} ${response.url()}`);
  });
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: "axon-demo" },
    });
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Türkçe Ürün`,
      },
    });
    productId = product.id;
    const batch = await prisma.productBatch.create({
      data: {
        tenantId: tenant.id,
        productId,
        batchNumber: `${marker}_B`,
        quantity: 30,
      },
    });
    batchId = batch.id;
    await prisma.lotSerialNumber.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        tenantId: tenant.id,
        productId,
        batchId,
        serialNumber: `${marker}_NOISE_${index}`,
        isUsed: index === 0,
        usedAt: index === 0 ? new Date() : null,
        usedRefType: index === 0 ? "OTHER" : null,
        usedRefId: index === 0 ? marker : null,
      })),
    });
    const hidden = await prisma.lotSerialNumber.create({
      data: {
        tenantId: tenant.id,
        productId,
        batchId,
        serialNumber: `${marker}_HIDDEN_TRACE`,
      },
    });

    await login(page);
    await page.goto("/dashboard/lot-serials");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Lot.*Seri/,
    );
    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => onboarding.click())
      .catch(() => undefined);
    await expect(page.getByText(/1-20 \/ 22 seri/)).toBeVisible();
    await page.getByRole("button", { name: /Sonraki/ }).click();
    await expect(page.getByText(/21-22 \/ 22 seri/)).toBeVisible();
    await page.getByRole("button", { name: /nceki/ }).click();

    await page
      .getByRole("button", { name: /Yeni Seri No/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    const textInputs = dialog.locator('input[type="text"]');
    await textInputs.nth(0).fill(marker);
    await dialog
      .getByRole("button", { name: new RegExp(`${marker}_P`) })
      .click();
    await dialog.getByLabel(/Seri Numaras/).fill(`${marker}_CREATED_ŞĞÜ`);
    await dialog.getByRole("button", { name: /Olu/ }).click();
    await expect
      .poll(async () =>
        prisma.lotSerialNumber.count({
          where: { serialNumber: `${marker}_CREATED_ŞĞÜ`, productId },
        }),
      )
      .toBe(1);
    const created = await prisma.lotSerialNumber.findFirstOrThrow({
      where: { serialNumber: `${marker}_CREATED_ŞĞÜ`, productId },
    });
    expect(created.batchId).toBeNull();
    expect(created.isUsed).toBe(false);

    const listSearch = page.getByLabel(/Seri no veya ürün ara/);
    await listSearch.fill(`${marker}_CREATED_ŞĞÜ`);
    const row = page
      .getByRole("row")
      .filter({ hasText: `${marker}_CREATED_ŞĞÜ` });
    await expect(row).toHaveCount(1);
    await page.reload();
    await expect(row).toHaveCount(1);
    await listSearch.fill("");
    await page.getByRole("button", { name: /^Kullan/ }).click();
    await expect(
      page.getByRole("row").filter({ hasText: `${marker}_NOISE_0` }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: /Temizle/ })
      .last()
      .click();

    const traceInput = page.getByLabel(/Lot \/ Seri No ara/);
    await traceInput.fill(hidden.serialNumber);
    await page.getByRole("button", { name: /^Ara$/ }).click();
    await expect(
      page.getByText(`İzleme: ${hidden.serialNumber}`),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: hidden.serialNumber }).first(),
    ).toBeVisible();
    await expect(page.getByText(/1 Lot \/ Seri/)).toBeVisible();
    await page
      .getByRole("button", { name: /Temizle/ })
      .first()
      .click();
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/dashboard\/lot-serials/);
    expect(networkFailures).toEqual([]);
    expect(
      consoleErrors.filter(
        (value) =>
          !value.includes("/api/currency-rates/tcmb") &&
          !value.includes("502 (Bad Gateway)"),
      ),
    ).toEqual([]);
  } finally {
    await prisma.lotSerialNumber.deleteMany({
      where: { serialNumber: { startsWith: marker } },
    });
    if (batchId)
      await prisma.productBatch.deleteMany({ where: { id: batchId } });
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
});

test("lot serial list exposes a recoverable error state", async ({ page }) => {
  await login(page);
  let fail = true;
  await page.route("**/api/lot-serials*", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/lot-serials")
      return route.continue();
    if (fail)
      return route.fulfill({ status: 500, body: '{"error":"injected"}' });
    return route.continue();
  });
  await page.goto("/dashboard/lot-serials");
  await expect(page.getByText(/Lot\/Seri kayıtları y.klenemedi/)).toBeVisible({
    timeout: 15_000,
  });
  fail = false;
  await page.getByRole("button", { name: /Yeniden Dene/ }).click();
  await expect(page.getByText(/Lot\/Seri kayıtları y.klenemedi/)).toHaveCount(
    0,
  );
});
