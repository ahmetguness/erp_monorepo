import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_MOBILE_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> {
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
async function api(
  s: Session | null,
  path = "",
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(`${base}/api/service/mobile-flow${path}`, {
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
    requestId = "";
  try {
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(denied)).status, 403);
    assert.equal(
      (await api(denied, "/x/checkpoint", "POST", { kind: "SERVICE_FORM" }))
        .status,
      403,
    );
    assert.equal(
      (await api(owner, `?assignedToId=${"x".repeat(101)}`)).status,
      400,
    );
    const c = await prisma.contact.create({
      data: {
        tenantId: owner.tenantId,
        type: "CUSTOMER",
        code: `${marker}_C`,
        name: `${marker} Musteri`,
        phone: "5551234567",
        address: "Test Sokak 1",
        city: "Istanbul",
      },
    });
    contactId = c.id;
    const a = await prisma.customerAsset.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        name: `${marker} Makine`,
        serialNo: `${marker}_SN`,
      },
    });
    assetId = a.id;
    const sr = await prisma.serviceRequest.create({
      data: {
        tenantId: owner.tenantId,
        contactId,
        customerAssetId: assetId,
        number: `${marker}_SR`,
        subject: `${marker} Saha Isi`,
        status: "IN_PROGRESS",
        priority: "CRITICAL",
        assignedToId: `${marker}_TECH`,
        activities: {
          create: {
            tenantId: owner.tenantId,
            activityType: "VISIT",
            notes: "FIELD_SERVICE:VISIT_NOTE:note=offline-sync",
          },
        },
      },
    });
    requestId = sr.id;
    await prisma.attachment.createMany({
      data: [
        {
          tenantId: owner.tenantId,
          entityType: "SERVICE_REQUEST",
          entityId: requestId,
          fileName: "photo.jpg",
          storagePath: `/${marker}/photo`,
          mimeType: "image/jpeg",
          tags: ["field-photo"],
        },
        {
          tenantId: owner.tenantId,
          entityType: "SERVICE_REQUEST",
          entityId: requestId,
          fileName: "sign.png",
          storagePath: `/${marker}/sign`,
          mimeType: "image/png",
          tags: ["customer-signature"],
        },
      ],
    });
    let flow = await api(owner);
    assert.equal(flow.status, 200);
    let job = flow.body.data.jobs.find((x: any) => x.id === requestId);
    assert.ok(job);
    assert.deepEqual(
      {
        photo: job.photoCount,
        signature: job.signatureCount,
        offline: job.offlineReady,
        pending: job.pendingSyncCount,
        form: job.serviceFormSubmitted,
        approval: job.customerApproved,
      },
      {
        photo: 1,
        signature: 1,
        offline: true,
        pending: 1,
        form: false,
        approval: false,
      },
    );
    assert.ok(job.lastOfflineSyncAt);
    assert.equal(
      job.steps.find((x: any) => x.key === "customer_approval").status,
      "blocked",
    );
    assert.equal(job.routeStop.city, "Istanbul");
    assert.equal(
      (
        await api(
          owner,
          `?assignedToId=${encodeURIComponent(marker + "_TECH")}`,
        )
      ).body.data.jobs.some((x: any) => x.id === requestId),
      true,
    );
    assert.equal(
      (await api(owner, "?assignedToId=other")).body.data.jobs.some(
        (x: any) => x.id === requestId,
      ),
      false,
    );
    for (const payload of [
      {},
      { kind: "BAD" },
      { kind: "SERVICE_FORM", note: "x".repeat(2001) },
      { kind: "SERVICE_FORM", customerName: "x".repeat(101) },
    ])
      assert.equal(
        (await api(owner, `/${requestId}/checkpoint`, "POST", payload)).status,
        400,
      );
    assert.equal(
      (
        await api(owner, "/missing/checkpoint", "POST", {
          kind: "SERVICE_FORM",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await api(owner, `/${requestId}/checkpoint`, "POST", {
          kind: "CUSTOMER_APPROVAL",
          customerName: "Ali",
        })
      ).status,
      400,
    );
    const forms = await Promise.all([
      api(owner, `/${requestId}/checkpoint`, "POST", {
        kind: "SERVICE_FORM",
        note: " Form Türkçe ",
      }),
      api(owner, `/${requestId}/checkpoint`, "POST", {
        kind: "SERVICE_FORM",
        note: "retry",
      }),
    ]);
    assert.deepEqual(
      forms.map((x) => x.status),
      [201, 201],
    );
    assert.equal(forms[0].body.data.id, forms[1].body.data.id);
    assert.equal(
      await prisma.serviceActivity.count({
        where: {
          serviceRequestId: requestId,
          notes: { startsWith: "FIELD_SERVICE:SERVICE_FORM" },
        },
      }),
      1,
    );
    const approval = await api(owner, `/${requestId}/checkpoint`, "POST", {
      kind: "CUSTOMER_APPROVAL",
      customerName: " Ayşe ",
      note: " Onayladı ",
    });
    assert.equal(approval.status, 201);
    const approvalRetry = await api(owner, `/${requestId}/checkpoint`, "POST", {
      kind: "CUSTOMER_APPROVAL",
      customerName: "Ayşe",
    });
    assert.equal(approvalRetry.body.data.id, approval.body.data.id);
    assert.equal(
      await prisma.serviceActivity.count({
        where: {
          serviceRequestId: requestId,
          notes: { startsWith: "FIELD_SERVICE:CUSTOMER_APPROVAL" },
        },
      }),
      1,
    );
    const visits = await Promise.all([
      api(owner, `/${requestId}/checkpoint`, "POST", {
        kind: "VISIT_NOTE",
        note: "Bir",
      }),
      api(owner, `/${requestId}/checkpoint`, "POST", {
        kind: "VISIT_NOTE",
        note: "Iki",
      }),
    ]);
    assert.equal(
      visits.every((x) => x.status === 201),
      true,
    );
    assert.notEqual(visits[0].body.data.id, visits[1].body.data.id);
    flow = await api(owner);
    job = flow.body.data.jobs.find((x: any) => x.id === requestId);
    assert.equal(job.serviceFormSubmitted, true);
    assert.equal(job.customerApproved, true);
    assert.equal(job.pendingSyncCount, 0);
    assert.equal(flow.body.data.summary.formSubmittedCount >= 1, true);
    assert.equal(flow.body.data.summary.customerApprovedCount >= 1, true);
    assert.equal(
      flow.body.data.route.some((x: any) => x.serviceRequestId === requestId),
      true,
    );
    assert.equal(
      [403, 404].includes(
        (
          await api(foreign, `/${requestId}/checkpoint`, "POST", {
            kind: "SERVICE_FORM",
          })
        ).status,
      ),
      true,
    );
    assert.equal(
      JSON.stringify((await api(foreign)).body).includes(marker),
      false,
    );
    console.log(
      "PASS field service mobile assurance: auth, filters, route/media/offline calculations, checkpoint validation/order/concurrency/idempotency, DB persistence and tenant isolation",
    );
  } finally {
    if (requestId) {
      await prisma.attachment.deleteMany({ where: { entityId: requestId } });
      await prisma.serviceRequest.deleteMany({ where: { id: requestId } });
    }
    if (assetId)
      await prisma.customerAsset.deleteMany({ where: { id: assetId } });
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
