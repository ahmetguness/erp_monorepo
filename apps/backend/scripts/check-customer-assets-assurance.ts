import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_CUSTOMER_ASSET_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
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
  path = "",
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`${base}/api/service/assets${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}

async function main() {
  const owner = await login("admin@axondemo.com", "axon-demo");
  const denied = await login("muhasebe@axondemo.com", "axon-demo");
  const foreign = await login("pro@axondemo.com", "axon-pro-demo");
  const assetIds: string[] = [];
  const requestIds: string[] = [];
  let contactId = "";
  try {
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(denied)).status, 403);
    assert.equal((await api(owner, "?page=0&limit=101")).body.meta.page, 1);
    assert.equal(
      (await api(owner, "?page=0&limit=101")).body.meta.pageSize,
      100,
    );

    const contact = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "CUSTOMER",
        code: `${marker}_C`,
        name: `${marker} Müşteri`,
      },
    });
    contactId = contact.id;
    const foreignContact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: foreign.tenantId, deletedAt: null },
    });

    for (const body of [
      {},
      { contactId, name: " " },
      { contactId, name: "x".repeat(201) },
      { contactId, name: "X", brand: "x".repeat(101) },
      { contactId, name: "X", notes: "x".repeat(5001) },
      { contactId, name: "X", purchaseDate: "not-a-date" },
      { contactId, name: "X", purchaseDate: "2026-02-30" },
      {
        contactId,
        name: "X",
        purchaseDate: "2026-10-02",
        warrantyEnd: "2026-10-01",
      },
    ])
      assert.equal(
        (await api(owner, "", "POST", body)).status,
        400,
        JSON.stringify(body),
      );
    assert.equal(
      (
        await api(owner, "", "POST", {
          contactId: foreignContact.id,
          name: "Tenant escape",
        })
      ).status,
      404,
    );

    const created = await api(owner, "", "POST", {
      contactId,
      name: `  ${marker} Türkçe Cihaz  `,
      brand: "  Marka  ",
      model: " Model ",
      serialNo: " SN-TR-001 ",
      purchaseDate: "2026-01-01",
      warrantyEnd: "2027-01-01",
      notes: "  Açıklama  ",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;
    assetIds.push(id);
    const stored = await prisma.customerAsset.findUniqueOrThrow({
      where: { id },
    });
    assert.deepEqual(
      {
        name: stored.name,
        brand: stored.brand,
        model: stored.model,
        serialNo: stored.serialNo,
        notes: stored.notes,
      },
      {
        name: `${marker} Türkçe Cihaz`,
        brand: "Marka",
        model: "Model",
        serialNo: "SN-TR-001",
        notes: "Açıklama",
      },
    );
    assert.equal(stored.purchaseDate?.toISOString().slice(0, 10), "2026-01-01");

    const list = await api(owner, `?contactId=${contactId}&page=1&limit=1`);
    assert.equal(list.status, 200);
    assert.equal(list.body.meta.total, 1);
    assert.equal(list.body.data[0].id, id);
    assert.equal(
      (await api(owner, `?contactId=${foreignContact.id}`)).body.meta.total,
      0,
    );
    assert.equal((await api(foreign, `/${id}`)).status, 404);

    assert.equal(
      (await api(owner, `/${id}`, "PATCH", { name: " " })).status,
      400,
    );
    assert.equal(
      (await api(owner, `/${id}`, "PATCH", { warrantyEnd: "bad" })).status,
      400,
    );
    assert.equal(
      (await api(owner, `/${id}`, "PATCH", { isActive: "yes" })).status,
      400,
    );
    const updated = await api(owner, `/${id}`, "PATCH", {
      name: `${marker} Güncel`,
      brand: "",
      warrantyEnd: null,
      isActive: false,
    });
    assert.equal(updated.status, 200);
    const updatedDb = await prisma.customerAsset.findUniqueOrThrow({
      where: { id },
    });
    assert.deepEqual(
      {
        name: updatedDb.name,
        brand: updatedDb.brand,
        warrantyEnd: updatedDb.warrantyEnd,
        isActive: updatedDb.isActive,
      },
      {
        name: `${marker} Güncel`,
        brand: null,
        warrantyEnd: null,
        isActive: false,
      },
    );

    const request = await fetch(`${base}/api/service/requests`, {
      method: "POST",
      headers: {
        origin,
        cookie: owner.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contactId,
        customerAssetId: id,
        subject: `${marker} Servis`,
      }),
    });
    assert.equal(request.status, 201);
    const requestBody = (await request.json()) as any;
    requestIds.push(requestBody.data.id);
    const detail = await api(owner, `/${id}`);
    assert.equal(detail.body.data.serviceRequests[0].id, requestBody.data.id);
    assert.equal(
      (await api(owner, `?contactId=${contactId}`)).body.data[0]._count
        .serviceRequests,
      1,
    );

    assert.ok(
      [403, 404].includes(
        (await api(foreign, `/${id}`, "PATCH", { name: "hack" })).status,
      ),
    );
    assert.ok(
      [403, 404].includes((await api(foreign, `/${id}`, "DELETE")).status),
    );
    const deleted = await Promise.all([
      api(owner, `/${id}`, "DELETE"),
      api(owner, `/${id}`, "DELETE"),
    ]);
    assert.deepEqual(deleted.map((entry) => entry.status).sort(), [200, 404]);
    assert.ok(
      (await prisma.customerAsset.findUniqueOrThrow({ where: { id } }))
        .deletedAt,
    );
    assert.equal((await api(owner, `/${id}`)).status, 404);
    assert.equal(
      (await api(owner, `?contactId=${contactId}`)).body.meta.total,
      0,
    );
    assert.equal(
      (
        await prisma.serviceRequest.findUniqueOrThrow({
          where: { id: requestBody.data.id },
        })
      ).customerAssetId,
      id,
    );

    console.log(
      "PASS customer assets assurance: auth, strict validation, tenant ownership, CRUD, dates, pagination/filtering, service linkage, concurrent soft delete and DB invariants",
    );
  } finally {
    if (requestIds.length)
      await prisma.serviceRequest.deleteMany({
        where: { id: { in: requestIds } },
      });
    if (assetIds.length)
      await prisma.customerAsset.deleteMany({
        where: { id: { in: assetIds } },
      });
    if (contactId)
      await prisma.contact.deleteMany({ where: { id: contactId } });
    assert.equal(
      await prisma.customerAsset.count({
        where: { name: { startsWith: marker } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
