import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const runId = Date.now();
const prefix = `TEST_E2E_${runId}`;

type Session = {
  cookie: string;
  tenantId: string;
  permissions: Array<{ module: string; action: string }>;
};

async function login(email: string, tenantSlug?: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200, `login ${email}`);
  const body = (await response.json()) as any;
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId: body.data.tenant.id,
    permissions: body.data.user.tenantMembership?.role?.permissions ?? [],
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
  const tenantA = await login("admin@axondemo.com", "axon-demo");
  const tenantB = await login("starter@axondemo.com", "axon-starter-demo");
  const salesUser = await login("satis@axondemo.com", "axon-demo");
  const accountingUser = await login("muhasebe@axondemo.com", "axon-demo");
  const createdContactIds: string[] = [];
  const directContactIds: string[] = [];
  let testProductId: string | null = null;

  try {
    // Live validation matrix: every invalid request must be rejected by the API.
    const invalidCases = [
      ["long-name", { type: "CUSTOMER", name: "X".repeat(201) }],
      [
        "invalid-phone",
        { type: "CUSTOMER", name: `${prefix}_PHONE`, phone: "12x" },
      ],
      [
        "invalid-url",
        { type: "CUSTOMER", name: `${prefix}_URL`, website: "not-a-url" },
      ],
      [
        "invalid-tax",
        { type: "CUSTOMER", name: `${prefix}_TAX`, taxNumber: "123ABC" },
      ],
      [
        "decimal-term",
        { type: "CUSTOMER", name: `${prefix}_TERM`, paymentTermDays: 1.5 },
      ],
      [
        "huge-limit",
        { type: "CUSTOMER", name: `${prefix}_LIMIT`, creditLimit: 1e30 },
      ],
      [
        "unknown-field",
        { type: "CUSTOMER", name: `${prefix}_UNKNOWN`, unexpected: true },
      ],
    ] as const;
    for (const [label, payload] of invalidCases) {
      const result = await api(tenantA, "POST", "/api/contacts", payload);
      assert.equal(result.status, 400, label);
      assert.equal(result.body.error.code, "VALIDATION_ERROR", label);
    }

    // Tags: create -> API read -> direct DB -> update -> API read.
    const tagged = await api(tenantA, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_TAGGED`,
      code: `${prefix}_TAGGED`,
      tags: ["VIP", "İzmir"],
    });
    assert.equal(tagged.status, 201, JSON.stringify(tagged.body));
    const taggedId = tagged.body.data.id as string;
    createdContactIds.push(taggedId);
    assert.deepEqual(tagged.body.data.tags, ["VIP", "İzmir"]);
    const taggedDb = await prisma.contact.findUniqueOrThrow({
      where: { id: taggedId },
    });
    assert.deepEqual(taggedDb.tags, ["VIP", "İzmir"]);
    const tagUpdate = await api(tenantA, "PATCH", `/api/contacts/${taggedId}`, {
      tags: ["VIP", "İzmir", "Güncel"],
    });
    assert.equal(tagUpdate.status, 200);
    const tagRead = await api(tenantA, "GET", `/api/contacts/${taggedId}`);
    assert.deepEqual(tagRead.body.data.tags, ["VIP", "İzmir", "Güncel"]);

    const softDeleteContact = await api(tenantA, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_SOFT_DELETE`,
      code: `${prefix}_SOFT_DELETE`,
    });
    assert.equal(softDeleteContact.status, 201);
    const softDeleteId = softDeleteContact.body.data.id as string;
    createdContactIds.push(softDeleteId);
    assert.equal(
      (await api(tenantA, "DELETE", `/api/contacts/${softDeleteId}`)).status,
      200,
    );
    const softDeletedDb = await prisma.contact.findUniqueOrThrow({
      where: { id: softDeleteId },
    });
    assert.equal(softDeletedDb.tenantId, tenantA.tenantId);
    assert.ok(softDeletedDb.deletedAt);
    assert.equal(
      (await api(tenantA, "GET", `/api/contacts/${softDeleteId}`)).status,
      404,
    );

    // Balance filtering regression: matching contacts are deliberately after
    // 25 non-matching names in sort order, but must appear on filtered page 1.
    for (let index = 0; index < 28; index += 1) {
      const contact = await prisma.contact.create({
        data: {
          tenantId: tenantA.tenantId,
          type: "CUSTOMER",
          name: `${prefix}_BAL_A_${String(index).padStart(2, "0")}`,
          code: `${prefix}_A_${index}`,
        },
      });
      directContactIds.push(contact.id);
    }
    const receivable = await prisma.contact.create({
      data: {
        tenantId: tenantA.tenantId,
        type: "CUSTOMER",
        name: `${prefix}_BAL_Z_RECEIVABLE`,
        code: `${prefix}_REC`,
      },
    });
    const payable = await prisma.contact.create({
      data: {
        tenantId: tenantA.tenantId,
        type: "SUPPLIER",
        name: `${prefix}_BAL_Z_PAYABLE`,
        code: `${prefix}_PAY`,
      },
    });
    const risky = await prisma.contact.create({
      data: {
        tenantId: tenantA.tenantId,
        type: "CUSTOMER",
        name: `${prefix}_BAL_Z_RISKY`,
        code: `${prefix}_RISK`,
        creditLimit: 100,
      },
    });
    directContactIds.push(receivable.id, payable.id, risky.id);
    await prisma.accountEntry.createMany({
      data: [
        {
          tenantId: tenantA.tenantId,
          contactId: receivable.id,
          date: new Date(),
          debit: 500,
          credit: 0,
          balance: 500,
          refType: "TEST",
        },
        {
          tenantId: tenantA.tenantId,
          contactId: payable.id,
          date: new Date(),
          debit: 0,
          credit: 300,
          balance: -300,
          refType: "TEST",
        },
        {
          tenantId: tenantA.tenantId,
          contactId: risky.id,
          date: new Date(),
          debit: 90,
          credit: 0,
          balance: 90,
          refType: "TEST",
        },
      ],
    });
    for (const [filter, expectedId, expectedTotal] of [
      ["receivable", receivable.id, 2],
      ["payable", payable.id, 1],
      ["risky", risky.id, 1],
    ] as const) {
      const result = await api(
        tenantA,
        "GET",
        `/api/contacts?search=${prefix}_BAL&balanceFilter=${filter}&page=1&limit=1&sortBy=name&sortDir=asc`,
      );
      assert.equal(result.status, 200, filter);
      assert.equal(
        result.body.data[0].id,
        expectedId,
        `${filter} filtering must precede pagination`,
      );
      assert.equal(
        result.body.meta.total,
        expectedTotal,
        `${filter} filtered meta.total`,
      );
      assert.equal(
        result.body.meta.totalPages,
        expectedTotal,
        `${filter} filtered totalPages`,
      );
    }

    // Tenant isolation with an ID known to tenant B.
    const isolated = await api(tenantA, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_TENANT_A`,
      code: `${prefix}_TENANT_A`,
    });
    assert.equal(isolated.status, 201);
    const isolatedId = isolated.body.data.id as string;
    createdContactIds.push(isolatedId);
    for (const [method, payload] of [
      ["GET", undefined],
      ["PATCH", { name: `${prefix}_ATTACKED` }],
      ["DELETE", undefined],
    ] as const) {
      const result = await api(
        tenantB,
        method,
        `/api/contacts/${isolatedId}`,
        payload,
      );
      assert.equal(result.status, 404, `tenant B ${method}`);
      assert.equal(
        result.body.error.code,
        "NOT_FOUND",
        `tenant B ${method} leakage`,
      );
    }
    const unchanged = await prisma.contact.findUniqueOrThrow({
      where: { id: isolatedId },
    });
    assert.equal(unchanged.name, `${prefix}_TENANT_A`);
    assert.equal(unchanged.deletedAt, null);

    // Permission matrix: seeded sales role has READ+CREATE only; accounting has none.
    assert.deepEqual(
      salesUser.permissions
        .filter((item) => item.module === "contacts")
        .map((item) => item.action)
        .sort(),
      ["CREATE", "READ"],
    );
    const salesCreated = await api(salesUser, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_SALES_ROLE`,
      code: `${prefix}_SALES_ROLE`,
    });
    assert.equal(salesCreated.status, 201);
    const salesContactId = salesCreated.body.data.id as string;
    createdContactIds.push(salesContactId);
    assert.equal(
      (await api(salesUser, "GET", `/api/contacts/${salesContactId}`)).status,
      200,
    );
    assert.equal(
      (
        await api(salesUser, "PATCH", `/api/contacts/${salesContactId}`, {
          name: `${prefix}_FORBIDDEN`,
        })
      ).status,
      403,
    );
    assert.equal(
      (await api(salesUser, "DELETE", `/api/contacts/${salesContactId}`))
        .status,
      403,
    );
    assert.equal(
      (await api(accountingUser, "GET", `/api/contacts/${salesContactId}`))
        .status,
      403,
    );

    // Real ERP flow: contact -> quote -> order -> invoice -> approval -> collection -> balance.
    const flowContact = await api(tenantA, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_FLOW_CONTACT`,
      code: `${prefix}_FLOW_CONTACT`,
      creditLimit: 20000,
      paymentTermDays: 30,
    });
    assert.equal(flowContact.status, 201);
    const contactId = flowContact.body.data.id as string;
    createdContactIds.push(contactId);
    const [unit, location] = await Promise.all([
      prisma.unit.findFirstOrThrow({ where: { tenantId: tenantA.tenantId } }),
      prisma.location.findFirstOrThrow({
        where: {
          tenantId: tenantA.tenantId,
          isActive: true,
          warehouse: { isActive: true },
        },
        include: { warehouse: true },
      }),
    ]);
    const warehouse = location.warehouse;
    const product = await prisma.product.create({
      data: {
        tenantId: tenantA.tenantId,
        unitId: unit.id,
        code: `${prefix}_PRODUCT`,
        name: `${prefix}_PRODUCT`,
        salesPrice: 10000,
      },
    });
    testProductId = product.id;
    const stock = await prisma.stockLevel.create({
      data: {
        tenantId: tenantA.tenantId,
        productId: product.id,
        warehouseId: warehouse.id,
        locationId: location.id,
        quantity: 10,
      },
    });
    const date = new Date().toISOString();
    const item = {
      productId: product.id,
      description: `${prefix}_FLOW_ITEM`,
      quantity: 1,
      unitPrice: 10000,
      discount: 0,
      taxRate: 0,
    };
    const quote = await api(tenantA, "POST", "/api/sales-orders/quotes", {
      contactId,
      date,
      items: [item],
      notes: prefix,
    });
    assert.equal(quote.status, 201, JSON.stringify(quote.body));
    assert.equal(Number(quote.body.data.totalGross), 10000);
    const order = await api(
      tenantA,
      "POST",
      `/api/sales-orders/quotes/${quote.body.data.id}/convert`,
    );
    assert.equal(order.status, 201, JSON.stringify(order.body));
    assert.equal(order.body.data.contactId, contactId);
    const fulfillment = await api(
      tenantA,
      "POST",
      `/api/sales-orders/${order.body.data.id}/fulfill`,
      {
        warehouseId: stock.warehouseId,
        createDeliveryDraft: true,
        createInvoiceDraft: true,
      },
    );
    assert.equal(fulfillment.status, 200, JSON.stringify(fulfillment.body));
    assert.ok(fulfillment.body.data.deliveryNoteId);
    assert.ok(fulfillment.body.data.invoiceId);
    const delivered = await api(
      tenantA,
      "PATCH",
      `/api/delivery-notes/${fulfillment.body.data.deliveryNoteId}/status`,
      { status: "DELIVERED" },
    );
    assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    const invoice = await api(
      tenantA,
      "GET",
      `/api/invoices/${fulfillment.body.data.invoiceId}`,
    );
    assert.equal(invoice.status, 200, JSON.stringify(invoice.body));
    assert.equal(Number(invoice.body.data.totalGross), 10000);
    const approved = await api(
      tenantA,
      "POST",
      `/api/invoices/${invoice.body.data.id}/approve`,
      { idempotencyKey: `${prefix}_APPROVE` },
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const payment = await api(tenantA, "POST", "/api/payments", {
      contactId,
      date,
      amount: 4000,
      method: "BANK_TRANSFER",
      direction: "RECEIVE",
      reference: prefix,
      idempotencyKey: `${prefix}_PAYMENT`,
      allocations: [{ invoiceId: invoice.body.data.id, amount: 4000 }],
    });
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    const detail = await api(tenantA, "GET", `/api/contacts/${contactId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.financials.totalDebit, 10000);
    assert.equal(detail.body.data.financials.totalCredit, 4000);
    assert.equal(detail.body.data.financials.currentBalance, 6000);
    const entries = await prisma.accountEntry.findMany({
      where: { tenantId: tenantA.tenantId, contactId },
      orderBy: { date: "asc" },
    });
    assert.equal(
      entries.reduce(
        (sum, row) => sum + Number(row.debit) - Number(row.credit),
        0,
      ),
      6000,
    );
    const tracking = await api(
      tenantA,
      "GET",
      "/api/contacts/tracking-dashboard?limit=100",
    );
    const trackingRow = tracking.body.data.rows.find(
      (row: any) => row.contact.id === contactId,
    );
    assert.equal(trackingRow.openBalance, 6000);
    const storedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.body.data.id },
    });
    assert.equal(Number(storedInvoice.totalGross), 10000);
    const storedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.body.data.id },
    });
    assert.equal(Number(storedPayment.amount), 4000);

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          prefix,
          balanceFilters: ["receivable", "payable", "risky"],
          validations: invalidCases.map(([name]) => name),
          tags: ["VIP", "İzmir", "Güncel"],
          tenantIsolation: ["GET", "PATCH", "DELETE"],
          permissions: {
            sales: ["READ", "CREATE"],
            denied: ["UPDATE", "DELETE"],
            accountingRead: "DENIED",
          },
          flow: {
            contactId,
            productId: product.id,
            quoteId: quote.body.data.id,
            orderId: order.body.data.id,
            invoiceId: invoice.body.data.id,
            paymentId: payment.body.data.id,
            expectedBalance: 6000,
            actualBalance: detail.body.data.financials.currentBalance,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    // Only TEST_E2E records created by this run are removed. Financial records
    // cascade from their TEST_E2E contact or are explicitly removed in FK order.
    const allContactIds = [...createdContactIds, ...directContactIds];
    if (allContactIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        const invoices = await tx.invoice.findMany({
          where: { contactId: { in: allContactIds } },
          select: { id: true },
        });
        const invoiceIds = invoices.map((row) => row.id);
        if (invoiceIds.length) {
          await tx.paymentAllocation.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.invoiceHistory.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.invoiceLine.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        }
        await tx.accountEntry.deleteMany({
          where: { contactId: { in: allContactIds } },
        });
        await tx.payment.deleteMany({
          where: { contactId: { in: allContactIds } },
        });
        await tx.deliveryNoteItem.deleteMany({
          where: { deliveryNote: { contactId: { in: allContactIds } } },
        });
        await tx.deliveryNote.deleteMany({
          where: { contactId: { in: allContactIds } },
        });
        await tx.inventoryReservation.deleteMany({
          where: {
            refId: {
              in: (
                await tx.salesOrder.findMany({
                  where: { contactId: { in: allContactIds } },
                  select: { id: true },
                })
              ).map((row) => row.id),
            },
          },
        });
        await tx.salesOrderHistory.deleteMany({
          where: { order: { contactId: { in: allContactIds } } },
        });
        await tx.salesOrderItem.deleteMany({
          where: { order: { contactId: { in: allContactIds } } },
        });
        await tx.salesOrder.deleteMany({
          where: { contactId: { in: allContactIds } },
        });
        await tx.salesQuoteItem.deleteMany({
          where: { quote: { contactId: { in: allContactIds } } },
        });
        await tx.salesQuote.deleteMany({
          where: { contactId: { in: allContactIds } },
        });
        await tx.contact.deleteMany({ where: { id: { in: allContactIds } } });
        if (testProductId) {
          const movementIds = (
            await tx.stockMovement.findMany({
              where: { productId: testProductId },
              select: { id: true },
            })
          ).map((row) => row.id);
          if (movementIds.length)
            await tx.stockValuation.deleteMany({
              where: { movementId: { in: movementIds } },
            });
          await tx.stockMovement.deleteMany({
            where: { productId: testProductId },
          });
          await tx.stockLevel.deleteMany({
            where: { productId: testProductId },
          });
          await tx.product.delete({ where: { id: testProductId } });
        }
      });
      assert.equal(await prisma.contact.count({ where: { OR: [{ name: { startsWith: prefix } }, { code: { startsWith: prefix } }] } }), 0, 'contact cleanup');
      assert.equal(await prisma.product.count({ where: { code: { startsWith: prefix } } }), 0, 'product cleanup');
    }
  }
}

main().finally(() => prisma.$disconnect());
