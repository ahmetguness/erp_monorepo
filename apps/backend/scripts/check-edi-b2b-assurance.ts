import assert from "node:assert/strict";
import { PermissionAction, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_EDI_B2B_${Date.now()}`;
type Session = { cookie: string };

async function api(
  session: Session | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const readerUser = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const noAccessUser = await prisma.user.create({
    data: {
      email: `${marker.toLowerCase()}@example.test`,
      name: `${marker} Restricted`,
      password: readerUser.password,
      isActive: true,
    },
  });
  const tenants = await Promise.all([
    prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-a`,
        companyName: `${marker}_A`,
        email: `${marker}-a@example.test`,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        modules: [],
      },
    }),
    prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-b`,
        companyName: `${marker}_B`,
        email: `${marker}-b@example.test`,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        modules: [],
      },
    }),
    prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-starter`,
        companyName: `${marker}_STARTER`,
        email: `${marker}-starter@example.test`,
        plan: "STARTER",
        status: "ACTIVE",
        modules: [],
      },
    }),
  ]);
  const [tenantA, tenantB, starterTenant] = tenants;
  try {
    const [readRole, noAccessRole] = await Promise.all([
      prisma.role.create({
        data: {
          tenantId: tenantA.id,
          name: `${marker}_READ`,
          permissions: {
            create: [{ module: "marketplace", action: PermissionAction.READ }],
          },
        },
      }),
      prisma.role.create({
        data: {
          tenantId: tenantA.id,
          name: `${marker}_NONE`,
          permissions: {
            create: [{ module: "settings", action: PermissionAction.READ }],
          },
        },
      }),
    ]);
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
        { tenantId: starterTenant.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: readerUser.id, roleId: readRole.id },
        {
          tenantId: tenantA.id,
          userId: noAccessUser.id,
          roleId: noAccessRole.id,
        },
      ],
    });

    const contacts = await Promise.all(
      Array.from({ length: 65 }, (_, index) =>
        prisma.contact.create({
          data: {
            tenantId: tenantA.id,
            type: index % 2 === 0 ? "CUSTOMER" : "SUPPLIER",
            code: index === 0 ? null : `${marker}_C_${index}`,
            name: `${marker} Partner ${index}`,
            taxNumber:
              index === 0 ? null : `9${String(index).padStart(9, "0")}`,
            email:
              index === 0
                ? null
                : `${marker.toLowerCase()}-${index}@example.test`,
          },
        }),
      ),
    );
    const now = Date.now();
    await prisma.salesOrder.createMany({
      data: contacts.map((contact, index) => ({
        tenantId: tenantA.id,
        contactId: contact.id,
        number: `${marker}_SO_${index}`,
        date: new Date(now - (48 + index) * 3_600_000),
        status: "DRAFT",
        totalNet: 100 + index,
        totalGross: 100 + index,
      })),
    });
    const retryOrder = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: tenantA.id, number: `${marker}_SO_64` },
    });
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenantA.id, code: `${marker}_W`, name: "Ana Depo" },
    });
    await Promise.all([
      prisma.purchaseOrder.create({
        data: {
          tenantId: tenantA.id,
          contactId: contacts[1].id,
          number: `${marker}_PO`,
          date: new Date(now - 3_600_000),
          status: "SENT",
          totalNet: 200,
          totalGross: 200,
        },
      }),
      prisma.deliveryNote.create({
        data: {
          tenantId: tenantA.id,
          contactId: contacts[2].id,
          warehouseId: warehouse.id,
          number: `${marker}_DN`,
          type: "OUTBOUND",
          date: new Date(now - 2 * 3_600_000),
          status: "CONFIRMED",
        },
      }),
      prisma.invoice.create({
        data: {
          tenantId: tenantA.id,
          contactId: contacts[3].id,
          number: `${marker}_INV`,
          type: "SALES",
          date: new Date(now - 3_600_000),
          status: "SENT",
          totalNet: 300,
          totalGross: 300,
        },
      }),
    ]);
    const foreign = await prisma.contact.create({
      data: {
        tenantId: tenantB.id,
        type: "CUSTOMER",
        code: `${marker}_FOREIGN`,
        name: `${marker}_FOREIGN`,
        taxNumber: "1234567890",
        email: "foreign@example.test",
      },
    });
    await prisma.salesOrder.create({
      data: {
        tenantId: tenantB.id,
        contactId: foreign.id,
        number: `${marker}_FOREIGN_SO`,
        date: new Date(),
        status: "DRAFT",
      },
    });

    const readerSession = await login(readerUser.email, tenantA.slug);
    const noAccessSession = await login(noAccessUser.email, tenantA.slug);
    const starterSession = await login(owner.email, starterTenant.slug);
    assert.equal(
      (await api(null, "GET", "/api/data-exchange/b2b")).status,
      401,
    );
    assert.equal(
      (await api(noAccessSession, "GET", "/api/data-exchange/b2b")).status,
      403,
    );
    assert.equal(
      (await api(starterSession, "GET", "/api/data-exchange/b2b")).status,
      200,
    );
    assert.equal(
      (
        await api(starterSession, "POST", "/api/data-exchange/b2b/retry", {
          itemKey: `sales_order:${retryOrder.id}`,
        })
      ).status,
      403,
    );
    assert.equal(
      (await api(readerSession, "GET", "/api/data-exchange/b2b")).status,
      200,
    );
    assert.equal(
      (
        await api(readerSession, "POST", "/api/data-exchange/b2b/retry", {
          itemKey: `sales_order:${retryOrder.id}`,
        })
      ).status,
      403,
    );

    const ownerSession = await login(owner.email, tenantA.slug);
    const hubResult = await api(ownerSession, "GET", "/api/data-exchange/b2b");
    assert.equal(hubResult.status, 200);
    const hub = hubResult.body.data;
    assert.equal(hub.summary.partnerCount, 65);
    assert.equal(hub.summary.blockedDocumentCount, 65);
    assert.equal(hub.summary.readyDocumentCount, 3);
    assert.equal(hub.sla.trackedCount, 68);
    assert.ok(hub.sla.breachedCount >= 65);
    assert.equal(hub.exchangeQueue.length, 18);
    assert.equal(hub.errorQueue.length, 65);
    assert.ok(
      hub.partners.every(
        (partner: { name: string }) => !partner.name.includes("FOREIGN"),
      ),
    );
    assert.equal(
      hub.documentFlows.find(
        (flow: { key: string }) => flow.key === "sales_order",
      ).blockedCount,
      65,
    );
    const retryKey = `sales_order:${retryOrder.id}`;
    assert.ok(
      hub.errorQueue.some(
        (item: { itemKey: string }) => item.itemKey === retryKey,
      ),
    );

    assert.equal(
      (await api(ownerSession, "POST", "/api/data-exchange/b2b/retry", null))
        .status,
      400,
    );
    assert.equal(
      (await api(ownerSession, "POST", "/api/data-exchange/b2b/retry", {}))
        .status,
      400,
    );
    assert.equal(
      (
        await api(ownerSession, "POST", "/api/data-exchange/b2b/retry", {
          itemKey: "x".repeat(161),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(ownerSession, "POST", "/api/data-exchange/b2b/retry", {
          itemKey: "sales_order:missing",
        })
      ).status,
      404,
    );
    const retries = await Promise.all(
      Array.from({ length: 4 }, () =>
        api(ownerSession, "POST", "/api/data-exchange/b2b/retry", {
          itemKey: retryKey,
        }),
      ),
    );
    assert.ok(retries.every((result) => result.status === 201));
    assert.equal(
      new Set(retries.map((result) => result.body.data.taskId)).size,
      1,
    );
    const source = `edi-b2b-retry:${retryKey}`;
    assert.equal(
      await prisma.task.count({ where: { tenantId: tenantA.id, source } }),
      1,
    );
    const task = await prisma.task.findUniqueOrThrow({
      where: { tenantId_source: { tenantId: tenantA.id, source } },
    });
    assert.equal(task.entityId, retryKey);
    assert.equal(task.module, "data_exchange");
    assert.equal(task.priority, "HIGH");
    assert.equal(task.createdById, owner.id);
    assert.equal(task.assignedToId, owner.id);

    const tenantBSession = await login(owner.email, tenantB.slug);
    assert.equal(
      (
        await api(tenantBSession, "POST", "/api/data-exchange/b2b/retry", {
          itemKey: retryKey,
        })
      ).status,
      404,
    );
    const tenantBHub = await api(
      tenantBSession,
      "GET",
      "/api/data-exchange/b2b",
    );
    assert.equal(tenantBHub.status, 200);
    assert.equal(tenantBHub.body.data.summary.partnerCount, 1);
    assert.ok(JSON.stringify(tenantBHub.body).includes(`${marker}_FOREIGN`));
    assert.ok(!JSON.stringify(tenantBHub.body).includes(`${marker} Partner`));

    console.log(
      JSON.stringify(
        {
          marker,
          assertions: 31,
          partnerCount: 65,
          blockedDocumentCount: 65,
          readyDocumentCount: 3,
          trackedSlaCount: 68,
          retryTaskCount: 1,
          tenantIsolation: "PASS",
          authorization: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: tenants.map((tenant) => tenant.id) } },
    });
    await prisma.user.deleteMany({ where: { id: noAccessUser.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
