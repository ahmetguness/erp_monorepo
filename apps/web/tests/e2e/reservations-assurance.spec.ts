import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("reservations CRUD, server filters, expiry cleanup and persistence", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_RESERVATION_${Date.now()}`;
  const consoleErrors: string[] = [];
  const networkFailures: string[] = [];
  let productId = "";
  let warehouseId = "";
  let locationId = "";

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("inventory-reservations"))
      networkFailures.push(`${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (
      response.url().includes("inventory-reservations") &&
      response.status() >= 500
    )
      networkFailures.push(`${response.status()} ${response.url()}`);
  });

  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: "axon-demo" },
    });
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        code: `${marker}_W`,
        name: `${marker} Depo`,
      },
    });
    warehouseId = warehouse.id;
    const location = await prisma.location.create({
      data: {
        tenantId: tenant.id,
        warehouseId,
        code: `${marker}_L`,
        name: `${marker} Raf`,
      },
    });
    locationId = location.id;
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Türkçe Ürün`,
      },
    });
    productId = product.id;
    await prisma.stockLevel.create({
      data: {
        tenantId: tenant.id,
        productId,
        warehouseId,
        locationId,
        quantity: 100,
      },
    });
    await prisma.inventoryReservation.createMany({
      data: [
        ...Array.from({ length: 21 }, (_, index) => ({
          tenantId: tenant.id,
          productId,
          warehouseId,
          quantity: 1,
          refType: "OTHER" as const,
          refId: `${marker}_NOISE_${index}`,
        })),
      ],
    });

    await login(page);
    await page.goto("/dashboard/reservations");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Stok/);

    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => onboarding.click())
      .catch(() => undefined);

    await page
      .getByRole("button", { name: /Yeni Rezervasyon/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    const textInputs = dialog.locator('input[type="text"]');
    await textInputs.nth(0).fill(marker);
    await dialog
      .getByRole("button", { name: new RegExp(`${marker}_P`) })
      .click();
    await textInputs.nth(1).fill(marker);
    await dialog
      .getByRole("button", { name: new RegExp(`${marker}_W`) })
      .click();
    await dialog.locator('input[type="number"]').fill("3.125");
    await dialog.locator("select").selectOption("OTHER");
    await dialog.getByLabel(/Kaynak ID/).fill(`${marker}_CREATED`);
    await dialog.getByLabel(/Notlar/).fill("Türkçe açıklama: şğüİ");
    await dialog.getByRole("button", { name: /Olu/ }).click();

    await expect
      .poll(async () =>
        prisma.inventoryReservation.count({
          where: { tenantId: tenant.id, refId: `${marker}_CREATED` },
        }),
      )
      .toBe(1);
    const created = await prisma.inventoryReservation.findFirstOrThrow({
      where: { tenantId: tenant.id, refId: `${marker}_CREATED` },
    });
    expect(created.quantity.toString()).toBe("3.125");
    expect(created.notes).toBe("Türkçe açıklama: şğüİ");

    const search = page.getByLabel(/kod veya kaynak ara/);
    await search.fill(`${marker}_CREATED`);
    const row = page.getByRole("row").filter({ hasText: `${marker}_CREATED` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/3[,.]125/);
    await page.reload();
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: /Serbest/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /3[,.]125.*Serbest/ })
      .click();
    await expect
      .poll(
        async () =>
          (
            await prisma.inventoryReservation.findUniqueOrThrow({
              where: { id: created.id },
            })
          ).releasedAt !== null,
      )
      .toBe(true);
    await page.getByRole("button", { name: /^Serbest$/ }).click();
    await expect(row).toHaveCount(1);

    await prisma.inventoryReservation.create({
      data: {
        tenantId: tenant.id,
        productId,
        warehouseId,
        quantity: 2,
        refType: "OTHER",
        refId: `${marker}_EXPIRED`,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await page.reload();
    await search.fill("");
    await page
      .locator("section")
      .getByRole("button", { name: /^S.resi A.an$/ })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: `${marker}_EXPIRED` }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: /S.resi A.anlar.*Serbest/ }).click();
    await expect
      .poll(
        async () =>
          (
            await prisma.inventoryReservation.findFirstOrThrow({
              where: { refId: `${marker}_EXPIRED` },
            })
          ).releasedAt !== null,
      )
      .toBe(true);

    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/dashboard\/reservations/);
    expect(networkFailures).toEqual([]);
    expect(
      consoleErrors.filter(
        (value) =>
          !value.includes("/api/currency-rates/tcmb") &&
          !value.includes("502 (Bad Gateway)"),
      ),
    ).toEqual([]);
  } finally {
    await prisma.inventoryReservation.deleteMany({
      where: { refId: { startsWith: marker } },
    });
    if (productId) {
      await prisma.stockLevel.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (locationId)
      await prisma.location.deleteMany({ where: { id: locationId } });
    if (warehouseId)
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.$disconnect();
  }
});

test("reservations list exposes a recoverable API error state", async ({
  page,
}) => {
  await login(page);
  let injectFailure = true;
  await page.route("**/api/inventory-reservations*", async (route) => {
    if (
      new URL(route.request().url()).pathname !== "/api/inventory-reservations"
    ) {
      await route.continue();
      return;
    }
    if (injectFailure) {
      await route.fulfill({ status: 500, body: '{"error":"injected"}' });
      return;
    }
    await route.continue();
  });
  await page.goto("/dashboard/reservations");
  await expect(page.getByText(/Rezervasyonlar y.klenemedi/)).toBeVisible({
    timeout: 15_000,
  });
  injectFailure = false;
  await page.getByRole("button", { name: /Yeniden Dene/ }).click();
  await expect(
    page.getByRole("heading", { name: "Rezervasyonlar", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Rezervasyonlar y.klenemedi/)).toHaveCount(0);
});
