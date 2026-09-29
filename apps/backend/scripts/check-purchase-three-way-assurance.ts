import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_THREE_WAY_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId: body.data.tenant.id,
  };
}
async function api(
  session: Session,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin,
      cookie: session.cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const foreign = await login("starter@axondemo.com", "axon-starter-demo");
  const unauthorized = await login("depo@axondemo.com", "axon-demo");
  const productIds: string[] = [],
    contactIds: string[] = [],
    orderIds: string[] = [],
    invoiceIds: string[] = [];
  let productId = "",
    supplierId = "",
    warehouseId = "",
    initialStock = 0;
  const makeOrder = async (quantity: number, suffix: string) => {
    const created = await api(owner, "POST", "/api/purchase-orders", {
      contactId: supplierId,
      date: "2026-09-29",
      notes: `${marker}_${suffix}`,
      items: [{ productId, quantity, unitPrice: 100, discount: 0, taxRate: 0 }],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    orderIds.push(created.body.data.id);
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/purchase-orders/${created.body.data.id}/send`,
        )
      ).status,
      200,
    );
    return created.body.data.id as string;
  };
  const receive = async (orderId: string, quantity: number, key: string) => {
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    const result = await api(
      owner,
      "POST",
      `/api/purchase-orders/${orderId}/receive`,
      {
        warehouseId,
        idempotencyKey: `${marker}_${key}`,
        items: [{ itemId: order.items[0].id, receivedQty: quantity }],
      },
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result;
  };
  const invoice = async (
    orderId: string,
    quantity: number,
    unitPrice: number,
    suffix: string,
  ) => {
    const result = await api(owner, "POST", "/api/invoices", {
      contactId: supplierId,
      purchaseOrderId: orderId,
      type: "PURCHASE",
      number: `${marker}_${suffix}`,
      date: "2026-09-29",
      lines: [
        {
          productId,
          description: `${marker} ürün`,
          quantity,
          unitPrice,
          discount: 0,
        },
      ],
    });
    if (result.status === 201) invoiceIds.push(result.body.data.id);
    return result;
  };
  const match = (orderId: string) =>
    api(owner, "GET", `/api/purchase-orders/${orderId}/three-way-match`);
  try {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const foreignUnit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: foreign.tenantId },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker}_PRODUCT`,
        purchasePrice: 100,
      },
    });
    productId = product.id;
    productIds.push(product.id);
    const foreignProduct = await prisma.product.create({
      data: {
        tenantId: foreign.tenantId,
        unitId: foreignUnit.id,
        code: `${marker}_FP`,
        name: `${marker}_FOREIGN`,
        purchasePrice: 100,
      },
    });
    productIds.push(foreignProduct.id);
    const supplier = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "SUPPLIER",
        code: `${marker}_S`,
        name: `${marker}_SUPPLIER`,
      },
    });
    supplierId = supplier.id;
    contactIds.push(supplier.id);
    const foreignSupplier = await prisma.contact.create({
      data: {
        tenantId: foreign.tenantId,
        type: "SUPPLIER",
        code: `${marker}_FS`,
        name: `${marker}_FOREIGN_SUPPLIER`,
      },
    });
    contactIds.push(foreignSupplier.id);
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: owner.tenantId, isActive: true },
    });
    warehouseId = warehouse.id;
    initialStock = Number(
      (
        await prisma.stockLevel.findFirst({
          where: { tenantId: owner.tenantId, productId, warehouseId },
        })
      )?.quantity ?? 0,
    );

    const exactOrder = await makeOrder(4, "EXACT");
    await receive(exactOrder, 4, "EXACT_R");
    const exactInvoice = await invoice(exactOrder, 4, 100, "EXACT_I");
    assert.equal(exactInvoice.status, 201);
    const exact = await match(exactOrder);
    assert.equal(exact.status, 200);
    assert.equal(exact.body.data.summary.status, "AUTO_APPROVED");
    const exactLine = exact.body.data.lines[0];
    assert.deepEqual(
      {
        ordered: exactLine.orderedQuantity,
        received: exactLine.receivedQuantity,
        invoiced: exactLine.invoicedQuantity,
        poPrice: exactLine.orderedUnitPrice,
        invoicePrice: exactLine.invoicedUnitPrice,
        orderedTotal: exactLine.orderedTotal,
        invoicedTotal: exactLine.invoicedTotal,
      },
      {
        ordered: 4,
        received: 4,
        invoiced: 4,
        poPrice: 100,
        invoicePrice: 100,
        orderedTotal: 400,
        invoicedTotal: 400,
      },
    );
    const stockBeforeApproval = Number(
      (
        await prisma.stockLevel.findFirstOrThrow({
          where: { tenantId: owner.tenantId, productId, warehouseId },
        })
      ).quantity,
    );
    const approval = await api(
      owner,
      "POST",
      `/api/invoices/${exactInvoice.body.data.id}/approve`,
      { idempotencyKey: `${marker}_POST_EXACT` },
    );
    assert.equal(approval.status, 200, JSON.stringify(approval.body));
    const stockAfterApproval = Number(
      (
        await prisma.stockLevel.findFirstOrThrow({
          where: { tenantId: owner.tenantId, productId, warehouseId },
        })
      ).quantity,
    );
    assert.equal(stockAfterApproval, stockBeforeApproval);
    const payable = await prisma.accountEntry.aggregate({
      where: {
        tenantId: owner.tenantId,
        contactId: supplierId,
        refType: "INVOICE",
        refId: exactInvoice.body.data.id,
      },
      _sum: { debit: true, credit: true },
    });
    assert.equal(Number(payable._sum.debit ?? 0), 0);
    assert.equal(Number(payable._sum.credit ?? 0), 400);

    const qtyOrder = await makeOrder(4, "QTY");
    await receive(qtyOrder, 4, "QTY_R");
    assert.equal((await invoice(qtyOrder, 5, 100, "QTY_I")).status, 201);
    const qtyMatch = await match(qtyOrder);
    assert.equal(qtyMatch.body.data.summary.status, "EXCEPTION");
    assert.ok(
      qtyMatch.body.data.lines[0].issues.some(
        (issue: any) => issue.code === "INVOICE_QTY_GT_RECEIVED",
      ),
    );
    assert.ok(
      qtyMatch.body.data.lines[0].issues.some(
        (issue: any) => issue.code === "INVOICE_QTY_GT_ORDERED",
      ),
    );

    const priceOrder = await makeOrder(4, "PRICE");
    await receive(priceOrder, 4, "PRICE_R");
    assert.equal((await invoice(priceOrder, 4, 120, "PRICE_I")).status, 201);
    const priceMatch = await match(priceOrder);
    assert.equal(priceMatch.body.data.summary.status, "EXCEPTION");
    assert.equal(priceMatch.body.data.lines[0].priceDifferencePercent, 20);
    assert.ok(
      priceMatch.body.data.lines[0].issues.some(
        (issue: any) => issue.code === "PRICE_TOLERANCE_EXCEEDED",
      ),
    );
    const toleranceOrder = await makeOrder(4, "TOLERANCE");
    await receive(toleranceOrder, 4, "TOLERANCE_R");
    assert.equal(
      (await invoice(toleranceOrder, 4, 102, "TOLERANCE_I")).status,
      201,
    );
    const toleranceMatch = await match(toleranceOrder);
    assert.equal(toleranceMatch.body.data.summary.priceTolerancePercent, 2);
    assert.equal(toleranceMatch.body.data.lines[0].priceDifferencePercent, 2);
    assert.equal(toleranceMatch.body.data.summary.status, "AUTO_APPROVED");

    const partialOrder = await makeOrder(10, "PARTIAL");
    await receive(partialOrder, 4, "PARTIAL_R1");
    assert.equal(
      (await invoice(partialOrder, 4, 100, "PARTIAL_I")).status,
      201,
    );
    const partial = await match(partialOrder);
    assert.deepEqual(
      [
        partial.body.data.lines[0].orderedQuantity,
        partial.body.data.lines[0].receivedQuantity,
        partial.body.data.lines[0].invoicedQuantity,
      ],
      [10, 4, 4],
    );
    assert.equal(partial.body.data.summary.status, "PENDING");
    assert.ok(
      partial.body.data.lines[0].issues.some(
        (issue: any) => issue.code === "RECEIPT_PENDING",
      ),
    );
    await receive(partialOrder, 6, "PARTIAL_R2");
    const remaining = await match(partialOrder);
    assert.deepEqual(
      [
        remaining.body.data.lines[0].orderedQuantity,
        remaining.body.data.lines[0].receivedQuantity,
        remaining.body.data.lines[0].invoicedQuantity,
      ],
      [10, 10, 4],
    );
    assert.equal(remaining.body.data.summary.status, "PENDING");
    assert.ok(
      remaining.body.data.lines[0].issues.some(
        (issue: any) => issue.code === "RECEIPT_NOT_INVOICED",
      ),
    );

    const duplicateOrder = await makeOrder(4, "DUP");
    await receive(duplicateOrder, 4, "DUP_R");
    const concurrent = await Promise.all([
      invoice(duplicateOrder, 4, 100, "DUP_I1"),
      invoice(duplicateOrder, 4, 100, "DUP_I2"),
    ]);
    assert.deepEqual(
      concurrent.map((result) => result.status),
      [201, 201],
    );
    const duplicate = await match(duplicateOrder);
    assert.equal(duplicate.body.data.summary.invoicedQuantity, 8);
    assert.equal(duplicate.body.data.summary.status, "EXCEPTION");
    assert.ok(
      duplicate.body.data.lines[0].issues.some(
        (issue: any) => issue.code === "INVOICE_QTY_GT_ORDERED",
      ),
    );

    assert.ok(
      [403, 404].includes(
        (
          await api(
            foreign,
            "GET",
            `/api/purchase-orders/${exactOrder}/three-way-match`,
          )
        ).status,
      ),
    );
    assert.equal(
      (
        await api(foreign, "POST", "/api/invoices", {
          contactId: foreignSupplier.id,
          purchaseOrderId: exactOrder,
          type: "PURCHASE",
          number: `${marker}_FOREIGN`,
          date: "2026-09-29",
          lines: [
            {
              productId: foreignProduct.id,
              description: "foreign",
              quantity: 1,
              unitPrice: 1,
            },
          ],
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api(unauthorized, "POST", "/api/invoices", {
          contactId: supplierId,
          purchaseOrderId: exactOrder,
          type: "PURCHASE",
          number: `${marker}_NOAUTH`,
          date: "2026-09-29",
          lines: [
            { productId, description: "noauth", quantity: 1, unitPrice: 1 },
          ],
        })
      ).status,
      403,
    );
    assert.equal(
      Number(
        (
          await prisma.stockLevel.findFirstOrThrow({
            where: { tenantId: owner.tenantId, productId, warehouseId },
          })
        ).quantity,
      ),
      initialStock + 30,
    );
    console.log("PASS purchase order three-way match assurance");
  } finally {
    await prisma.eDocument.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await prisma.invoiceHistory.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await prisma.invoiceLine.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await prisma.journalEntryLine.deleteMany({
      where: {
        journalEntry: { refType: "INVOICE", refId: { in: invoiceIds } },
      },
    });
    await prisma.journalEntry.deleteMany({
      where: { refType: "INVOICE", refId: { in: invoiceIds } },
    });
    await prisma.accountEntry.deleteMany({
      where: { refType: "INVOICE", refId: { in: invoiceIds } },
    });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.stockMovement.deleteMany({
      where: { tenantId: owner.tenantId, productId, refId: { in: orderIds } },
    });
    await prisma.deliveryNote.deleteMany({
      where: { purchaseOrderId: { in: orderIds } },
    });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    const level =
      productId && warehouseId
        ? await prisma.stockLevel.findFirst({
            where: { tenantId: owner.tenantId, productId, warehouseId },
          })
        : null;
    if (level)
      await prisma.stockLevel.update({
        where: { id: level.id },
        data: { quantity: initialStock },
      });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...invoiceIds, ...orderIds] } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
