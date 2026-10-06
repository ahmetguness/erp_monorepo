import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { storageService } from "../src/services/storage.service.js";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_DOCUMENT_${Date.now()}`;
type Session = { cookie: string };

async function api(
  session: Session | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(!multipart && body !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* binary or plain response */
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
function uploadForm(
  entityId: string,
  name: string,
  content: string,
  type = "text/plain",
  metadata: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("entityType", "CONTACT");
  form.set("entityId", entityId);
  form.set("file", new File([content], name, { type }));
  for (const [key, value] of Object.entries(metadata)) form.set(key, value);
  return form;
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const readerUser = await prisma.user.findUniqueOrThrow({
    where: { email: "muhasebe@axondemo.com" },
  });
  const creatorUser = await prisma.user.findUniqueOrThrow({
    where: { email: "satis@axondemo.com" },
  });
  const deleterUser = await prisma.user.findUniqueOrThrow({
    where: { email: "depo@axondemo.com" },
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
  const storagePaths = new Set<string>();
  try {
    const readerRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_READ`,
        permissions: { create: [{ module: "attachments", action: "READ" }] },
      },
    });
    const creatorRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_CREATE`,
        permissions: {
          create: [
            { module: "attachments", action: "READ" },
            { module: "attachments", action: "CREATE" },
            { module: "invoicing", action: "CREATE" },
          ],
        },
      },
    });
    const deleterRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        name: `${marker}_DELETE`,
        permissions: {
          create: [
            { module: "attachments", action: "READ" },
            { module: "attachments", action: "DELETE" },
          ],
        },
      },
    });
    await prisma.tenantUser.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, isOwner: true },
        { tenantId: tenantB.id, userId: owner.id, isOwner: true },
        { tenantId: tenantA.id, userId: readerUser.id, roleId: readerRole.id },
        {
          tenantId: tenantA.id,
          userId: creatorUser.id,
          roleId: creatorRole.id,
        },
        {
          tenantId: tenantA.id,
          userId: deleterUser.id,
          roleId: deleterRole.id,
        },
      ],
    });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);
    const reader = await login(readerUser.email, tenantA.slug);
    const creator = await login(creatorUser.email, tenantA.slug);
    const deleter = await login(deleterUser.email, tenantA.slug);
    const contactA = await prisma.contact.create({
      data: {
        tenantId: tenantA.id,
        type: "CUSTOMER",
        code: `${marker}_CA`,
        name: `${marker} Türkçe Cari`,
        taxNumber: "1234567890",
      },
    });
    const contactB = await prisma.contact.create({
      data: {
        tenantId: tenantB.id,
        type: "CUSTOMER",
        code: `${marker}_CB`,
        name: `${marker} Foreign`,
      },
    });

    assert.equal(
      (await api(null, "GET", "/api/attachments/library")).status,
      401,
    );
    assert.equal(
      (await api(reader, "GET", "/api/attachments/library")).status,
      200,
    );
    assert.equal(
      (
        await api(
          reader,
          "POST",
          "/api/attachments/upload",
          uploadForm(contactA.id, "x.txt", "x"),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          a,
          "POST",
          "/api/attachments/upload",
          uploadForm(contactB.id, "foreign.txt", "x"),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          a,
          "POST",
          "/api/attachments/upload",
          uploadForm(contactA.id, "empty.txt", ""),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          a,
          "POST",
          "/api/attachments/upload",
          uploadForm(contactA.id, "bad.exe", "x", "application/octet-stream"),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          creator,
          "POST",
          "/api/attachments/upload",
          uploadForm(contactA.id, "secret.txt", "x", "text/plain", {
            confidentiality: "CONFIDENTIAL",
          }),
        )
      ).status,
      403,
    );

    const publicUpload = await api(
      creator,
      "POST",
      "/api/attachments/upload",
      uploadForm(
        contactA.id,
        `${marker}_sözleşme.txt`,
        "Fatura No: OCR-100\nVergi No: 1234567890\nGenel Toplam: 1200,00\nKDV Toplam: 200,00",
        "text/plain",
        {
          category: "CONTRACT",
          documentKind: "CONTRACT",
          confidentiality: "INTERNAL",
          tags: "Türkçe, sözleşme",
          validFrom: "2026-01-01",
          validUntil: "2026-10-20",
          version: "1",
        },
      ),
    );
    assert.equal(publicUpload.status, 201, JSON.stringify(publicUpload.body));
    const publicId = publicUpload.body.data.id as string;
    storagePaths.add(publicUpload.body.data.storagePath);
    const confidentialUpload = await api(
      a,
      "POST",
      "/api/attachments/upload",
      uploadForm(
        contactA.id,
        `${marker}_gizli.pdf`,
        "%PDF-1.4 test",
        "application/pdf",
        { confidentiality: "CONFIDENTIAL", category: "CUSTOMER" },
      ),
    );
    assert.equal(confidentialUpload.status, 201);
    const confidentialId = confidentialUpload.body.data.id as string;
    storagePaths.add(confidentialUpload.body.data.storagePath);
    assert.equal(
      await prisma.attachment.count({ where: { tenantId: tenantA.id } }),
      2,
    );
    assert.equal(
      await prisma.storageReservation.count({
        where: { tenantId: tenantA.id, status: "COMMITTED" },
      }),
      2,
    );
    assert.equal(
      Number(
        (
          await prisma.tenantStorageUsage.findUniqueOrThrow({
            where: { tenantId: tenantA.id },
          })
        ).usedBytes,
      ),
      Number(publicUpload.body.data.fileSize) +
        Number(confidentialUpload.body.data.fileSize),
    );

    for (const query of [
      "page=x",
      "page=0",
      "limit=0",
      "limit=101",
      "category=INVALID",
      "source=INVALID",
      "entityType=INVALID",
    ])
      assert.equal(
        (await api(a, "GET", `/api/attachments/library?${query}`)).status,
        400,
        query,
      );
    const ownerList = await api(
      a,
      "GET",
      `/api/attachments/library?search=${encodeURIComponent(marker)}&category=CONTRACT&source=ATTACHMENT&page=1&limit=1`,
    );
    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.body.meta.total, 1);
    assert.equal(ownerList.body.data[0].id, publicId);
    assert.equal(ownerList.body.data[0].lifecycleStatus, "EXPIRING_SOON");
    assert.equal(ownerList.body.data[0].ocrStatus, "TEXT_READY");
    const readerList = await api(
      reader,
      "GET",
      `/api/attachments/library?search=${encodeURIComponent(marker)}`,
    );
    assert.equal(readerList.body.meta.total, 1);
    assert.equal(readerList.body.meta.summary.confidentialCount, 0);
    assert.equal(
      (await api(reader, "GET", `/api/attachments/${confidentialId}/download`))
        .status,
      403,
    );
    assert.equal(
      (
        await api(
          reader,
          "GET",
          `/api/intelligence/ocr/attachments/${confidentialId}/draft`,
        )
      ).status,
      404,
    );
    assert.equal(
      (await api(b, "GET", `/api/attachments/${publicId}/download`)).status,
      404,
    );
    assert.equal(
      (
        await api(
          b,
          "GET",
          `/api/intelligence/ocr/attachments/${publicId}/draft`,
        )
      ).status,
      404,
    );
    assert.equal(
      (await api(deleter, "DELETE", `/api/attachments/${confidentialId}`))
        .status,
      403,
    );

    const signed = await api(
      reader,
      "GET",
      `/api/attachments/${publicId}/signed-url`,
    );
    assert.equal(signed.status, 200);
    assert.match(
      signed.body.data.url,
      new RegExp(`/api/attachments/${publicId}/download`),
    );
    const downloaded = await api(
      reader,
      "GET",
      `/api/attachments/${publicId}/download`,
    );
    assert.equal(downloaded.status, 200);
    assert.match(String(downloaded.body), /Fatura No: OCR-100/);
    assert.match(
      downloaded.headers.get("content-disposition") ?? "",
      /attachment/,
    );
    const logs = await api(
      reader,
      "GET",
      `/api/attachments/${publicId}/access-log`,
    );
    assert.equal(logs.status, 200);
    assert.ok(logs.body.data.some((item: any) => item.action === "OTHER"));

    const renamed = await api(a, "PATCH", `/api/attachments/${publicId}`, {
      fileName: `${marker}_contract.txt`,
      version: 2,
      tags: ["güncel", "güncel"],
      validUntil: "2026-11-30",
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.version, 2);
    assert.deepEqual(renamed.body.data.tags, ["güncel"]);
    assert.equal(
      (await api(a, "PATCH", `/api/attachments/${publicId}`, { version: "2x" }))
        .status,
      400,
    );
    assert.equal(
      (
        await api(a, "PATCH", `/api/attachments/${publicId}`, {
          validFrom: "2027-01-01",
          validUntil: "2026-01-01",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(reader, "PATCH", `/api/attachments/${publicId}`, {
          fileName: "no.txt",
        })
      ).status,
      403,
    );

    const versionCalls = await Promise.all(
      [1, 2].map(() =>
        api(
          a,
          "POST",
          `/api/attachments/${publicId}/version`,
          uploadForm(contactA.id, "replacement.txt", "replacement"),
        ),
      ),
    );
    assert.deepEqual(
      versionCalls.map((item) => item.status).sort(),
      [201, 409],
      JSON.stringify(
        versionCalls.map((item) => ({ status: item.status, body: item.body })),
      ),
    );
    versionCalls
      .filter((item) => item.status === 201)
      .forEach((item) => storagePaths.add(item.body.data.storagePath));
    const versions = await prisma.attachment.findMany({
      where: {
        tenantId: tenantA.id,
        entityType: "CONTACT",
        entityId: contactA.id,
        fileName: `${marker}_contract.txt`,
      },
      orderBy: { version: "asc" },
    });
    assert.deepEqual(
      versions.map((item) => item.version),
      [2, 3],
    );

    const bulk = await api(a, "POST", "/api/attachments/bulk-metadata", {
      ids: [publicId, confidentialId, "missing"],
      metadata: { category: "OTHER", tags: ["bulk"], version: 5 },
    });
    assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
    assert.equal(bulk.body.data.updatedCount, 2);
    assert.equal(bulk.body.data.skippedCount, 1);
    assert.equal(
      (await prisma.attachment.findUniqueOrThrow({ where: { id: publicId } }))
        .version,
      5,
    );
    assert.equal(
      (
        await api(reader, "POST", "/api/attachments/bulk-metadata", {
          ids: [publicId],
          metadata: { tags: ["no"] },
        })
      ).status,
      403,
    );

    const ocrUpload = await api(
      creator,
      "POST",
      "/api/attachments/upload",
      uploadForm(
        contactA.id,
        `${marker}_ocr.txt`,
        "Fatura No: OCR-200\nVergi No: 1234567890\nGenel Toplam: 1200,00\nKDV Toplam: 200,00",
      ),
    );
    assert.equal(ocrUpload.status, 201);
    const ocrId = ocrUpload.body.data.id as string;
    storagePaths.add(ocrUpload.body.data.storagePath);
    const draft = await api(
      creator,
      "GET",
      `/api/intelligence/ocr/attachments/${ocrId}/draft`,
    );
    assert.equal(draft.status, 200);
    assert.equal(draft.body.data.status, "DRAFT_READY");
    assert.equal(draft.body.data.suggestion.draftData.totalNet, 1000);
    assert.equal(draft.body.data.suggestion.draftData.totalTax, 200);
    assert.equal(draft.body.data.suggestion.draftData.totalGross, 1200);
    assert.equal(
      draft.body.data.suggestion.draftData.matchedContactId,
      contactA.id,
    );
    const approved = await api(
      creator,
      "POST",
      "/api/intelligence/ai/execute-suggestion",
      {
        useCase: "INVOICE_OCR",
        draftData: draft.body.data.suggestion.draftData,
      },
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const invoiceId = approved.body.data.resultId as string;
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: true },
    });
    assert.equal(invoice.tenantId, tenantA.id);
    assert.equal(Number(invoice.totalGross), 1200);
    assert.equal(invoice.lines.length, 1);
    const relinked = await prisma.attachment.findUniqueOrThrow({
      where: { id: ocrId },
    });
    assert.equal(relinked.entityType, "INVOICE");
    assert.equal(relinked.entityId, invoiceId);
    const retry = await api(
      creator,
      "POST",
      "/api/intelligence/ai/execute-suggestion",
      {
        useCase: "INVOICE_OCR",
        draftData: draft.body.data.suggestion.draftData,
      },
    );
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.resultId, invoiceId);
    assert.equal(
      await prisma.invoice.count({ where: { tenantId: tenantA.id } }),
      1,
    );

    await prisma.mailMessage.create({
      data: {
        tenantId: tenantA.id,
        direction: "OUTBOUND",
        status: "SENT",
        to: [owner.email],
        subject: `${marker} Mail`,
        html: "<p>x</p>",
        sentById: owner.id,
        attachmentCount: 1,
        attachments: [
          {
            filename: `${marker}_mail.csv`,
            contentType: "text/csv",
            sizeBytes: 42,
          },
        ],
      },
    });
    const mailList = await api(
      a,
      "GET",
      `/api/attachments/library?source=MAIL&search=${encodeURIComponent(marker)}`,
    );
    assert.equal(mailList.status, 200);
    assert.equal(mailList.body.meta.total, 1);
    assert.equal(mailList.body.data[0].source, "MAIL");
    assert.equal(mailList.body.data[0].downloadUrl, null);
    assert.equal(
      (
        await api(
          reader,
          "GET",
          `/api/attachments/library?source=MAIL&search=${encodeURIComponent(marker)}`,
        )
      ).body.meta.total,
      0,
    );

    const deletePath = confidentialUpload.body.data.storagePath as string;
    const removed = await api(
      a,
      "DELETE",
      `/api/attachments/${confidentialId}`,
    );
    assert.equal(removed.status, 200);
    assert.equal(
      await prisma.attachment.count({ where: { id: confidentialId } }),
      0,
    );
    assert.equal(await storageService.get(deletePath), null);
    assert.equal(
      (await api(a, "GET", `/api/attachments/${confidentialId}/download`))
        .status,
      404,
    );
    console.log(
      JSON.stringify(
        {
          marker,
          attachmentCrud: "PASS",
          versionUniqueness: "PASS",
          tenantIsolation: "PASS",
          confidentialIsolation: "PASS",
          ocrInvoiceDraft: invoiceId,
          totals: { net: 1000, tax: 200, gross: 1200 },
          mailIntegration: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    const rows = await prisma.attachment
      .findMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
        select: { storagePath: true },
      })
      .catch(() => []);
    rows.forEach((row) => storagePaths.add(row.storagePath));
    for (const path of storagePaths)
      await storageService.delete(path).catch(() => undefined);
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
