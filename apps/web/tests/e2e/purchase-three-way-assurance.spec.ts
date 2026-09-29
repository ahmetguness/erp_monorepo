import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("purchase order three-way match is identical in API, DB and UI", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_THREE_WAY_UI_${Date.now()}`;
  let productId = "",
    supplierId = "",
    orderId = "",
    invoiceId = "",
    initialStock = 0,
    warehouseId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
    await page
      .getByRole("textbox", { name: /ifre/, exact: true })
      .fill("demo1234");
    await page.getByRole("button", { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: "axon-demo" },
    });
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: tenant.id, isActive: true },
    });
    warehouseId = warehouse.id;
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker}_PRODUCT`,
        purchasePrice: 100,
      },
    });
    productId = product.id;
    const supplier = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        type: "SUPPLIER",
        code: `${marker}_S`,
        name: `${marker}_SUPPLIER`,
      },
    });
    supplierId = supplier.id;
    initialStock = Number(
      (
        await prisma.stockLevel.findFirst({
          where: { tenantId: tenant.id, productId, warehouseId },
        })
      )?.quantity ?? 0,
    );
    const setup = await page.evaluate(
      async ({ productId, supplierId, warehouseId, marker }) => {
        const call = async (path: string, body?: unknown) => {
          const response = await fetch(`http://localhost:3001${path}`, {
            method: body ? "POST" : "GET",
            credentials: "include",
            headers: body ? { "content-type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });
          return { status: response.status, body: await response.json() };
        };
        const po = await call("/api/purchase-orders", {
          contactId: supplierId,
          date: new Date().toISOString(),
          notes: marker,
          items: [
            { productId, quantity: 4, unitPrice: 100, discount: 0, taxRate: 0 },
          ],
        });
        await call(`/api/purchase-orders/${po.body.data.id}/send`, {});
        await call(`/api/purchase-orders/${po.body.data.id}/receive`, {
          warehouseId,
          idempotencyKey: `${marker}_RECEIPT`,
          items: [{ itemId: po.body.data.items[0].id, receivedQty: 4 }],
        });
        const invoice = await call("/api/invoices", {
          contactId: supplierId,
          purchaseOrderId: po.body.data.id,
          type: "PURCHASE",
          number: `${marker}_INV`,
          date: new Date().toISOString(),
          lines: [
            {
              productId,
              description: marker,
              quantity: 4,
              unitPrice: 100,
              discount: 0,
            },
          ],
        });
        const match = await call(
          `/api/purchase-orders/${po.body.data.id}/three-way-match`,
        );
        return { po, invoice, match };
      },
      { productId, supplierId, warehouseId, marker },
    );
    expect(setup.po.status).toBe(201);
    expect(setup.invoice.status).toBe(201);
    expect(setup.match.body.data.summary.status).toBe("AUTO_APPROVED");
    orderId = setup.po.body.data.id;
    invoiceId = setup.invoice.body.data.id;
    const dbOrder = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    const dbInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: true },
    });
    expect(Number(dbOrder.items[0].received)).toBe(4);
    expect(Number(dbInvoice.lines[0].quantity)).toBe(4);
    expect(Number(dbInvoice.lines[0].unitPrice)).toBe(100);
    await page.goto(`/dashboard/purchase-orders/${orderId}`);
    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => onboarding.click())
      .catch(() => undefined);
    await expect(
      page.getByRole("heading", { name: "Three-way match" }),
    ).toBeVisible();
    await expect(
      page.getByText("Otomatik onay", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("4 / 4 / 4", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("₺400,00 / ₺400,00", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Otomatik onay", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    if (invoiceId) {
      await prisma.invoiceHistory.deleteMany({ where: { invoiceId } });
      await prisma.invoiceLine.deleteMany({ where: { invoiceId } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    }
    if (orderId) {
      await prisma.stockMovement.deleteMany({ where: { refId: orderId } });
      await prisma.deliveryNote.deleteMany({
        where: { purchaseOrderId: orderId },
      });
      await prisma.purchaseOrder.deleteMany({ where: { id: orderId } });
    }
    const level =
      productId && warehouseId
        ? await prisma.stockLevel.findFirst({
            where: { productId, warehouseId },
          })
        : null;
    if (level)
      await prisma.stockLevel.update({
        where: { id: level.id },
        data: { quantity: initialStock },
      });
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    if (supplierId)
      await prisma.contact.deleteMany({ where: { id: supplierId } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [orderId, invoiceId].filter(Boolean) } },
    });
    await prisma.$disconnect();
  }
});
