import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("stock levels aggregate locations and keep filters, navigation and cleanup working", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_STOCK_LEVEL_UI_${Date.now()}`;
  const failures: string[] = [],
    consoleErrors: string[] = [];
  let warehouseId = "",
    productId = "";
  page.on("requestfailed", (request) =>
    failures.push(`${request.method()} ${request.url()}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 500)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
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
        name: `${marker}_Depo`,
      },
    });
    warehouseId = warehouse.id;
    const [a, b] = await Promise.all([
      prisma.location.create({
        data: {
          tenantId: tenant.id,
          warehouseId,
          code: `${marker}_A`,
          name: "Raf A",
        },
      }),
      prisma.location.create({
        data: {
          tenantId: tenant.id,
          warehouseId,
          code: `${marker}_B`,
          name: "Raf B",
        },
      }),
    ]);
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Ürün`,
        minStockLevel: 10,
      },
    });
    productId = product.id;
    await prisma.stockLevel.createMany({
      data: [
        {
          tenantId: tenant.id,
          productId,
          warehouseId,
          locationId: a.id,
          quantity: 6,
        },
        {
          tenantId: tenant.id,
          productId,
          warehouseId,
          locationId: b.id,
          quantity: 6,
        },
      ],
    });
    await prisma.inventoryReservation.create({
      data: {
        tenantId: tenant.id,
        productId,
        warehouseId,
        quantity: 1,
        refType: "OTHER",
        refId: marker,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await page.goto("/login");
    await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
    await page
      .getByRole("textbox", { name: /ifre/, exact: true })
      .fill("demo1234");
    await page.getByRole("button", { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/dashboard/stock/levels");
    await expect(
      page.getByRole("heading", { level: 1, name: /Stok Seviyeleri/ }),
    ).toBeVisible();
    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => onboarding.click())
      .catch(() => undefined);
    await page.getByLabel(/rün ara/).fill(marker);
    const row = page.getByRole("row").filter({ hasText: `${marker} Ürün` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("12");
    await expect(row).toContainText(/Düşük|DÃ¼ÅŸÃ¼k/);
    await page.getByLabel("Stok durumu").selectOption("critical");
    await expect(page.getByText(/Stok kayd.*bulunmuyor/)).toBeVisible();
    await page
      .getByRole("button", { name: /Filtreleri Temizle/ })
      .first()
      .click();
    await page.getByLabel(/rün ara/).fill(marker);
    await expect(row).toBeVisible();

    await page.getByRole("button", { name: /Rezervasyonlar.*Temizle/ }).click();
    await expect
      .poll(
        async () =>
          (
            await prisma.inventoryReservation.findFirst({
              where: { refId: marker },
            })
          )?.releasedAt !== null,
      )
      .toBe(true);
    await row.click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/products/${productId}$`),
    );
    await page.goBack();
    await expect(page).toHaveURL(/dashboard\/stock\/levels$/);
    expect(failures.filter((value) => value.includes("/api/stock"))).toEqual(
      [],
    );
    expect(
      consoleErrors.filter(
        (value) =>
          !value.includes("/api/currency-rates/tcmb") &&
          !value.includes("502 (Bad Gateway)"),
      ),
    ).toEqual([]);
  } finally {
    await prisma.inventoryReservation.deleteMany({ where: { refId: marker } });
    if (productId) {
      await prisma.stockLevel.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (warehouseId) {
      await prisma.location.deleteMany({ where: { warehouseId } });
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    await prisma.$disconnect();
  }
});
