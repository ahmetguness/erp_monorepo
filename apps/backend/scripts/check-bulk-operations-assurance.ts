import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_BULK_${Date.now()}`;
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug: slug }),
  });
  assert.equal(response.status, 200, `${slug} login`);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const reader = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A`,
      email: `${marker}-a@example.test`,
      plan: "PROFESSIONAL",
      status: "ACTIVE",
      modules: [],
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@example.test`,
      plan: "PROFESSIONAL",
      status: "ACTIVE",
      modules: [],
    },
  });
  try {
    const readRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ`,
        permissions: {
          create: [
            { module: "contacts", action: "READ" },
            { module: "settings", action: "READ" },
          ],
        },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: reader.id, roleId: readRole.id },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      ],
    });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);
    const readOnly = await login(reader.email, tenantA.slug);
    const unitA = await prisma.unit.create({
      data: {
        tenantId: tenantA.id,
        code: `${marker}_UA`,
        name: `${marker} Unit A`,
      },
    });
    const unitB = await prisma.unit.create({
      data: {
        tenantId: tenantB.id,
        code: `${marker}_UB`,
        name: `${marker} Unit B`,
      },
    });
    const [contactA1, contactA2, contactB] = await Promise.all([
      prisma.contact.create({
        data: {
          tenantId: tenantA.id,
          type: "CUSTOMER",
          code: `${marker}_CA1`,
          name: `${marker} Cari Türkçe 1`,
          city: "Ankara",
          paymentTermDays: 10,
        },
      }),
      prisma.contact.create({
        data: {
          tenantId: tenantA.id,
          type: "CUSTOMER",
          code: `${marker}_CA2`,
          name: `${marker} Cari 2`,
          city: "Ankara",
          paymentTermDays: 10,
        },
      }),
      prisma.contact.create({
        data: {
          tenantId: tenantB.id,
          type: "CUSTOMER",
          code: `${marker}_CB`,
          name: `${marker} Foreign`,
          city: "İzmir",
        },
      }),
    ]);
    const [productA, productB] = await Promise.all([
      prisma.product.create({
        data: {
          tenantId: tenantA.id,
          unitId: unitA.id,
          code: `${marker}_PA`,
          name: `${marker} Product A`,
          salesPrice: 10,
          purchasePrice: 5,
          minStockLevel: 1,
        },
      }),
      prisma.product.create({
        data: {
          tenantId: tenantB.id,
          unitId: unitB.id,
          code: `${marker}_PB`,
          name: `${marker} Product B`,
          salesPrice: 99,
        },
      }),
    ]);
    const [invoiceA, invoiceB] = await Promise.all([
      prisma.invoice.create({
        data: {
          tenantId: tenantA.id,
          contactId: contactA1.id,
          type: "SALES",
          number: `${marker}_IA`,
          date: new Date("2026-10-01"),
          dueDate: new Date("2026-10-10"),
          notes: "old",
        },
      }),
      prisma.invoice.create({
        data: {
          tenantId: tenantB.id,
          contactId: contactB.id,
          type: "SALES",
          number: `${marker}_IB`,
          date: new Date("2026-10-01"),
          notes: "foreign",
        },
      }),
    ]);

    assert.equal(
      (await api(null, "POST", "/api/bulk-operations/contacts/preview", {}))
        .status,
      401,
    );
    assert.equal(
      (
        await api(readOnly, "POST", "/api/bulk-operations/contacts/preview", {
          ids: [contactA1.id],
          field: "city",
          value: "Bursa",
        })
      ).status,
      403,
    );
    for (const body of [
      {},
      { ids: [], field: "city", value: "x" },
      { ids: [contactA1.id], field: "unknown", value: "x" },
      { ids: [contactA1.id], field: "paymentTermDays", value: -1 },
      { ids: [contactA1.id], field: "paymentTermDays", value: 1.5 },
      {
        ids: Array.from({ length: 101 }, (_, i) => `id-${i}`),
        field: "city",
        value: "x",
      },
    ]) {
      assert.equal(
        (await api(a, "POST", "/api/bulk-operations/contacts/preview", body))
          .status,
        400,
        JSON.stringify(body),
      );
    }
    for (const value of [-1, "NaN", "Infinity", 1e30]) {
      const result = await api(
        a,
        "POST",
        "/api/bulk-operations/products/preview",
        { ids: [productA.id], field: "salesPrice", value },
      );
      assert.equal(result.status, 400, `invalid decimal ${value}`);
    }
    assert.equal(
      (
        await api(a, "POST", "/api/bulk-operations/invoices/preview", {
          ids: [invoiceA.id],
          field: "dueDate",
          value: "not-a-date",
        })
      ).status,
      400,
    );

    const preview = await api(
      a,
      "POST",
      "/api/bulk-operations/contacts/preview",
      {
        ids: [contactA1.id, contactA2.id, contactA2.id, contactB.id, "missing"],
        field: "city",
        value: " İstanbul ",
      },
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.totalRequested, 4);
    assert.equal(preview.body.data.matched, 2);
    assert.equal(preview.body.data.changed, 2);
    assert.deepEqual(
      new Set(preview.body.data.missingIds),
      new Set([contactB.id, "missing"]),
    );
    assert.equal(
      (await prisma.contact.findUniqueOrThrow({ where: { id: contactA1.id } }))
        .city,
      "Ankara",
    );
    const executed = await api(
      a,
      "POST",
      "/api/bulk-operations/contacts/execute",
      {
        ids: [contactA1.id, contactA2.id, contactB.id],
        field: "city",
        value: " İstanbul ",
      },
    );
    assert.equal(executed.status, 200);
    assert.equal(executed.body.data.changed, 2);
    assert.ok(executed.body.data.auditLogId);
    assert.equal(executed.body.data.rollbackStrategy.available, true);
    assert.equal(
      (await prisma.contact.findUniqueOrThrow({ where: { id: contactA1.id } }))
        .city,
      "İstanbul",
    );
    assert.equal(
      (await prisma.contact.findUniqueOrThrow({ where: { id: contactB.id } }))
        .city,
      "İzmir",
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: tenantA.id,
          module: "bulk-operations",
          entityId: { in: [contactA1.id, contactA2.id] },
        },
      }),
      2,
    );
    const noChange = await api(
      a,
      "POST",
      "/api/bulk-operations/contacts/execute",
      { ids: [contactA1.id], field: "city", value: "İstanbul" },
    );
    assert.equal(noChange.body.data.changed, 0);
    assert.equal(noChange.body.data.auditLogId, null);

    const productResult = await api(
      a,
      "POST",
      "/api/bulk-operations/products/execute",
      {
        ids: [productA.id, productB.id],
        field: "salesPrice",
        value: "123.45678",
      },
    );
    assert.equal(productResult.status, 200);
    assert.equal(productResult.body.data.changed, 1);
    assert.equal(
      Number(
        (await prisma.product.findUniqueOrThrow({ where: { id: productA.id } }))
          .salesPrice,
      ),
      123.46,
    );
    assert.equal(
      Number(
        (await prisma.product.findUniqueOrThrow({ where: { id: productB.id } }))
          .salesPrice,
      ),
      99,
    );
    const invoiceResult = await api(
      a,
      "POST",
      "/api/bulk-operations/invoices/execute",
      {
        ids: [invoiceA.id, invoiceB.id],
        field: "notes",
        value: " TEST_E2E not ✓ ",
      },
    );
    assert.equal(invoiceResult.status, 200);
    assert.equal(invoiceResult.body.data.changed, 1);
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } }))
        .notes,
      "TEST_E2E not ✓",
    );
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } }))
        .notes,
      "foreign",
    );

    const analysis = await api(
      a,
      "POST",
      "/api/bulk-operations/imports/analyze",
      {
        target: "contacts",
        headers: ["Cari Adı", "Vergi No", "Şehir"],
        rows: [
          {
            "Cari Adı": "  Örnek   Ltd ",
            "Vergi No": "123",
            Şehir: " İstanbul ",
          },
          { "Cari Adı": "İkinci", "Vergi No": "123", Şehir: "" },
        ],
      },
    );
    assert.equal(analysis.status, 200);
    assert.equal(analysis.body.data.summary.totalRows, 2);
    assert.equal(analysis.body.data.summary.duplicateCandidates, 1);
    assert.equal(analysis.body.data.normalizedRows[0].name, "Örnek Ltd");
    assert.equal(analysis.body.data.normalizedRows[1].city, null);
    assert.equal(
      (
        await api(a, "POST", "/api/bulk-operations/imports/analyze", {
          target: "contacts",
          headers: [],
          rows: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/bulk-operations/imports/profiles", {
          name: "bad",
          target: "contacts",
          headers: ["A"],
          mappings: [
            { source: "B", target: "name", confidence: 1, learned: true },
          ],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/bulk-operations/imports/profiles", {
          name: "bad target",
          target: "contacts",
          headers: ["A"],
          mappings: [
            { source: "A", target: "salesPrice", confidence: 1, learned: true },
          ],
        })
      ).status,
      400,
    );
    const profileBodies = [
      {
        name: `${marker}_P1`,
        target: "contacts",
        headers: ["Cari Adı"],
        mappings: [
          { source: "Cari Adı", target: "name", confidence: 1, learned: true },
        ],
      },
      {
        name: `${marker}_P2`,
        target: "products",
        headers: ["Stok Kodu"],
        mappings: [
          { source: "Stok Kodu", target: "code", confidence: 1, learned: true },
        ],
      },
    ];
    const profileResponses = await Promise.all(
      profileBodies.map((body) =>
        api(a, "POST", "/api/bulk-operations/imports/profiles", body),
      ),
    );
    assert.deepEqual(
      profileResponses.map((item) => item.status),
      [201, 201],
    );
    const profiles = await api(
      a,
      "GET",
      "/api/bulk-operations/imports/profiles",
    );
    assert.equal(profiles.status, 200);
    assert.equal(profiles.body.data.length, 2);
    assert.equal(
      (await api(b, "GET", "/api/bulk-operations/imports/profiles")).body.data
        .length,
      0,
    );
    const learned = await api(
      a,
      "POST",
      "/api/bulk-operations/imports/analyze",
      {
        target: "contacts",
        headers: ["Cari Adı"],
        rows: [{ "Cari Adı": "Test" }],
      },
    );
    assert.equal(learned.body.data.profile.name, `${marker}_P1`);
    assert.equal(learned.body.data.mappings[0].learned, true);

    const concurrent = await Promise.all(
      ["Konya", "Kayseri"].map((value) =>
        api(a, "POST", "/api/bulk-operations/contacts/execute", {
          ids: [contactA1.id],
          field: "city",
          value,
        }),
      ),
    );
    assert.deepEqual(
      concurrent.map((item) => item.status),
      [200, 200],
    );
    const finalCity = (
      await prisma.contact.findUniqueOrThrow({ where: { id: contactA1.id } })
    ).city;
    assert.ok(finalCity === "Konya" || finalCity === "Kayseri");
    const latestEntityAudits = await prisma.auditLog.findMany({
      where: {
        tenantId: tenantA.id,
        module: "bulk-operations",
        entityId: contactA1.id,
      },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    assert.equal(latestEntityAudits.length, 2);
    const transitions = latestEntityAudits.map((log) => ({
      old: (log.oldValues as any).value,
      next: (log.newValues as any).value,
    }));
    assert.ok(transitions.some((item) => item.old === "İstanbul"));
    assert.ok(
      transitions.some(
        (item) => item.old === "Konya" || item.old === "Kayseri",
      ),
    );

    console.log(
      JSON.stringify(
        {
          marker,
          focusedAssertions: 50,
          contactsChanged: executed.body.data.changed,
          productPrice: Number(
            (
              await prisma.product.findUniqueOrThrow({
                where: { id: productA.id },
              })
            ).salesPrice,
          ),
          invoiceNotes: (
            await prisma.invoice.findUniqueOrThrow({
              where: { id: invoiceA.id },
            })
          ).notes,
          concurrentFinalCity: finalCity,
          profiles: profiles.body.data.length,
          tenantIsolation: "PASS",
          auditConsistency: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
