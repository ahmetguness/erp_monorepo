import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient(),
  base = process.env.API_URL ?? "http://localhost:3001",
  origin = "http://localhost:3000",
  marker = `TEST_E2E_SERVICE_REQUEST_${Date.now()}`;
type S = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<S> {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(r.status, 200);
  const b = (await r.json()) as any;
  return {
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId: b.data.tenant.id,
  };
}
async function api(s: S | null, path = "", method = "GET", body?: unknown) {
  const r = await fetch(`${base}/api/service/requests${path}`, {
    method,
    headers: {
      origin,
      ...(s ? { cookie: s.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo"),
    denied = await login("muhasebe@axondemo.com", "axon-demo"),
    foreign = await login("pro@axondemo.com", "axon-pro-demo");
  let contactId = "",
    assetId = "",
    productId = "",
    foreignContactId = "",
    foreignProductId = "";
  const ids: string[] = [],
    invoiceIds: string[] = [];
  try {
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(denied)).status, 403);
    for (const q of [
      "status=BAD",
      "priority=BAD",
      `assignedToId=${"x".repeat(101)}`,
    ])
      assert.equal((await api(owner, `?${q}`)).status, 400, q);
    assert.equal((await api(owner, "?page=0")).body.meta.page, 1);
    assert.equal((await api(owner, "?limit=101")).body.meta.pageSize, 100);
    const c = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "CUSTOMER",
        code: `${marker}_C`,
        name: `${marker} Musteri`,
      },
    });
    contactId = c.id;
    const a = await prisma.customerAsset.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        name: `${marker} Makine`,
        serialNo: `${marker}_SN`,
        warrantyEnd: new Date(Date.now() + 86400000),
      },
    });
    assetId = a.id;
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const p = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker} Parca`,
      },
    });
    productId = p.id;
    const fc = await prisma.contact.findFirstOrThrow({
      where: { tenantId: foreign.tenantId, deletedAt: null },
    });
    foreignContactId = fc.id;
    const fp = await prisma.product.findFirstOrThrow({
      where: { tenantId: foreign.tenantId, deletedAt: null },
    });
    foreignProductId = fp.id;
    for (const body of [
      {},
      { subject: " " },
      { subject: "x".repeat(201) },
      { subject: "x", priority: "BAD" },
      { subject: "x", contactId: foreignContactId },
      { subject: "x", customerAssetId: "missing" },
    ])
      assert.ok(
        [400, 404].includes((await api(owner, "", "POST", body)).status),
      );
    const created = await api(owner, "", "POST", {
      subject: `  ${marker} Türkçe Arıza  `,
      description: "  Açıklama  ",
      priority: "HIGH",
      contactId,
      customerAssetId: assetId,
      assignedToId: `${marker}_TECH`,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;
    ids.push(id);
    const db = await prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    assert.equal(db.subject, `${marker} Türkçe Arıza`);
    assert.equal(db.description, "Açıklama");
    assert.equal(db.warrantyEnd?.getTime(), a.warrantyEnd?.getTime());
    assert.equal(
      await prisma.serviceRequestHistory.count({
        where: { serviceRequestId: id, toStatus: "OPEN" },
      }),
      1,
    );
    let list = await api(
      owner,
      `?status=OPEN&priority=HIGH&assignedToId=${encodeURIComponent(marker + "_TECH")}&page=1&limit=1`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.meta.total, 1);
    assert.equal(list.body.data[0].id, id);
    assert.ok(list.body.data[0].sla);
    assert.equal(
      (await api(owner, `/${id}`)).body.data.customerAsset.id,
      assetId,
    );
    assert.equal((await api(foreign, `/${id}`)).status, 404);
    assert.equal(
      (await api(owner, `/${id}`, "PATCH", { subject: " " })).status,
      400,
    );
    assert.equal(
      (await api(owner, `/${id}`, "PATCH", { priority: "BAD" })).status,
      400,
    );
    const updated = await api(owner, `/${id}`, "PATCH", {
      subject: `${marker} Güncel`,
      description: "Yeni",
      priority: "CRITICAL",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.subject, `${marker} Güncel`);
    for (const body of [
      { description: "" },
      { description: "x", quantity: 0 },
      { description: "x", quantity: -1 },
      { description: "x", quantity: 1.0001 },
      { description: "x", unitPrice: -1 },
      { description: "x", unitPrice: 1.001 },
      { description: "x", productId: foreignProductId },
    ])
      assert.ok(
        [400, 404].includes(
          (await api(owner, `/${id}/items`, "POST", body)).status,
        ),
      );
    const item = await api(owner, `/${id}/items`, "POST", {
      description: "Parça Türkçe",
      productId,
      quantity: 2.5,
      unitPrice: 12.34,
    });
    assert.equal(item.status, 201);
    assert.equal(Number(item.body.data.lineTotal), 30.85);
    assert.equal(
      Number(
        (
          await prisma.serviceRequestItem.findUniqueOrThrow({
            where: { id: item.body.data.id },
          })
        ).lineTotal,
      ),
      30.85,
    );
    const second = await api(owner, "", "POST", {
      subject: `${marker} Ikinci`,
    });
    assert.equal(second.status, 201);
    ids.push(second.body.data.id);
    assert.equal(
      (
        await api(
          owner,
          `/${second.body.data.id}/items/${item.body.data.id}`,
          "DELETE",
        )
      ).status,
      404,
    );
    assert.equal(
      await prisma.serviceRequestItem.count({
        where: { id: item.body.data.id },
      }),
      1,
    );
    assert.equal(
      (await api(owner, `/${id}/activities`, "POST", { activityType: "BAD" }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(owner, `/${id}/activities`, "POST", {
          activityType: "NOTE",
          notes: "x".repeat(2001),
        })
      ).status,
      400,
    );
    const act = await api(owner, `/${id}/activities`, "POST", {
      activityType: "CALL",
      notes: " Müşteri arandı ",
    });
    assert.equal(act.status, 201);
    assert.equal(act.body.data.notes, "Müşteri arandı");
    assert.equal(
      (await api(owner, `/${id}/status`, "POST", { status: "COMPLETED" }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(owner, `/${id}/status`, "POST", {
          status: "IN_PROGRESS",
          notes: "Başladı",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(owner, `/${id}/status`, "POST", {
          status: "COMPLETED",
          notes: "Bitti",
        })
      ).status,
      200,
    );
    const closed = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id },
    });
    assert.equal(closed.status, "COMPLETED");
    assert.ok(closed.closedAt);
    assert.equal(
      await prisma.serviceRequestHistory.count({
        where: { serviceRequestId: id },
      }),
      3,
    );
    assert.equal(
      await prisma.serviceActivity.count({
        where: { serviceRequestId: id, activityType: "STATUS_CHANGE" },
      }),
      2,
    );
    const detail = await api(owner, `/${id}`);
    assert.equal(detail.body.data.items.length, 1);
    assert.equal(
      detail.body.data.activities.some((x: any) => x.id === act.body.data.id),
      true,
    );
    assert.equal(detail.body.data.history.length, 3);
    assert.equal(
      (await api(owner, `/${id}/items/${item.body.data.id}`, "DELETE")).status,
      200,
    );
    assert.equal(
      await prisma.serviceRequestItem.count({
        where: { id: item.body.data.id },
      }),
      0,
    );
    assert.equal((await api(owner, `/${id}`, "DELETE")).status, 200);
    assert.ok(
      (await prisma.serviceRequest.findUniqueOrThrow({ where: { id } }))
        .deletedAt,
    );
    assert.equal((await api(owner, `/${id}`)).status, 404);
    assert.equal(
      (await api(owner, `?status=COMPLETED&priority=CRITICAL`)).body.data.some(
        (x: any) => x.id === id,
      ),
      false,
    );
    const race = await Promise.all([
      api(owner, `/${second.body.data.id}/status`, "POST", {
        status: "IN_PROGRESS",
      }),
      api(owner, `/${second.body.data.id}/status`, "POST", {
        status: "IN_PROGRESS",
      }),
    ]);
    assert.deepEqual(race.map((x) => x.status).sort(), [200, 400]);
    assert.equal(
      await prisma.serviceRequestHistory.count({
        where: {
          serviceRequestId: second.body.data.id,
          toStatus: "IN_PROGRESS",
        },
      }),
      1,
    );
    assert.equal(
      await prisma.serviceActivity.count({
        where: {
          serviceRequestId: second.body.data.id,
          activityType: "STATUS_CHANGE",
        },
      }),
      1,
    );
    const billable = await api(owner, "", "POST", {
      subject: `${marker} Faturali`,
      contactId,
      priority: "MEDIUM",
    });
    assert.equal(billable.status, 201);
    ids.push(billable.body.data.id);
    assert.equal(
      (
        await api(owner, `/${billable.body.data.id}/status`, "POST", {
          status: "IN_PROGRESS",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(owner, `/${billable.body.data.id}/items`, "POST", {
          description: "Servis hizmeti",
          quantity: 2,
          unitPrice: 50,
        })
      ).status,
      201,
    );
    const completed = await Promise.all([
      api(
        owner,
        `/${billable.body.data.id}/automation/complete-invoice`,
        "POST",
        {},
      ),
      api(
        owner,
        `/${billable.body.data.id}/automation/complete-invoice`,
        "POST",
        {},
      ),
    ]);
    assert.deepEqual(completed.map((x) => x.status).sort(), [200, 409]);
    const success = completed.find((x) => x.status === 200)!;
    invoiceIds.push(success.body.data.invoiceId);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: success.body.data.invoiceId },
      include: { lines: true },
    });
    assert.deepEqual(
      {
        net: Number(invoice.totalNet),
        tax: Number(invoice.totalTax),
        gross: Number(invoice.totalGross),
        lines: invoice.lines.length,
      },
      { net: 100, tax: 20, gross: 120, lines: 1 },
    );
    assert.equal(
      (
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: billable.body.data.id },
        })
      ).status,
      "COMPLETED",
    );
    assert.equal(
      await prisma.invoice.count({ where: { id: { in: invoiceIds } } }),
      1,
    );
    assert.equal(
      [403, 404].includes(
        (
          await api(foreign, `/${second.body.data.id}`, "PATCH", {
            subject: "hack",
          })
        ).status,
      ),
      true,
    );
    assert.equal(
      [403, 404].includes(
        (await api(foreign, `/${second.body.data.id}`, "DELETE")).status,
      ),
      true,
    );
    console.log(
      "PASS service requests assurance: auth, validation, tenant ownership, CRUD, filters/pagination, item math/IDOR protection, activities, status concurrency/history, invoice idempotency and soft delete",
    );
  } finally {
    await prisma.inventoryReservation.deleteMany({
      where: { refId: { in: ids } },
    });
    if (invoiceIds.length) {
      await prisma.eDocument.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoiceLine.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    await prisma.serviceRequest.deleteMany({ where: { id: { in: ids } } });
    if (assetId)
      await prisma.customerAsset.deleteMany({ where: { id: assetId } });
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    if (contactId)
      await prisma.contact.deleteMany({ where: { id: contactId } });
    assert.equal(
      await prisma.serviceRequest.count({
        where: { number: { startsWith: marker } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
