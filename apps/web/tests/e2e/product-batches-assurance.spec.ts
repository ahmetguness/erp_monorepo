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

test("product batches create, search, filters, pagination, detail and persistence", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_BATCH_UI_${Date.now()}`;
  const consoleErrors: string[] = [];
  const networkFailures: string[] = [];
  let productId = "";
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("product-batches"))
      networkFailures.push(request.url());
  });
  page.on("response", (response) => {
    if (response.url().includes("product-batches") && response.status() >= 500)
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
    await prisma.productBatch.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        tenantId: tenant.id,
        productId,
        batchNumber: `${marker}_NOISE_${index}`,
        quantity: index === 0 ? 0 : 1,
        expiryDate: index === 1 ? new Date(Date.now() + 10 * 86_400_000) : null,
      })),
    });

    await login(page);
    await page.goto("/dashboard/product-batches");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Partileri/,
    );
    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => onboarding.click())
      .catch(() => undefined);

    await expect(page.getByText(/1-20 \/ 21 parti/)).toBeVisible();
    await page.getByRole("button", { name: /Sonraki/ }).click();
    await expect(page.getByText(/21-21 \/ 21 parti/)).toBeVisible();
    await page.getByRole("button", { name: /nceki/ }).click();

    await page.getByRole("button", { name: /Yeni Parti/ }).click();
    const dialog = page.getByRole("dialog");
    const productInput = dialog.locator('input[type="text"]').first();
    await productInput.fill(marker);
    await dialog
      .getByRole("button", { name: new RegExp(`${marker}_P`) })
      .click();
    await dialog.getByLabel(/Parti Numaras/).fill(`${marker}_CREATED`);
    await dialog.locator('input[type="number"]').fill("7.125");
    await dialog.getByLabel(/Notlar/).fill("Türkçe açıklama şğüİ");
    await dialog.getByRole("button", { name: /Olu/ }).click();

    await expect
      .poll(async () =>
        prisma.productBatch.count({
          where: {
            tenantId: tenant.id,
            productId,
            batchNumber: `${marker}_CREATED`,
          },
        }),
      )
      .toBe(1);
    const created = await prisma.productBatch.findUniqueOrThrow({
      where: {
        tenantId_productId_batchNumber: {
          tenantId: tenant.id,
          productId,
          batchNumber: `${marker}_CREATED`,
        },
      },
    });
    expect(Number(created.quantity)).toBe(7.125);
    expect(created.notes).toBe("Türkçe açıklama şğüİ");

    const search = page.getByLabel(/Parti no, ürün veya kod ara/);
    await search.fill(`${marker}_CREATED`);
    const row = page.getByRole("row").filter({ hasText: `${marker}_CREATED` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/7[,.]125/);
    await page.reload();
    await expect(row).toHaveCount(1);
    await row.click();
    const detail = page.getByRole("dialog");
    await expect(detail).toContainText(`${marker}_CREATED`);
    await expect(detail).toContainText("Türkçe açıklama şğüİ");
    await page.keyboard.press("Escape");

    await search.fill("");
    await page.getByLabel("Durum filtresi").selectOption("empty");
    await expect(
      page.getByRole("row").filter({ hasText: `${marker}_NOISE_0` }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: /Temizle/ })
      .first()
      .click();
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/dashboard\/product-batches/);
    expect(networkFailures).toEqual([]);
    expect(
      consoleErrors.filter(
        (value) =>
          !value.includes("/api/currency-rates/tcmb") &&
          !value.includes("502 (Bad Gateway)"),
      ),
    ).toEqual([]);
  } finally {
    await prisma.lotSerialNumber.deleteMany({ where: { productId } });
    await prisma.productBatch.deleteMany({
      where: { batchNumber: { startsWith: marker } },
    });
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
});

test("product batches list exposes a recoverable API error state", async ({
  page,
}) => {
  await login(page);
  let injectFailure = true;
  await page.route("**/api/product-batches*", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/product-batches")
      return route.continue();
    if (injectFailure)
      return route.fulfill({ status: 500, body: '{"error":"injected"}' });
    return route.continue();
  });
  await page.goto("/dashboard/product-batches");
  await expect(page.getByText(/Partiler y.klenemedi/)).toBeVisible({
    timeout: 15_000,
  });
  injectFailure = false;
  await page.getByRole("button", { name: /Yeniden Dene/ }).click();
  await expect(page.getByText(/Partiler y.klenemedi/)).toHaveCount(0);
});
