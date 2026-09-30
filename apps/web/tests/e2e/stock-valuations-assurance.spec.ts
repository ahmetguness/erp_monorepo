import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("stock valuation ledger, exact summary, filters, pagination, navigation and error recovery", async ({ page }) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_VALUATION_UI_${Date.now()}`;
  let productId = "", otherProductId = "", warehouseId = "";
  const requestFailures: string[] = [], consoleErrors: string[] = [];
  page.on("requestfailed", (request) => {
    if (!request.url().includes("stock-valuations") || !request.failure()?.errorText.includes("intentional")) requestFailures.push(request.url());
  });
  page.on("response", (response) => { if (response.status() >= 500) requestFailures.push(`${response.status()} ${response.url()}`); });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "axon-demo" } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const warehouse = await prisma.warehouse.create({ data: { tenantId: tenant.id, code: `${marker}_W`, name: `${marker} Depo` } });
    warehouseId = warehouse.id;
    const [product, otherProduct] = await Promise.all([
      prisma.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: `${marker}_P`, name: `${marker} Türkçe Ürün` } }),
      prisma.product.create({ data: { tenantId: tenant.id, unitId: unit.id, code: `${marker}_OTHER`, name: `${marker} Diğer Ürün` } }),
    ]);
    productId = product.id; otherProductId = otherProduct.id;
    const now = new Date();
    await prisma.stockValuation.createMany({ data: [
      ...Array.from({ length: 21 }, (_, index) => ({
        tenantId: tenant.id, productId, warehouseId, date: new Date(now.getTime() - index * 60_000),
        qtyIn: index === 20 ? 0 : 1, qtyOut: index === 20 ? 2 : 0, qtyBalance: 21 - index,
        unitCost: 12.5, totalValue: (21 - index) * 12.5,
      })),
      { tenantId: tenant.id, productId: otherProduct.id, warehouseId, date: new Date("2020-01-01T12:00:00.000Z"), qtyIn: 3, qtyOut: 0, qtyBalance: 3, unitCost: 5, totalValue: 15 },
    ] });

    await page.goto("/login");
    await page.getByLabel(/E-posta/).fill("admin@axondemo.com");
    await page.getByRole("textbox", { name: /ifre/, exact: true }).fill("demo1234");
    await page.getByRole("button", { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/dashboard/stock-valuations");
    await expect(page.getByRole("heading", { level: 1, name: /Stok Değerleme/ })).toBeVisible();
    await expect(page.getByText("Değerleme Geçmişi")).toBeVisible();

    const search = page.getByLabel("Ürün adı veya kod ara");
    await search.fill(marker);
    await expect(page.getByText(/1-20 \/ 22 değerleme kaydı/)).toBeVisible();
    await expect(page.getByText(/21 AD/).first()).toBeVisible();
    await expect(page.getByText(/277[,.]50/).first()).toBeVisible();
    await page.getByRole("button", { name: "Sonraki" }).click();
    await expect(page.getByText(/21-22 \/ 22 değerleme kaydı/)).toBeVisible();
    await expect(page.getByRole("table").getByText(`${marker} Diğer Ürün`)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /Stok Değerleme/ })).toBeVisible();

    await search.fill(`${marker}_P`);
    await page.getByLabel("Hareket filtresi").selectOption("out");
    await expect(page.getByRole("row").filter({ hasText: `${marker} Türkçe Ürün` })).toContainText(/-2 AD/);
    await page.getByLabel("Tarih filtresi").selectOption("today");
    await expect(page.getByRole("row").filter({ hasText: `${marker} Türkçe Ürün` })).toBeVisible();
    await page.getByRole("button", { name: /Temizle/ }).first().click();

    await search.fill(`${marker}_NO_MATCH`);
    await expect(page.getByText("Bu filtreler için değerleme kaydı bulunamadı")).toBeVisible();
    await page.getByRole("button", { name: "Filtreleri Temizle" }).click();
    await expect(search).toHaveValue("");

    await page.goto("/dashboard/stock/movements");
    await expect(page).toHaveURL(/stock\/movements/);
    await page.goBack();
    await expect(page).toHaveURL(/stock-valuations/);
    await page.goForward();
    await expect(page).toHaveURL(/stock\/movements/);
    await page.goBack();

    await page.route("**/api/stock-valuations?**", (route) => route.abort("failed"));
    await page.reload();
    await expect(page.getByText("Değerleme kayıtları yüklenemedi")).toBeVisible();
    await page.unroute("**/api/stock-valuations?**");
    await page.getByRole("button", { name: "Yeniden Dene" }).click();
    await expect(page.getByText("Değerleme Geçmişi")).toBeVisible();
    await expect(page.getByText("Değerleme kayıtları yüklenemedi")).toHaveCount(0);

    expect(requestFailures.filter((value) => !value.includes("stock-valuations"))).toEqual([]);
    expect(consoleErrors.filter((value) => !value.includes("ERR_FAILED") && !value.includes("currency-rates"))).toEqual([]);
  } finally {
    await prisma.stockValuation.deleteMany({ where: { productId: { in: [productId, otherProductId].filter(Boolean) } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: [productId, otherProductId].filter(Boolean) } } });
    await prisma.stockLevel.deleteMany({ where: { productId: { in: [productId, otherProductId].filter(Boolean) } } });
    await prisma.product.deleteMany({ where: { id: { in: [productId, otherProductId].filter(Boolean) } } });
    if (warehouseId) {
      await prisma.location.deleteMany({ where: { warehouseId } });
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    await prisma.$disconnect();
  }
});
