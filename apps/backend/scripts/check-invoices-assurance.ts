import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const prefix = `TEST_E2E_INVOICE_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  return {
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId: j.data.tenant.id,
  };
}
async function api(
  s: Session | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const r = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin,
      ...(s ? { cookie: s.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const tenantB = await login("starter@axondemo.com", "axon-starter-demo");
  const warehouse = await login("depo@axondemo.com", "axon-demo");
  let contactId: string | null = null;
  let productId: string | null = null;
  try {
    assert.equal((await api(null, "GET", "/api/invoices")).status, 401);
    assert.equal((await api(warehouse, "GET", "/api/invoices")).status, 403);
    const contact = await api(owner, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_CUSTOMER`,
      code: `${prefix}_CUSTOMER`,
    });
    contactId = contact.body.data.id;
    assert.equal(contact.status, 201);
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    productId = (
      await prisma.product.create({
        data: {
          tenantId: owner.tenantId,
          unitId: unit.id,
          code: `${prefix}_P`,
          name: `${prefix}_PRODUCT`,
          salesPrice: 1000,
        },
      })
    ).id;
    const tax = await prisma.taxRate.findFirstOrThrow({
      where: { tenantId: owner.tenantId, isWithholding: false, rate: 20 },
    });
    const date = new Date();
    const due = new Date(date.getTime() + 10 * 86400000);
    const payload = {
      contactId,
      type: "SALES",
      number: `${prefix}_MAIN`,
      date: date.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
      notes: "Türkçe fatura notu",
      lines: [
        {
          productId,
          taxRateId: tax.id,
          description: "Ürün ÇĞİÖŞÜ",
          quantity: 2,
          unitPrice: 1000,
          discount: 10,
        },
      ],
    };
    const invalids = [
      {},
      { ...payload, contactId: " " },
      { ...payload, lines: [] },
      { ...payload, date: "bad" },
      {
        ...payload,
        dueDate: new Date(date.getTime() - 86400000).toISOString(),
      },
      { ...payload, lines: [{ ...payload.lines[0], quantity: 0 }] },
      { ...payload, lines: [{ ...payload.lines[0], unitPrice: -1 }] },
      { ...payload, lines: [{ ...payload.lines[0], discount: 101 }] },
      { ...payload, notes: "x".repeat(2001) },
      { ...payload, unexpected: true },
    ];
    for (const body of invalids)
      assert.equal(
        (await api(owner, "POST", "/api/invoices", body)).status,
        400,
      );
    const otherContact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: tenantB.tenantId, deletedAt: null },
    });
    const otherProduct = await prisma.product.findFirstOrThrow({
      where: { tenantId: tenantB.tenantId, deletedAt: null },
    });
    assert.ok(
      [400, 404].includes(
        (
          await api(owner, "POST", "/api/invoices", {
            ...payload,
            number: `${prefix}_XC`,
            contactId: otherContact.id,
          })
        ).status,
      ),
    );
    assert.equal(
      (
        await api(owner, "POST", "/api/invoices", {
          ...payload,
          number: `${prefix}_XP`,
          lines: [{ ...payload.lines[0], productId: otherProduct.id }],
        })
      ).status,
      400,
    );
    const created = await api(owner, "POST", "/api/invoices", payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const invoiceId = created.body.data.id as string;
    assert.equal(Number(created.body.data.totalNet), 1800);
    assert.equal(Number(created.body.data.totalTax), 360);
    assert.equal(Number(created.body.data.totalGross), 2160);
    assert.equal(
      (await api(owner, "POST", "/api/invoices", payload)).status,
      409,
    );
    assert.equal(
      (await api(owner, "GET", `/api/invoices/${invoiceId}`)).status,
      200,
    );
    assert.equal(
      (await api(tenantB, "GET", `/api/invoices/${invoiceId}`)).status,
      404,
    );
    assert.equal(
      (
        await api(tenantB, "PATCH", `/api/invoices/${invoiceId}`, {
          notes: "cross",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/invoices/${invoiceId}`, {
          dueDate: "bad",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/invoices/${invoiceId}`, {
          notes: "TEST_E2E_UPDATED",
        })
      ).status,
      200,
    );
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }))
        .notes,
      "TEST_E2E_UPDATED",
    );
    const approved = await api(
      owner,
      "POST",
      `/api/invoices/${invoiceId}/approve`,
      { idempotencyKey: `${prefix}_APPROVE` },
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(
      (
        await api(owner, "POST", `/api/invoices/${invoiceId}/approve`, {
          idempotencyKey: `${prefix}_APPROVE`,
        })
      ).status,
      200,
    );
    assert.equal(
      await prisma.journalEntry.count({
        where: {
          tenantId: owner.tenantId,
          refType: "INVOICE",
          refId: invoiceId,
        },
      }),
      1,
    );
    const payment = await api(owner, "POST", "/api/payments", {
      contactId,
      date: date.toISOString().slice(0, 10),
      amount: 1000,
      method: "BANK_TRANSFER",
      direction: "RECEIVE",
      reference: prefix,
      idempotencyKey: `${prefix}_PAY`,
      allocations: [{ invoiceId, amount: 1000 }],
    });
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }))
        .status,
      "PARTIALLY_PAID",
    );
    const listPaid = await api(
      owner,
      "GET",
      `/api/invoices?search=${prefix}_MAIN`,
    );
    assert.equal(listPaid.body.data[0].paidAmount, 1000);
    assert.equal(
      (
        await api(owner, "POST", `/api/invoices/${invoiceId}/cancel`, {
          reason: "test",
        })
      ).status,
      400,
    );

    const order = await api(owner, "POST", "/api/sales-orders", {
      contactId,
      number: `${prefix}_ORDER`,
      date: date.toISOString().slice(0, 10),
      items: [
        {
          productId,
          description: "Ürün",
          quantity: 1,
          unitPrice: 1000,
          discount: 0,
          taxRate: 20,
        },
      ],
    });
    const linked = await api(owner, "POST", "/api/invoices", {
      ...payload,
      number: `${prefix}_LINKED`,
      salesOrderId: order.body.data.id,
      lines: [
        { ...payload.lines[0], quantity: 1, unitPrice: 1000, discount: 0 },
      ],
    });
    assert.equal(linked.status, 201);
    assert.equal(
      Number(
        (
          await prisma.salesOrder.findUniqueOrThrow({
            where: { id: order.body.data.id },
          })
        ).invoicedAmount,
      ),
      1200,
    );
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/invoices/${linked.body.data.id}/cancel`,
          {},
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/invoices/${linked.body.data.id}/cancel`,
          { reason: "TEST_E2E iptal" },
        )
      ).status,
      200,
    );
    assert.equal(
      Number(
        (
          await prisma.salesOrder.findUniqueOrThrow({
            where: { id: order.body.data.id },
          })
        ).invoicedAmount,
      ),
      0,
    );
    assert.equal(
      (
        await api(owner, "POST", "/api/invoices", {
          ...payload,
          number: `${prefix}_OVER`,
          salesOrderId: order.body.data.id,
          lines: [{ ...payload.lines[0], quantity: 2 }],
        })
      ).status,
      400,
    );

    await prisma.invoice.createMany({
      data: Array.from({ length: 23 }, (_, i) => ({
        tenantId: owner.tenantId,
        contactId: contactId!,
        number: `${prefix}_PAGE_${i}`,
        type: "SALES",
        status: i % 2 ? "SENT" : "DRAFT",
        date,
        dueDate: i % 2 ? new Date(date.getTime() - 86400000) : due,
        totalGross: 100,
      })),
    });
    const p1 = await api(
      owner,
      "GET",
      `/api/invoices?search=${prefix}_PAGE&page=1&limit=10`,
    );
    const p3 = await api(
      owner,
      "GET",
      `/api/invoices?search=${prefix}_PAGE&page=3&limit=10`,
    );
    assert.equal(p1.body.meta.totalPages, 3);
    assert.equal(p3.body.data.length, 3);
    assert.deepEqual(p1.body.summary, p3.body.summary);
    assert.deepEqual(p1.body.summary, {
      total: 23,
      paidCount: 0,
      overdueCount: 11,
      openAmount: 2300,
      totalGross: 2300,
    });
    const deletedId = p1.body.data[0].id;
    await prisma.invoice.update({
      where: { id: deletedId },
      data: { deletedAt: new Date() },
    });
    assert.equal(
      (await api(owner, "GET", `/api/invoices/${deletedId}`)).status,
      404,
    );
    assert.equal(
      (await api(owner, "GET", `/api/invoices?search=${prefix}_PAGE&limit=100`))
        .body.meta.total,
      22,
    );
    assert.equal(
      (await api(owner, "POST", "/api/invoices/recompute-statuses")).status,
      200,
    );
    const balance = await api(owner, "GET", `/api/contacts/${contactId}`);
    assert.equal(balance.body.data.financials.currentBalance, 1160);
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          prefix,
          validations: invalids.length,
          totals: { net: 1800, tax: 360, gross: 2160 },
          payment: 1000,
          balance: 1160,
          kpi: p1.body.summary,
        },
        null,
        2,
      ),
    );
  } finally {
    if (contactId) {
      const invoices = await prisma.invoice.findMany({
        where: { contactId },
        select: { id: true },
      });
      const invoiceIds = invoices.map((x) => x.id);
      const orders = await prisma.salesOrder.findMany({
        where: { contactId },
        select: { id: true },
      });
      const orderIds = orders.map((x) => x.id);
      const payments = await prisma.payment.findMany({
        where: { contactId },
        select: { id: true },
      });
      const paymentIds = payments.map((x) => x.id);
      await prisma.$transaction(async (tx) => {
        if (invoiceIds.length) {
          await tx.eDocument.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.paymentAllocation.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.invoiceHistory.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.invoiceLine.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.journalEntryLine.deleteMany({
            where: {
              journalEntry: { refType: "INVOICE", refId: { in: invoiceIds } },
            },
          });
          await tx.journalEntry.deleteMany({
            where: { refType: "INVOICE", refId: { in: invoiceIds } },
          });
          await tx.accountEntry.deleteMany({
            where: { contactId: contactId! },
          });
          if (paymentIds.length)
            await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        }
        if (orderIds.length) {
          await tx.salesOrderHistory.deleteMany({
            where: { orderId: { in: orderIds } },
          });
          await tx.salesOrderItem.deleteMany({
            where: { orderId: { in: orderIds } },
          });
          await tx.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
        }
        await tx.contact.delete({ where: { id: contactId! } });
        if (productId) await tx.product.delete({ where: { id: productId } });
      });
    }
    assert.equal(
      await prisma.invoice.count({ where: { number: { startsWith: prefix } } }),
      0,
    );
  }
}
main().finally(() => prisma.$disconnect());
