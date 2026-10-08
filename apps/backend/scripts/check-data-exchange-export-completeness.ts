import assert from "node:assert/strict";
import { PermissionAction, PrismaClient } from "@prisma/client";
import { parseCsv } from "../src/utils/csv.js";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_DATA_EXCHANGE_EXPORT_${Date.now()}`;
const CONTACT_COUNT = 5_055;
type Session = { cookie: string };

async function request(session: Session | null, path: string) {
  const response = await fetch(`${base}${path}`, {
    headers: { origin, ...(session ? { cookie: session.cookie } : {}) },
  });
  return { response, text: await response.text() };
}

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200, `${email} login failed`);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const restrictedUser = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const tenantA = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-a`,
      companyName: `${marker}_A`,
      email: `${marker}-a@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: [],
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-b`,
      companyName: `${marker}_B`,
      email: `${marker}-b@example.test`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: [],
    },
  });

  try {
    const restrictedRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_RESTRICTED`,
        permissions: {
          create: [{ module: "settings", action: PermissionAction.READ }],
        },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
        {
          tenantId: tenantA.id,
          userId: restrictedUser.id,
          roleId: restrictedRole.id,
        },
      ],
    });

    const contacts = Array.from({ length: CONTACT_COUNT }, (_, index) => ({
      tenantId: tenantA.id,
      type: "CUSTOMER" as const,
      code: `${marker}_C_${String(index).padStart(5, "0")}`,
      name:
        index === 0
          ? "=2+3"
          : index === 1
            ? "İstanbul, Merkez"
            : index === 2
              ? 'Türkçe "Tırnak"\nİkinci Satır'
              : `${marker} Cari ${String(index).padStart(5, "0")}`,
      email:
        index === 3 ? null : `${marker.toLowerCase()}-${index}@example.test`,
      phone: index === 4 ? null : `555${String(index).padStart(7, "0")}`,
      city: index === 1 ? "İzmir" : "Ankara",
      country: "Türkiye",
    }));
    await prisma.contact.createMany({ data: contacts });
    const invoiceContact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: tenantA.id, code: contacts[10].code },
    });
    const foreignCode = `${marker}_TENANT_B_SECRET`;
    await prisma.contact.create({
      data: {
        tenantId: tenantB.id,
        type: "CUSTOMER",
        code: foreignCode,
        name: `${marker}_TENANT_B_SECRET`,
      },
    });

    const unit = await prisma.unit.create({
      data: { tenantId: tenantA.id, code: `${marker}_U`, name: "Adet" },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: "Ürün, Özel",
        salesPrice: 12.34,
        purchasePrice: 5.67,
        minStockLevel: 1,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenantA.id, code: `${marker}_W`, name: "Ana Depo" },
    });
    const location = await prisma.location.create({
      data: {
        tenantId: tenantA.id,
        warehouseId: warehouse.id,
        code: `${marker}_L`,
        name: "Ana Lokasyon",
      },
    });
    await prisma.stockLevel.create({
      data: {
        tenantId: tenantA.id,
        productId: product.id,
        warehouseId: warehouse.id,
        locationId: location.id,
        quantity: 42.125,
      },
    });
    await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        contactId: invoiceContact.id,
        type: "SALES",
        number: `${marker}_INV`,
        date: new Date("2026-10-07T00:00:00.000Z"),
        totalNet: 100,
        totalGross: 100,
      },
    });

    const ownerSession = await login(owner.email, tenantA.slug);
    const restrictedSession = await login(restrictedUser.email, tenantA.slug);
    assert.equal(
      (await request(null, "/api/data-exchange/export/contacts")).response
        .status,
      401,
    );
    for (const entity of ["products", "contacts", "stock", "invoices"]) {
      assert.equal(
        (
          await request(
            restrictedSession,
            `/api/data-exchange/export/${entity}`,
          )
        ).response.status,
        403,
        `${entity} export permission`,
      );
    }

    const expectedHeaders = {
      products: [
        "code",
        "name",
        "barcode",
        "salesPrice",
        "purchasePrice",
        "minStockLevel",
        "isActive",
      ],
      contacts: [
        "type",
        "code",
        "name",
        "taxNumber",
        "email",
        "phone",
        "city",
        "country",
        "isActive",
      ],
      stock: [
        "productCode",
        "productName",
        "warehouseCode",
        "warehouseName",
        "quantity",
      ],
      invoices: [
        "number",
        "type",
        "status",
        "contactName",
        "date",
        "dueDate",
        "currencyCode",
        "totalGross",
      ],
    } as const;
    const dbCounts = {
      products: await prisma.product.count({
        where: { tenantId: tenantA.id, deletedAt: null },
      }),
      contacts: await prisma.contact.count({
        where: { tenantId: tenantA.id, deletedAt: null },
      }),
      stock: await prisma.stockLevel.count({ where: { tenantId: tenantA.id } }),
      invoices: await prisma.invoice.count({
        where: { tenantId: tenantA.id, deletedAt: null },
      }),
    };
    const exportedCounts: Record<string, number> = {};
    for (const entity of [
      "products",
      "contacts",
      "stock",
      "invoices",
    ] as const) {
      const result = await request(
        ownerSession,
        `/api/data-exchange/export/${entity}`,
      );
      assert.equal(result.response.status, 200, `${entity} export status`);
      assert.match(
        result.response.headers.get("content-type") ?? "",
        /text\/csv; charset=utf-8/,
      );
      assert.match(result.text, /\r\n/);
      const parsed = parseCsv(result.text);
      assert.deepEqual(parsed.headers, [...expectedHeaders[entity]]);
      exportedCounts[entity] = parsed.rows.length;
      assert.equal(
        parsed.rows.length,
        dbCounts[entity],
        `${entity}: DB eligible and CSV row counts differ`,
      );
      assert.doesNotMatch(result.text, new RegExp(foreignCode));
    }

    const contactCsv = await request(
      ownerSession,
      "/api/data-exchange/export/contacts",
    );
    const contactRows = parseCsv(contactCsv.text).rows;
    assert.equal(contactRows.length, CONTACT_COUNT);
    assert.equal(
      contactRows.find((row) => row.name === "'=2+3")?.name,
      "'=2+3",
    );
    assert.equal(
      contactRows.find((row) => row.name === "İstanbul, Merkez")?.city,
      "İzmir",
    );
    assert.equal(
      contactRows.find((row) => row.name.includes("İkinci Satır"))?.name,
      'Türkçe "Tırnak"\nİkinci Satır',
    );
    assert.equal(
      contactRows.find((row) => row.code === contacts[4].code)?.phone,
      "",
    );

    console.log(
      JSON.stringify(
        {
          marker,
          preFixLimit: 5_000,
          dbCounts,
          exportedCounts,
          tenantIsolation: "PASS",
          permissions: "PASS",
          csvCorrectness: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
