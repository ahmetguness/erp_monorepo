import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("sales order UI create, read, totals, lifecycle, search and navigation", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_ORDER_UI_${Date.now()}`;
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let contactId: string | null = null;
  let productId: string | null = null;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );
  try {
    await page.goto("/login");
    await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
    await page.getByLabel("Şifre", { exact: true }).fill("demo1234");
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const setup = await page.evaluate(async (name) => {
      const me = await fetch("http://localhost:3001/api/auth/me", {
        credentials: "include",
      }).then((response) => response.json());
      const response = await fetch("http://localhost:3001/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "CUSTOMER", name, code: name }),
      });
      return {
        tenantId: me.data.tenant.id as string,
        status: response.status,
        contact: await response.json(),
      };
    }, marker);
    expect(setup.status).toBe(201);
    contactId = setup.contact.data.id;
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: setup.tenantId },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: setup.tenantId,
        unitId: unit.id,
        code: `${marker}_P1`,
        name: `${marker}_PRODUCT`,
        salesPrice: 1000,
      },
    });
    productId = product.id;

    await page.goto("/dashboard/sales-orders");
    await expect(
      page.getByRole("heading", { name: "Satış Siparişleri" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Yeni Sipariş" }).click();
    await expect(page).toHaveURL(/\/dashboard\/sales-orders\/new$/);
    await expect(
      page.getByRole("heading", { name: "Yeni Sipariş Oluştur" }),
    ).toBeVisible();
    const contactInput = page.getByPlaceholder("Cari ara...");
    await contactInput.fill(marker);
    await page.getByRole("button", { name: new RegExp(marker) }).click();
    const productInput = page.getByPlaceholder("Ürün ara...").first();
    await productInput.fill(`${marker}_P1`);
    await page
      .getByRole("button", { name: new RegExp(`${marker}_P1`) })
      .click();
    const numbers = page.locator('input[type="number"]');
    await numbers.nth(0).fill("2");
    await numbers.nth(1).fill("1000");
    await numbers.nth(2).fill("10");
    await numbers.nth(3).fill("20");
    await page
      .getByPlaceholder("Teklif ile ilgili notlar…")
      .fill("TEST_E2E sipariş Türkçe not");
    await expect(page.locator("body")).toContainText("2.160,00");
    await page.getByRole("button", { name: "Siparişi Kaydet" }).click();
    await expect(page).toHaveURL(/\/dashboard\/sales-orders\/[a-z0-9]+$/);
    await expect(page.locator("body")).toContainText(marker);
    await expect(page.locator("body")).toContainText("2.160,00");
    await expect(page.locator("body")).toContainText(
      "TEST_E2E sipariş Türkçe not",
    );
    const detailUrl = page.url();
    await page.reload();
    await expect(page.locator("body")).toContainText("2.160,00");
    await page.getByRole("button", { name: "Onayla", exact: true }).click();
    await page
      .getByRole("button", { name: "Onayla", exact: true })
      .last()
      .click();
    await expect(page.locator("body")).toContainText("Onaylandı");
    await page.goto("/dashboard/sales-orders");
    await page.getByPlaceholder(/Sipariş no veya cari/).fill(marker);
    await expect(page.locator("body")).toContainText(marker);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    await page.getByRole("button", { name: "Onaylandı", exact: true }).click();
    await expect(page.locator("body")).toContainText(marker);
    await page.goBack();
    await page.goto(detailUrl);
    await expect(page.locator("body")).toContainText("Onaylandı");
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    if (contactId) {
      const ids = (
        await prisma.salesOrder.findMany({
          where: { contactId },
          select: { id: true },
        })
      ).map((row) => row.id);
      if (ids.length) {
        await prisma.inventoryReservation.deleteMany({
          where: { refType: "SALES_ORDER", refId: { in: ids } },
        });
        await prisma.salesOrderHistory.deleteMany({
          where: { orderId: { in: ids } },
        });
        await prisma.salesOrderItem.deleteMany({
          where: { orderId: { in: ids } },
        });
        await prisma.salesOrder.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.contact.deleteMany({ where: { id: contactId } });
    }
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
});
