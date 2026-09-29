import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_PUR_REQ_${Date.now()}`;
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
  session: Session | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
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
  const accounting = await login("muhasebe@axondemo.com", "axon-demo");
  const productIds: string[] = [];
  const contactIds: string[] = [];
  const requestIds: string[] = [];
  const orderIds: string[] = [];
  let temporaryRoleId: string | null = null;
  const originalRoleIds = new Map<string, string | null>();
  try {
    assert.equal(
      (await api(null, "GET", "/api/purchase-orders/requests")).status,
      401,
    );
    assert.equal(
      (await api(accounting, "GET", "/api/purchase-orders/requests")).status,
      403,
    );
    const unitA = await prisma.unit.findFirstOrThrow({
      where: { tenantId: owner.tenantId },
    });
    const unitB = await prisma.unit.findFirstOrThrow({
      where: { tenantId: foreign.tenantId },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unitA.id,
        code: `${marker}_P`,
        name: `${marker}_ÜRÜN`,
        purchasePrice: 12.5,
      },
    });
    productIds.push(product.id);
    const otherProduct = await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        unitId: unitA.id,
        code: `${marker}_P2`,
        name: `${marker}_OTHER`,
        purchasePrice: 5,
      },
    });
    productIds.push(otherProduct.id);
    const foreignProduct = await prisma.product.create({
      data: {
        tenantId: foreign.tenantId,
        unitId: unitB.id,
        code: `${marker}_FOREIGN`,
        name: `${marker}_FOREIGN`,
        purchasePrice: 99,
      },
    });
    productIds.push(foreignProduct.id);
    const supplier = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "SUPPLIER",
        name: `${marker}_SUPPLIER`,
        code: `${marker}_S`,
      },
    });
    contactIds.push(supplier.id);
    const customer = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "CUSTOMER",
        name: `${marker}_CUSTOMER`,
        code: `${marker}_C`,
      },
    });
    contactIds.push(customer.id);
    const foreignSupplier = await prisma.contact.create({
      data: {
        tenantId: foreign.tenantId,
        type: "SUPPLIER",
        name: `${marker}_FOREIGN_SUPPLIER`,
        code: `${marker}_FS`,
      },
    });
    contactIds.push(foreignSupplier.id);

    for (const path of [
      "/api/purchase-orders/requests?status=BAD",
      "/api/purchase-orders/requests?page=0",
      "/api/purchase-orders/requests?limit=101",
      "/api/purchase-orders/requests?dateFrom=bad",
      "/api/purchase-orders/requests?dateFrom=2026-12-01&dateTo=2026-01-01",
      "/api/purchase-orders/requests?minTotal=20&maxTotal=10",
    ])
      assert.equal((await api(owner, "GET", path)).status, 400, path);
    const valid = {
      date: "2026-09-29",
      notes: `${marker} Türkçe açıklama`,
      items: [
        {
          productId: product.id,
          description: "Kalem",
          quantity: 3,
          unitPrice: 12.5,
        },
      ],
    };
    for (const invalid of [
      {},
      { ...valid, date: "bad" },
      { ...valid, extra: true },
      { ...valid, items: [] },
      { ...valid, items: [{ productId: product.id, quantity: 0 }] },
      { ...valid, items: [{ productId: product.id, quantity: -1 }] },
      {
        ...valid,
        items: [{ productId: product.id, quantity: 1, unitPrice: -1 }],
      },
      { ...valid, notes: "x".repeat(2001) },
      { ...valid, items: [valid.items[0], valid.items[0]] },
      { ...valid, items: [{ productId: foreignProduct.id, quantity: 1 }] },
    ])
      assert.equal(
        (await api(owner, "POST", "/api/purchase-orders/requests", invalid))
          .status,
        400,
        JSON.stringify(invalid).slice(0, 100),
      );
    const created = await api(
      owner,
      "POST",
      "/api/purchase-orders/requests",
      valid,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const requestId = created.body.data.id;
    requestIds.push(requestId);
    assert.equal(created.body.data.status, "DRAFT");
    assert.equal(Number(created.body.data.totalEstimated), 37.5);
    const stored = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { items: true },
    });
    assert.equal(stored.tenantId, owner.tenantId);
    assert.equal(stored.requestedBy, stored.createdById);
    assert.equal(Number(stored.totalEstimated), 37.5);
    assert.equal(Number(stored.items[0].quantity), 3);
    const edited = await api(owner, "PATCH", `/api/purchase-orders/requests/${requestId}`, {
      ...valid,
      notes: `${marker} güncellendi`,
      items: [{ ...valid.items[0], quantity: 4, unitPrice: 13 }],
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(Number(edited.body.data.totalEstimated), 52);
    const editedDb = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    assert.equal(editedDb.notes, `${marker} güncellendi`);
    assert.equal(Number(editedDb.items[0].quantity), 4);
    const search = await api(
      owner,
      "GET",
      `/api/purchase-orders/requests?search=${encodeURIComponent(marker)}&status=DRAFT&minTotal=51&maxTotal=53&page=1&limit=1`,
    );
    assert.equal(search.status, 200);
    assert.equal(search.body.meta.total, 1);
    assert.equal(search.body.data[0].id, requestId);
    assert.ok(
      [403, 404].includes(
        (
          await api(
            foreign,
            "POST",
            `/api/purchase-orders/requests/${requestId}/approve`,
          )
        ).status,
      ),
    );
    assert.equal(
      (
        await api(
          owner,
          "POST",
          "/api/purchase-orders/requests/not-found/approve",
        )
      ).status,
      404,
    );
    assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${requestId}/approve`)).status, 409);
    const submitted = await api(owner, "POST", `/api/purchase-orders/requests/${requestId}/submit`, {});
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.data.status, "PENDING_APPROVAL");
    assert.equal((await api(owner, "PATCH", `/api/purchase-orders/requests/${requestId}`, valid)).status, 409);
    assert.equal((await api(accounting, "POST", `/api/purchase-orders/requests/${requestId}/approve`, {})).status, 403);
    assert.ok([403, 404].includes((await api(foreign, "POST", `/api/purchase-orders/requests/${requestId}/cancel`, {})).status));
    const approved = await api(
      owner,
      "POST",
      `/api/purchase-orders/requests/${requestId}/approve`,
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.status, "APPROVED");
    const approvedDb = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    assert.ok(approvedDb.approvedAt);
    assert.ok(approvedDb.approvedBy);
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/purchase-orders/requests/${requestId}/approve`,
        )
      ).status,
      409,
    );
    for (const input of [
      {},
      { contactId: customer.id },
      { contactId: foreignSupplier.id },
      { contactId: supplier.id, extra: true },
      {
        contactId: supplier.id,
        items: [{ productId: product.id, unitPrice: -1 }],
      },
      {
        contactId: supplier.id,
        items: [{ productId: otherProduct.id, unitPrice: 1 }],
      },
      {
        contactId: supplier.id,
        items: [
          { productId: product.id, unitPrice: 1 },
          { productId: product.id, unitPrice: 2 },
        ],
      },
    ])
      assert.equal(
        (
          await api(
            owner,
            "POST",
            `/api/purchase-orders/requests/${requestId}/convert`,
            input,
          )
        ).status,
        400,
        JSON.stringify(input),
      );
    const conversions = await Promise.all([
      api(owner, "POST", `/api/purchase-orders/requests/${requestId}/convert`, {
        contactId: supplier.id,
        items: [{ productId: product.id, unitPrice: 15 }],
      }),
      api(owner, "POST", `/api/purchase-orders/requests/${requestId}/convert`, {
        contactId: supplier.id,
        items: [{ productId: product.id, unitPrice: 15 }],
      }),
    ]);
    assert.deepEqual(conversions.map((item) => item.status).sort(), [201, 409]);
    const converted = conversions.find((item) => item.status === 201)!;
    orderIds.push(converted.body.data.id);
    assert.equal(converted.body.data.status, "DRAFT");
    assert.equal(Number(converted.body.data.totalNet), 60);
    assert.equal(Number(converted.body.data.totalGross), 60);
    const linked = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { purchaseOrder: { include: { items: true, history: true } } },
    });
    assert.equal(linked.status, "ORDERED");
    assert.equal(linked.purchaseOrderId, converted.body.data.id);
    assert.equal(linked.purchaseOrder?.contactId, supplier.id);
    assert.equal(Number(linked.purchaseOrder?.items[0].unitPrice), 15);
    assert.equal(Number(linked.purchaseOrder?.items[0].lineTotal), 60);
    assert.equal(linked.purchaseOrder?.history.length, 1);
    assert.equal(
      (
        await api(
          owner,
          "POST",
          `/api/purchase-orders/requests/${requestId}/convert`,
          { contactId: supplier.id },
        )
      ).status,
      409,
    );
    const listedOrdered = await api(
      owner,
      "GET",
      `/api/purchase-orders/requests?search=${encodeURIComponent(marker)}&status=ORDERED`,
    );
    assert.equal(listedOrdered.status, 200);
    assert.equal(
      listedOrdered.body.data[0].purchaseOrder.id,
      converted.body.data.id,
    );
    const orderDetail = await api(
      owner,
      "GET",
      `/api/purchase-orders/${converted.body.data.id}`,
    );
    assert.equal(orderDetail.status, 200);
    assert.equal(orderDetail.body.data.trace.requests[0].id, requestId);
    assert.equal(
      await prisma.purchaseOrder.count({
        where: {
          tenantId: owner.tenantId,
          purchaseRequests: { some: { id: requestId } },
        },
      }),
      1,
    );
    for (const action of ["submit", "approve", "reject", "cancel"]) {
      assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${requestId}/${action}`, {})).status, 409, action);
    }
    assert.equal((await api(owner, "PATCH", `/api/purchase-orders/requests/${requestId}`, valid)).status, 409);
    const history = await api(owner, "GET", `/api/purchase-orders/requests/${requestId}/history`);
    assert.equal(history.status, 200);
    assert.ok(history.body.data.some((entry: any) => entry.action === "CREATE"));
    assert.ok(history.body.data.some((entry: any) => entry.action === "APPROVE"));
    assert.equal(history.body.data.at(-1).newValues.status, "ORDERED");
    assert.ok([403, 404].includes((await api(foreign, "GET", `/api/purchase-orders/requests/${requestId}/history`)).status));

    const rejectedCreate = await api(owner, "POST", "/api/purchase-orders/requests", { ...valid, notes: `${marker}_REJECT` });
    assert.equal(rejectedCreate.status, 201);
    const rejectedId = rejectedCreate.body.data.id;
    requestIds.push(rejectedId);
    assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${rejectedId}/submit`, {})).status, 200);
    const rejected = await api(owner, "POST", `/api/purchase-orders/requests/${rejectedId}/reject`, { reason: "Bütçe uygun değil" });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.status, "REJECTED");
    for (const action of ["submit", "approve", "reject", "cancel"]) assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${rejectedId}/${action}`, {})).status, 409);

    const cancelledCreate = await api(owner, "POST", "/api/purchase-orders/requests", { ...valid, notes: `${marker}_CANCEL` });
    const cancelledId = cancelledCreate.body.data.id;
    requestIds.push(cancelledId);
    const cancelled = await api(owner, "POST", `/api/purchase-orders/requests/${cancelledId}/cancel`, { reason: "İhtiyaç kalmadı" });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, "CANCELLED");
    assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${cancelledId}/convert`, { contactId: supplier.id })).status, 409);
    const pendingCancelCreate = await api(owner, "POST", "/api/purchase-orders/requests", { ...valid, notes: `${marker}_PENDING_CANCEL` });
    const pendingCancelId = pendingCancelCreate.body.data.id;
    requestIds.push(pendingCancelId);
    assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${pendingCancelId}/submit`, {})).status, 200);
    assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${pendingCancelId}/cancel`, { reason: "Talep geri çekildi" })).body.data.status, "CANCELLED");
    assert.equal((await api(owner, "POST", `/api/purchase-orders/requests/${pendingCancelId}/submit`, { extra: true })).status, 400);

    const users = await prisma.user.findMany({ where: { email: { in: ["muhasebe@axondemo.com", "satis@axondemo.com"] } } });
    assert.equal(users.length, 2);
    const memberships = await prisma.tenantUser.findMany({ where: { tenantId: owner.tenantId, userId: { in: users.map((user) => user.id) } } });
    assert.equal(memberships.length, 2);
    for (const membership of memberships) originalRoleIds.set(membership.id, membership.roleId);
    const testRole = await prisma.role.create({
      data: {
        tenantId: owner.tenantId, name: marker, description: "Temporary assurance approver role",
        permissions: { create: ["CREATE", "READ", "UPDATE"].map((action) => ({ module: "purchasing", action: action as "CREATE" | "READ" | "UPDATE" })) },
      },
    });
    temporaryRoleId = testRole.id;
    await prisma.tenantUser.updateMany({ where: { id: { in: memberships.map((membership) => membership.id) } }, data: { roleId: testRole.id } });
    const userA = await login("muhasebe@axondemo.com", "axon-demo");
    const userB = await login("satis@axondemo.com", "axon-demo");
    const sodCreate = await api(userA, "POST", "/api/purchase-orders/requests", { ...valid, notes: `${marker}_SOD` });
    assert.equal(sodCreate.status, 201, JSON.stringify(sodCreate.body));
    const sodId = sodCreate.body.data.id;
    requestIds.push(sodId);
    assert.equal((await api(userA, "POST", `/api/purchase-orders/requests/${sodId}/submit`, {})).status, 200);
    assert.equal((await api(userA, "POST", `/api/purchase-orders/requests/${sodId}/approve`, {})).status, 400);
    const sodApproved = await api(userB, "POST", `/api/purchase-orders/requests/${sodId}/approve`, {});
    assert.equal(sodApproved.status, 200);
    assert.equal(sodApproved.body.data.approvedBy, users.find((user) => user.email === "satis@axondemo.com")?.id);

    console.log("PASS purchase requests lifecycle assurance");
  } finally {
    for (const [membershipId, roleId] of originalRoleIds) await prisma.tenantUser.update({ where: { id: membershipId }, data: { roleId } });
    if (temporaryRoleId) await prisma.role.delete({ where: { id: temporaryRoleId } });
    await prisma.purchaseOrderHistory.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.purchaseRequest.updateMany({
      where: { id: { in: requestIds } },
      data: { purchaseOrderId: null },
    });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.purchaseRequest.deleteMany({
      where: { id: { in: requestIds } },
    });
    await prisma.auditLog.deleteMany({ where: { module: "purchasing.purchase-request", entityId: { in: requestIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
