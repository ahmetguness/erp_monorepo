import assert from "node:assert/strict";
import { PermissionAction, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_DATA_EXCHANGE_${Date.now()}`;
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
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* CSV */
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug: slug }),
  });
  assert.equal(response.status, 200, `${email} login`);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const readerUser = await prisma.user.findUniqueOrThrow({
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
    const readerRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ`,
        permissions: {
          create: [{ module: "contacts", action: PermissionAction.READ }],
        },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: readerUser.id, roleId: readerRole.id },
      ],
    });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);
    const reader = await login(readerUser.email, tenantA.slug);

    const source = await prisma.contact.create({
      data: {
        tenantId: tenantA.id,
        type: "CUSTOMER",
        code: `${marker}_DUP_A`,
        name: "=2+3",
        email: `${marker.toLowerCase()}@example.test`,
        taxNumber: "9999999999",
        city: "İstanbul",
      },
    });
    const target = await prisma.contact.create({
      data: {
        tenantId: tenantA.id,
        type: "CUSTOMER",
        code: `${marker}_DUP_B`,
        name: `${marker}, Türkçe`,
        email: `${marker.toLowerCase()}@example.test`,
        taxNumber: "9999999999",
        city: "Ankara",
      },
    });
    await prisma.contact.create({
      data: {
        tenantId: tenantB.id,
        type: "CUSTOMER",
        code: `${marker}_FOREIGN`,
        name: `${marker}_FOREIGN`,
      },
    });
    const unit = await prisma.unit.create({
      data: {
        tenantId: tenantA.id,
        code: `${marker}_UNIT`,
        name: `${marker} Unit`,
      },
    });
    await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        unitId: unit.id,
        code: `${marker}_QUALITY_PRODUCT`,
        name: `${marker} Quality Product`,
        salesPrice: 0,
        purchasePrice: 0,
        minStockLevel: 0,
      },
    });

    assert.equal(
      (await api(null, "GET", "/api/data-exchange/import/batches")).status,
      401,
    );
    const template = await api(
      a,
      "GET",
      "/api/data-exchange/templates/contacts",
    );
    assert.equal(template.status, 200);
    assert.match(
      String(template.body),
      /^﻿?type,code,name,taxNumber,email,phone,city,country,isActive/,
    );
    assert.match(
      template.headers.get("content-disposition") ?? "",
      /contacts-template\.csv/,
    );
    assert.equal(
      (await api(a, "GET", "/api/data-exchange/templates/unknown")).status,
      400,
    );

    const exported = await api(a, "GET", "/api/data-exchange/export/contacts");
    assert.equal(exported.status, 200);
    assert.match(String(exported.body), /'=2\+3/);
    assert.doesNotMatch(String(exported.body), new RegExp(`${marker}_FOREIGN`));
    const foreignExport = await api(
      b,
      "GET",
      "/api/data-exchange/export/contacts",
    );
    assert.match(String(foreignExport.body), new RegExp(`${marker}_FOREIGN`));
    assert.doesNotMatch(
      String(foreignExport.body),
      new RegExp(`${marker}_DUP_A`),
    );

    const validCsv = `code,name,barcode,salesPrice,purchasePrice,minStockLevel,isActive\n${marker}_P1,Ürün Bir,,10.25,5.10,2,true`;
    const valid = await api(
      a,
      "POST",
      "/api/data-exchange/import/preview/products",
      { csv: validCsv },
    );
    assert.equal(valid.status, 200);
    assert.equal(valid.body.data.validRows, 1);
    assert.equal(valid.body.data.invalidRows, 0);
    assert.equal(valid.body.data.batchPlan.canImportValidRows, true);
    assert.equal(
      await prisma.product.count({
        where: { tenantId: tenantA.id, code: `${marker}_P1` },
      }),
      0,
    );

    const invalid = await api(
      a,
      "POST",
      "/api/data-exchange/import/preview/products",
      { csv: `code,name,salesPrice,isActive\n${marker}_BAD,Bozuk,-1,belki` },
    );
    assert.equal(invalid.status, 200);
    assert.equal(invalid.body.data.invalidRows, 1);
    assert.match(invalid.body.data.rows[0].errors.join(" "), /salesPrice/);
    assert.match(invalid.body.data.rows[0].errors.join(" "), /isActive/);
    assert.equal(invalid.body.data.batchPlan.canImportValidRows, false);

    const contactInvalid = await api(
      a,
      "POST",
      "/api/data-exchange/import/preview/contacts",
      { csv: "type,name,email\nALIEN,Test,wrong-email" },
    );
    assert.equal(contactInvalid.body.data.invalidRows, 1);
    assert.match(contactInvalid.body.data.rows[0].errors.join(" "), /type/);
    assert.match(contactInvalid.body.data.rows[0].errors.join(" "), /email/);
    const stockInvalid = await api(
      a,
      "POST",
      "/api/data-exchange/import/preview/stock",
      { csv: "productCode,warehouseCode,quantity\nP,W,NaN" },
    );
    assert.equal(stockInvalid.body.data.invalidRows, 1);
    const invoiceInvalid = await api(
      a,
      "POST",
      "/api/data-exchange/import/preview/invoices",
      {
        csv: "number,type,contactName,date,totalGross\nF1,OTHER,Cari,no-date,Infinity",
      },
    );
    assert.equal(invoiceInvalid.body.data.invalidRows, 1);
    assert.equal(
      (
        await api(a, "POST", "/api/data-exchange/import/preview/products", {
          csv: "code,code,name\nA,B,C",
        })
      ).body.data.errors.length,
      1,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/data-exchange/import/preview/contacts", {
          csv: 'type,name,email\r\nCUSTOMER,"İstanbul, Merkez\nŞube",sube@example.test',
        })
      ).body.data.validRows,
      1,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/data-exchange/import/preview/products", {
          csv: "kod,ad\nK1,Ad",
          mapping: { code: "kod", name: "ad" },
        })
      ).body.data.validRows,
      1,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/data-exchange/import/preview/products", {
          csv: "",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(a, "POST", "/api/data-exchange/import/preview/products", {
          csv: `code,name\nA,B${"x".repeat(2 * 1024 * 1024)}`,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          reader,
          "POST",
          "/api/data-exchange/import/preview/contacts",
          { csv: "type,name\nCUSTOMER,X" },
        )
      ).status,
      403,
    );

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        api(a, "POST", "/api/data-exchange/import/preview/contacts", {
          csv: `type,name,code\nCUSTOMER,${marker}_${index},${marker}_C${index}`,
        }),
      ),
    );
    assert.ok(concurrent.every((result) => result.status === 200));
    const concurrentIds = concurrent.map(
      (result) => result.body.data.batchPlan.batchId,
    );
    const batches = await api(a, "GET", "/api/data-exchange/import/batches");
    assert.equal(batches.status, 200);
    assert.ok(
      concurrentIds.every((id) =>
        batches.body.data.some((item: any) => item.batchId === id),
      ),
    );
    const readerBatches = await api(
      reader,
      "GET",
      "/api/data-exchange/import/batches",
    );
    assert.equal(readerBatches.status, 200);
    assert.ok(
      readerBatches.body.data.every((item: any) => item.entity === "contacts"),
    );
    assert.equal(
      (await api(b, "GET", "/api/data-exchange/import/batches")).body.data
        .length,
      0,
    );

    const rollbackId = concurrentIds[0];
    assert.equal(
      (
        await api(
          reader,
          "POST",
          `/api/data-exchange/import/batches/${rollbackId}/rollback`,
        )
      ).status,
      403,
    );
    const rolled = await api(
      a,
      "POST",
      `/api/data-exchange/import/batches/${rollbackId}/rollback`,
    );
    assert.equal(rolled.status, 200);
    assert.equal(rolled.body.data.status, "ROLLED_BACK");
    const rolledAgain = await api(
      a,
      "POST",
      `/api/data-exchange/import/batches/${rollbackId}/rollback`,
    );
    assert.equal(rolledAgain.status, 200);
    assert.equal(
      rolledAgain.body.data.rolledBackAt,
      rolled.body.data.rolledBackAt,
    );
    assert.equal(
      (
        await api(
          b,
          "POST",
          `/api/data-exchange/import/batches/${rollbackId}/rollback`,
        )
      ).status,
      404,
    );

    const quality = await api(a, "GET", "/api/data-exchange/quality");
    assert.equal(quality.status, 200);
    assert.ok(
      quality.body.data.issues.some(
        (issue: any) => issue.key === "contacts.duplicate_contact",
      ),
    );
    const readerQuality = await api(
      reader,
      "GET",
      "/api/data-exchange/quality",
    );
    assert.equal(readerQuality.status, 200);
    assert.ok(
      readerQuality.body.data.issues.every(
        (issue: any) => issue.category === "contacts",
      ),
    );
    assert.equal(
      (
        await api(
          reader,
          "POST",
          "/api/data-exchange/quality/inventory.missing_min_stock/task",
        )
      ).status,
      403,
    );
    const taskResults = await Promise.all([
      api(
        a,
        "POST",
        "/api/data-exchange/quality/contacts.duplicate_contact/task",
      ),
      api(
        a,
        "POST",
        "/api/data-exchange/quality/contacts.duplicate_contact/task",
      ),
    ]);
    assert.ok(taskResults.every((result) => result.status === 201));
    assert.equal(
      taskResults[0].body.data.taskId,
      taskResults[1].body.data.taskId,
    );
    assert.equal(
      await prisma.task.count({
        where: {
          tenantId: tenantA.id,
          source: "data-quality:contacts.duplicate_contact",
        },
      }),
      1,
    );

    const scan = await api(
      a,
      "GET",
      "/api/data-exchange/quality/duplicates/contacts",
    );
    assert.equal(scan.status, 200);
    const candidate = scan.body.data.find(
      (item: any) =>
        [item.left.id, item.right.id].includes(source.id) &&
        [item.left.id, item.right.id].includes(target.id),
    );
    assert.ok(candidate);
    assert.equal(
      (
        await api(
          a,
          "POST",
          "/api/data-exchange/quality/duplicates/contacts/preview",
          { sourceId: source.id, targetId: source.id, fieldWinners: {} },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          b,
          "POST",
          "/api/data-exchange/quality/duplicates/contacts/preview",
          { sourceId: source.id, targetId: target.id, fieldWinners: {} },
        )
      ).status,
      404,
    );
    const mergeResults = await Promise.all([
      api(a, "POST", "/api/data-exchange/quality/duplicates/contacts/merge", {
        sourceId: source.id,
        targetId: target.id,
        fieldWinners: { city: "source" },
      }),
      api(a, "POST", "/api/data-exchange/quality/duplicates/contacts/merge", {
        sourceId: source.id,
        targetId: target.id,
        fieldWinners: { city: "source" },
      }),
    ]);
    assert.equal(
      mergeResults.filter((result) => result.status === 200).length,
      1,
    );
    const merged = mergeResults.find((result) => result.status === 200)!;
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: tenantA.id,
          module: "data-deduplication",
          entityId: target.id,
        },
      }),
      1,
    );
    assert.equal(
      (await prisma.contact.findUniqueOrThrow({ where: { id: source.id } }))
        .deletedAt !== null,
      true,
    );
    const rollbackMerge = await api(
      a,
      "POST",
      `/api/data-exchange/quality/duplicates/contacts/rollback/${merged.body.data.auditLogId}`,
    );
    assert.equal(rollbackMerge.status, 200);
    assert.equal(
      (await prisma.contact.findUniqueOrThrow({ where: { id: source.id } }))
        .deletedAt,
      null,
    );
    assert.equal(
      (
        await api(
          a,
          "POST",
          `/api/data-exchange/quality/duplicates/contacts/rollback/${merged.body.data.auditLogId}`,
        )
      ).status,
      400,
    );

    console.log(
      JSON.stringify(
        {
          marker,
          csvValidation: "PASS",
          exportIsolation: "PASS",
          formulaInjection: "PASS",
          concurrentBatchHistory: "PASS",
          rollbackAuthorization: "PASS",
          qualityTaskIdempotency: "PASS",
          dedupMergeRollback: "PASS",
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
