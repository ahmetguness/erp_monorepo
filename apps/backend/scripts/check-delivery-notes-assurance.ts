import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const prefix = `TEST_E2E_DELIVERY_${Date.now()}`;
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
  let productId: string | null = null;
  let contactId: string | null = null;
  try {
    assert.equal((await api(null, "GET", "/api/delivery-notes")).status, 401);
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({
      where: { tenantId: tenantB.tenantId },
    });
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
        },
      })
    ).id;
    const contact = await api(owner, "POST", "/api/contacts", {
      type: "SUPPLIER",
      name: `${prefix}_CONTACT`,
      code: `${prefix}_C`,
    });
    assert.equal(contact.status, 201);
    contactId = contact.body.data.id;
    const payload = {
      type: "INBOUND",
      warehouseId: warehouse.id,
      contactId,
      date: new Date().toISOString(),
      notes: "Türkçe ÇĞİÖŞÜ",
      items: [
        {
          productId,
          orderedQty: 5,
          deliveredQty: 3,
          description: "Kısmi giriş",
        },
      ],
    };
    for (const invalid of [
      {},
      { ...payload, date: "bad" },
      { ...payload, warehouseId: " " },
      { ...payload, notes: "x".repeat(2001) },
      { ...payload, items: [] },
      { ...payload, items: [{ ...payload.items[0], orderedQty: 0 }] },
      { ...payload, items: [{ ...payload.items[0], deliveredQty: -1 }] },
      { ...payload, items: [{ ...payload.items[0], deliveredQty: 6 }] },
      { ...payload, unexpected: true },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/delivery-notes", invalid)).status,
        400,
      );
    assert.equal(
      (
        await api(owner, "POST", "/api/delivery-notes", {
          ...payload,
          warehouseId: foreignWarehouse.id,
        })
      ).status,
      400,
    );
    const created = await api(owner, "POST", "/api/delivery-notes", payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal(created.body.data.status, "DRAFT");
    assert.equal(
      await prisma.stockMovement.count({
        where: { refType: "DELIVERY_NOTE", refId: id },
      }),
      0,
    );
    assert.ok(
      [403, 404].includes(
        (await api(tenantB, "GET", `/api/delivery-notes/${id}`)).status,
      ),
    );
    assert.ok(
      [403, 404].includes(
        (
          await api(tenantB, "PATCH", `/api/delivery-notes/${id}/status`, {
            status: "CONFIRMED",
          })
        ).status,
      ),
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/delivery-notes/${id}/status`, {
          status: "PARTIALLY_SHIPPED",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/delivery-notes/${id}/status`, {
          status: "CONFIRMED",
        })
      ).status,
      200,
    );
    assert.equal(
      await prisma.stockMovement.count({
        where: { refType: "DELIVERY_NOTE", refId: id },
      }),
      1,
    );
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { refId: id, refType: "DELIVERY_NOTE" },
    });
    assert.equal(Number(movement.quantity), 3);
    assert.equal(
      (
        await api(owner, "PATCH", `/api/delivery-notes/${id}/status`, {
          status: "CONFIRMED",
        })
      ).status,
      400,
    );
    assert.equal(
      (await api(owner, "DELETE", `/api/delivery-notes/${id}`)).status,
      400,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/delivery-notes/${id}/status`, {
          status: "SHIPPED",
          shippedAt: new Date().toISOString(),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(owner, "PATCH", `/api/delivery-notes/${id}/status`, {
          status: "DELIVERED",
          deliveredAt: new Date().toISOString(),
        })
      ).status,
      200,
    );
    assert.equal(
      await prisma.stockMovement.count({
        where: { refType: "DELIVERY_NOTE", refId: id },
      }),
      1,
    );
    const draft = await api(owner, "POST", "/api/delivery-notes", {
      ...payload,
      notes: `${prefix}_DELETE`,
    });
    assert.equal(draft.status, 201);
    const draftId = draft.body.data.id;
    assert.ok(
      [403, 404].includes(
        (await api(tenantB, "DELETE", `/api/delivery-notes/${draftId}`)).status,
      ),
    );
    assert.equal(
      (await api(owner, "DELETE", `/api/delivery-notes/${draftId}`)).status,
      204,
    );
    assert.equal(
      (await api(owner, "GET", `/api/delivery-notes/${draftId}`)).status,
      404,
    );
    await prisma.deliveryNote.createMany({
      data: Array.from({ length: 23 }, (_, i) => ({
        tenantId: owner.tenantId,
        number: `${prefix}_PAGE_${i}`,
        type: "INBOUND",
        status: i % 3 === 0 ? "CONFIRMED" : "DRAFT",
        warehouseId: warehouse.id,
        date: new Date(),
        notes: prefix,
      })),
    });
    const p1 = await api(
      owner,
      "GET",
      `/api/delivery-notes?search=${prefix}_PAGE&page=1&limit=10`,
    );
    const p3 = await api(
      owner,
      "GET",
      `/api/delivery-notes?search=${prefix}_PAGE&page=3&limit=10`,
    );
    assert.equal(p1.body.meta.totalPages, 3);
    assert.equal(p3.body.data.length, 3);
    assert.deepEqual(p1.body.summary, p3.body.summary);
    assert.equal(p1.body.summary.DRAFT, 15);
    assert.equal(p1.body.summary.CONFIRMED, 8);
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          prefix,
          validations: 9,
          stockMovementQuantity: Number(movement.quantity),
          kpi: p1.body.summary,
        },
        null,
        2,
      ),
    );
  } finally {
    const notes = await prisma.deliveryNote.findMany({
      where: {
        tenantId: owner.tenantId,
        OR: [
          { number: { startsWith: prefix } },
          { notes: { contains: prefix } },
          ...(productId ? [{ items: { some: { productId } } }] : []),
        ],
      },
      select: { id: true },
    });
    const ids = notes.map((n) => n.id);
    if (ids.length)
      await prisma.$transaction(async (tx) => {
        const movements = await tx.stockMovement.findMany({
          where: { refType: "DELIVERY_NOTE", refId: { in: ids } },
          select: { id: true },
        });
        await tx.stockValuation.deleteMany({
          where: { movementId: { in: movements.map((m) => m.id) } },
        });
        await tx.stockMovement.deleteMany({
          where: { refType: "DELIVERY_NOTE", refId: { in: ids } },
        });
        await tx.deliveryNoteItem.deleteMany({
          where: { deliveryNoteId: { in: ids } },
        });
        await tx.deliveryNote.deleteMany({ where: { id: { in: ids } } });
      });
    if (contactId) await prisma.contact.delete({ where: { id: contactId } });
    if (productId) {
      await prisma.stockLevel.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
    }
  }
}
main().finally(() => prisma.$disconnect());
