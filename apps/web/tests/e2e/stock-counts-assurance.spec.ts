import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("stock count create, detail, finalize, filters, refresh and DB reconciliation", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_STOCK_COUNT_UI_${Date.now()}`;
  let productId = "",
    warehouseId = "",
    countId = "";
  const failures: string[] = [],
    errors: string[] = [];
  page.on("requestfailed", (request) => failures.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 500)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
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
    const [locationA, locationB] = await Promise.all([
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
        name: `${marker} Türkçe Ürün`,
        averageCost: 10,
      },
    });
    productId = product.id;
    await prisma.stockLevel.createMany({
      data: [
        {
          tenantId: tenant.id,
          productId,
          warehouseId,
          locationId: locationA.id,
          quantity: 2,
        },
        {
          tenantId: tenant.id,
          productId,
          warehouseId,
          locationId: locationB.id,
          quantity: 3,
        },
      ],
    });

    await page.goto("/login");
    await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
    await page
      .getByRole("textbox", { name: /ifre/, exact: true })
      .fill("demo1234");
    await page.getByRole("button", { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => onboarding.click())
      .catch(() => undefined);
    await page.goto("/dashboard/stock/counts");
    await expect(
      page.getByRole("heading", { level: 1, name: /Stok Say/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Yeni Say/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    const textInputs = dialog.locator('input[type="text"]');
    await textInputs.first().fill(marker);
    await dialog
      .getByRole("button", { name: new RegExp(`${marker} Depo`) })
      .click();
    await expect(dialog.getByText(`${marker} Türkçe Ürün`)).toBeVisible();
    await dialog.locator('input[type="number"]').fill("3");
    await dialog.getByLabel(/Notlar/).fill(`${marker} Türkçe açıklama`);
    await dialog.getByRole("button", { name: /Ba.*lat/ }).click();

    await expect(page.getByText(`${marker} Depo`).first()).toBeVisible();
    const stored = await expect
      .poll(async () =>
        prisma.stockCount.findFirst({
          where: { warehouseId, notes: { contains: marker } },
          include: { items: true },
        }),
      )
      .not.toBeNull();
    void stored;
    const dbCount = await prisma.stockCount.findFirstOrThrow({
      where: { warehouseId, notes: { contains: marker } },
      include: { items: true },
    });
    countId = dbCount.id;
    expect(Number(dbCount.items[0].expectedQty)).toBe(5);
    expect(Number(dbCount.items[0].countedQty)).toBe(3);

    await page.getByText(`${marker} Depo`).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/stock/counts/${countId}$`),
    );
    await expect(page.getByText(`${marker} Türkçe Ürün`)).toBeVisible();
    await expect(page.getByText("-2", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(`${marker} Türkçe Ürün`)).toBeVisible();
    await page.getByRole("button", { name: /Tamamla/ }).click();
    const finalizeDialog = page.getByRole("dialog");
    await expect(
      finalizeDialog.getByText(/stok d.*zeltmelerini uygula/i),
    ).toBeVisible();
    await finalizeDialog
      .getByRole("button", { name: /Tamamla ve Uygula/ })
      .click();
    await expect(page.getByText(/Tamamland/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Tamamla/ })).toHaveCount(0);

    const aggregate = await prisma.stockLevel.aggregate({
      where: { productId, warehouseId },
      _sum: { quantity: true },
    });
    expect(Number(aggregate._sum.quantity)).toBe(3);
    expect(
      await prisma.stockMovement.count({
        where: { refType: "STOCK_COUNT", refId: countId },
      }),
    ).toBe(1);
    expect(
      (await prisma.stockCount.findUniqueOrThrow({ where: { id: countId } }))
        .isFinalized,
    ).toBe(true);

    await page.getByRole("link", { name: /Stok Say/ }).click();
    await expect(page).toHaveURL(/dashboard\/stock\/counts$/);
    await page.getByLabel(/Say.*m no ara/).fill(dbCount.number);
    await expect(
      page.getByRole("row").filter({ hasText: dbCount.number }),
    ).toBeVisible();
    await page.getByLabel(/Say.*m durumu/).selectOption("active");
    await expect(page.getByText(/Say.*m kayd.* bulunamad/)).toBeVisible();
    await page
      .getByRole("button", { name: /Temizle/ })
      .first()
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: dbCount.number }),
    ).toBeVisible();
    await page.goBack();
    await page.goForward();
    expect(failures.filter((entry) => entry.includes("/api/stock"))).toEqual(
      [],
    );
    expect(errors.filter((entry) => !entry.includes("currency-rates"))).toEqual(
      [],
    );
  } finally {
    const countIds = (
      await prisma.stockCount.findMany({
        where: { warehouseId },
        select: { id: true },
      })
    ).map((row) => row.id);
    const movementIds = (
      await prisma.stockMovement.findMany({
        where: { productId },
        select: { id: true },
      })
    ).map((row) => row.id);
    await prisma.stockValuation.deleteMany({
      where: { movementId: { in: movementIds } },
    });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.stockCountItem.deleteMany({
      where: { stockCountId: { in: countIds } },
    });
    await prisma.stockCount.deleteMany({ where: { id: { in: countIds } } });
    await prisma.stockLevel.deleteMany({ where: { productId } });
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    if (warehouseId) {
      await prisma.location.deleteMany({ where: { warehouseId } });
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    await prisma.$disconnect();
  }
});
