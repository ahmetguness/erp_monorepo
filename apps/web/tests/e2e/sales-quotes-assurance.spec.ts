import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("sales quote UI create, read, filter, navigation and conversion flow", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_QUOTE_UI_${Date.now()}`;
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let contactId: string | null = null;
  const productIds: string[] = [];

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
      const contactResponse = await fetch(
        "http://localhost:3001/api/contacts",
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "CUSTOMER", name, code: name }),
        },
      );
      return {
        tenantId: me.data.tenant.id as string,
        contact: await contactResponse.json(),
        status: contactResponse.status,
      };
    }, marker);
    expect(setup.status).toBe(201);
    contactId = setup.contact.data.id;
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: setup.tenantId },
    });
    for (let index = 1; index <= 2; index += 1) {
      const product = await prisma.product.create({
        data: {
          tenantId: setup.tenantId,
          unitId: unit.id,
          code: `${marker}_P${index}`,
          name: `${marker}_PRODUCT_${index}`,
          salesPrice: index === 1 ? 1000 : 500,
        },
      });
      productIds.push(product.id);
    }

    await page.goto("/dashboard/sales-orders/quotes");
    await expect(
      page.getByRole("heading", { name: "Teklifler" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Yeni Teklif" }).click();
    await expect(page).toHaveURL(/\/dashboard\/sales-orders\/quotes\/new$/);

    const contactInput = page.getByPlaceholder("Cari ara...");
    await contactInput.fill(marker);
    await page.getByRole("button", { name: new RegExp(marker) }).click();
    const productInputs = page.getByPlaceholder("Ürün ara...");
    await productInputs.first().fill(`${marker}_P1`);
    await page
      .getByRole("button", { name: new RegExp(`${marker}_P1`) })
      .click();
    const numbers = page.locator('input[type="number"]');
    await numbers.nth(0).fill("2");
    await numbers.nth(1).fill("1000");
    await numbers.nth(2).fill("10");
    await numbers.nth(3).fill("20");

    await page.getByRole("button", { name: "Yeni Kalem Ekle" }).click();
    await productInputs.first().fill(`${marker}_P2`);
    await page
      .getByRole("button", { name: new RegExp(`${marker}_P2`) })
      .click();
    await numbers.nth(4).fill("3");
    await numbers.nth(5).fill("500");
    await numbers.nth(6).fill("0");
    await numbers.nth(7).fill("10");
    await page
      .getByPlaceholder("Teklif ile ilgili notlar…")
      .fill("Türkçe teklif notu: İzmir ÇĞİÖŞÜ");
    await expect(page.locator("body")).toContainText("3.810,00");

    await page.getByRole("button", { name: "Teklifi Kaydet" }).click();
    await expect(page).toHaveURL(
      /\/dashboard\/sales-orders\/quotes\/[a-z0-9]+$/,
    );
    await expect(page.locator("body")).toContainText(marker);
    await expect(page.locator("body")).toContainText("3.810,00");
    await expect(page.locator("body")).toContainText("İzmir ÇĞİÖŞÜ");
    const quoteUrl = page.url();
    await page.reload();
    await expect(page.locator("body")).toContainText("3.810,00");
    await expect(
      page.getByRole("button", { name: "Yazdır / PDF" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Düzenle" }).click();
    await expect(page).toHaveURL(
      /\/dashboard\/sales-orders\/quotes\/[a-z0-9]+\/edit$/,
    );
    const editNumbers = page.locator('input[type="number"]');
    await editNumbers.nth(0).fill("1");
    await editNumbers.nth(1).fill("2000");
    await page
      .getByPlaceholder("Teklif ile ilgili notlar…")
      .fill("TEST_E2E_UPDATED Türkçe not");
    await page.getByRole("button", { name: "Değişiklikleri Kaydet" }).click();
    await expect(page).toHaveURL(
      /\/dashboard\/sales-orders\/quotes\/[a-z0-9]+$/,
    );
    await expect(page.locator("body")).toContainText(
      "TEST_E2E_UPDATED Türkçe not",
    );
    await expect(page.locator("body")).toContainText("3.810,00");
    await page.reload();
    await expect(page.locator("body")).toContainText(
      "TEST_E2E_UPDATED Türkçe not",
    );

    await page.goto("/dashboard/sales-orders/quotes");
    const search = page.getByPlaceholder(/Teklif no veya cari/);
    await search.fill(marker);
    await expect(page.locator("body")).toContainText(marker);
    await page.getByRole("button", { name: "Taslak", exact: true }).click();
    await expect(page.locator("body")).toContainText(marker);
    await page.goBack();
    await expect(page).toHaveURL(
      /\/dashboard\/sales-orders\/quotes\/[a-z0-9]+$/,
    );
    await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => null);
    await expect(page).toHaveURL(/\/dashboard\/sales-orders\/quotes/);

    await page.goto(quoteUrl);
    await page.getByRole("button", { name: "Siparişe Dönüştür" }).click();
    await expect(
      page.getByRole("heading", { name: "Siparişe Dönüştür" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dönüştür", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/sales-orders\/[a-z0-9]+$/);
    await expect(page.locator("body")).toContainText(marker);
    await expect(page.locator("body")).toContainText("3.810,00");

    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    if (contactId) {
      const quoteIds = (
        await prisma.salesQuote.findMany({
          where: { contactId },
          select: { id: true },
        })
      ).map((row) => row.id);
      const orderIds = (
        await prisma.salesOrder.findMany({
          where: { contactId },
          select: { id: true },
        })
      ).map((row) => row.id);
      if (orderIds.length) {
        await prisma.salesOrderHistory.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await prisma.salesOrderItem.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
      }
      if (quoteIds.length) {
        await prisma.salesQuoteItem.deleteMany({
          where: { quoteId: { in: quoteIds } },
        });
        await prisma.salesQuote.deleteMany({ where: { id: { in: quoteIds } } });
      }
      await prisma.contact.deleteMany({ where: { id: contactId } });
    }
    if (productIds.length)
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  }
});
