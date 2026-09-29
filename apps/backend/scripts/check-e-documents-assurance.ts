import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const prefix = `TEST_E2E_EDOC_${Date.now()}`;
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
  headers: Record<string, string> = {},
) {
  const r = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin,
      ...headers,
      ...(s ? { cookie: s.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const tenantB = await login("starter@axondemo.com", "axon-starter-demo");
  let contactId: string | null = null;
  try {
    assert.equal((await api(null, "GET", "/api/e-documents")).status, 401);
    for (const path of [
      "/api/e-documents?type=BAD",
      "/api/e-documents?status=BAD",
      "/api/e-documents?dateFrom=bad",
      "/api/e-documents?dateFrom=2026-02-02&dateTo=2026-01-01",
    ])
      assert.equal((await api(owner, "GET", path)).status, 400);
    const contact = await api(owner, "POST", "/api/contacts", {
      type: "CUSTOMER",
      name: `${prefix}_CONTACT`,
      code: `${prefix}_C`,
      taxNumber: "1234567890",
    });
    assert.equal(contact.status, 201);
    contactId = contact.body.data.id;
    const invoice = await api(owner, "POST", "/api/invoices", {
      contactId,
      type: "SALES",
      number: `${prefix}_INV`,
      date: new Date().toISOString(),
      lines: [
        {
          description: "TEST E-BELGE",
          quantity: 2,
          unitPrice: 100,
          discount: 10,
        },
      ],
    });
    assert.equal(invoice.status, 201);
    const invoiceId = invoice.body.data.id;
    const valid = {
      type: "E_INVOICE",
      invoiceId,
      submissionIdempotencyKey: `${prefix}_KEY_12345678`,
    };
    for (const invalid of [
      {},
      { ...valid, type: "BAD" },
      { type: "E_INVOICE" },
      { type: "E_WAYBILL", invoiceId },
      { ...valid, uuid: crypto.randomUUID() },
      { ...valid, submissionIdempotencyKey: "short" },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/e-documents", invalid)).status,
        400,
      );
    const created = await api(owner, "POST", "/api/e-documents", valid);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal(created.body.data.status, "PROCESSING");
    assert.ok(created.body.data.uuid);
    assert.ok(created.body.data.providerCode);
    const replay = await api(owner, "POST", "/api/e-documents", valid);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.id, id);
    assert.equal(
      (
        await api(owner, "POST", "/api/e-documents", {
          ...valid,
          submissionIdempotencyKey: `${prefix}_OTHER_12345678`,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/e-documents/${id}/status`, {
          status: "ACCEPTED",
        })
      ).status,
      400,
    );
    assert.ok(
      [403, 404].includes(
        (await api(tenantB, "GET", `/api/e-documents/${id}`)).status,
      ),
    );
    assert.ok(
      [403, 404].includes(
        (
          await api(tenantB, "PATCH", `/api/e-documents/${id}/status`, {
            status: "CANCELLED",
          })
        ).status,
      ),
    );
    assert.equal(
      (
        await api(
          owner,
          "POST",
          "/api/e-documents/webhook/callback",
          { edocumentId: id, status: "ACCEPTED" },
          { "x-edocument-webhook-secret": "wrong" },
        )
      ).status,
      401,
    );
    await wait(1300);
    const accepted = await api(owner, "GET", `/api/e-documents/${id}`);
    assert.equal(accepted.body.data.status, "ACCEPTED");
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }))
        .status,
      "SENT",
    );
    const invoice2 = await api(owner, "POST", "/api/invoices", {
      contactId,
      type: "SALES",
      number: `${prefix}_INV2`,
      date: new Date().toISOString(),
      lines: [{ description: "IPTAL", quantity: 1, unitPrice: 50 }],
    });
    const doc2 = await api(owner, "POST", "/api/e-documents", {
      type: "E_ARCHIVE",
      invoiceId: invoice2.body.data.id,
      submissionIdempotencyKey: `${prefix}_CANCEL_12345678`,
    });
    const id2 = doc2.body.data.id;
    assert.equal(
      (
        await api(owner, "PATCH", `/api/e-documents/${id2}/status`, {
          status: "CANCELLED",
          providerMessage: "TEST iptal",
        })
      ).status,
      200,
    );
    await wait(1200);
    assert.equal(
      (await api(owner, "GET", `/api/e-documents/${id2}`)).body.data.status,
      "CANCELLED",
    );
    assert.equal(
      (await api(owner, "POST", `/api/e-documents/exceptions/${id2}/retry`))
        .status,
      400,
    );
    const errorDoc = await prisma.eDocument.create({
      data: {
        tenantId: owner.tenantId,
        invoiceId: invoice2.body.data.id,
        type: "E_INVOICE",
        status: "ERROR",
        uuid: crypto.randomUUID(),
        providerMessage: "FORCE_FAIL TEST",
      },
    });
    const exceptions = await api(owner, "GET", "/api/e-documents/exceptions");
    assert.ok(exceptions.body.data.some((row: any) => row.id === errorDoc.id));
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/e-documents/exceptions/${errorDoc.id}/retry`,
        )
      ).status,
      200,
    );
    const invoice3 = await api(owner, "POST", "/api/invoices", { contactId, type: "SALES", number: `${prefix}_INV3`, date: new Date().toISOString(), lines: [{ description: "CALLBACK", quantity: 1, unitPrice: 25 }] });
    const callbackDoc = await prisma.eDocument.create({ data: { tenantId: owner.tenantId, invoiceId: invoice3.body.data.id, type: "E_INVOICE", status: "PROCESSING", uuid: crypto.randomUUID() } });
    const webhookSecret = process.env.EDOCUMENT_WEBHOOK_SECRET ?? "TEST_E2E_WEBHOOK_SECRET";
    const callback = await api(owner, "POST", "/api/e-documents/webhook/callback", { edocumentId: callbackDoc.id, status: "ACCEPTED", message: "TEST provider accepted" }, { "x-edocument-webhook-secret": webhookSecret });
    assert.equal(callback.status, 200, JSON.stringify(callback.body));
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice3.body.data.id } })).status, "SENT");
    assert.equal((await api(owner, "POST", "/api/e-documents/webhook/callback", { edocumentId: callbackDoc.id, status: "PENDING" }, { "x-edocument-webhook-secret": webhookSecret })).status, 400);
    await prisma.eDocument.createMany({ data: Array.from({ length: 23 }, (_, index) => ({ tenantId: owner.tenantId, invoiceId: invoice3.body.data.id, type: "E_ARCHIVE" as const, status: index % 2 ? "ERROR" as const : "PENDING" as const, uuid: crypto.randomUUID(), providerCode: `${prefix}_PAGE_${index}` })) });
    const page1 = await api(owner, "GET", `/api/e-documents?search=${prefix}_PAGE&type=E_ARCHIVE&page=1&limit=10`);
    const page3 = await api(owner, "GET", `/api/e-documents?search=${prefix}_PAGE&type=E_ARCHIVE&page=3&limit=10`);
    assert.equal(page1.body.meta.total, 23); assert.equal(page1.body.meta.totalPages, 3); assert.equal(page3.body.data.length, 3);
    const summary = await api(owner, "GET", "/api/e-documents/summary");
    assert.ok(summary.body.data.total >= 3);
    assert.ok(Array.isArray(summary.body.data.statusCounts));
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          prefix,
          validations: 10,
          idempotency: "PASS",
          providerLifecycle: "PROCESSING->ACCEPTED",
          invoiceUpdated: "SENT",
        },
        null,
        2,
      ),
    );
  } finally {
    if (contactId) {
      const invoiceIds = (
        await prisma.invoice.findMany({
          where: { contactId },
          select: { id: true },
        })
      ).map((row) => row.id);
      await prisma.eDocument.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoiceLine.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoiceHistory.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
    }
  }
}
main().finally(() => prisma.$disconnect());
