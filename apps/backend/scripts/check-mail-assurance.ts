import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3101";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_MAIL_${Date.now()}`;
type Session = { cookie: string };

async function request(
  session: Session | null,
  path: string,
  method = "GET",
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
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}

async function login(slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin@axondemo.com",
      password: "demo1234",
      tenantSlug: slug,
    }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const createTenant = async (suffix: string) => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-${suffix}`,
        companyName: `${marker}_${suffix}`,
        email: `${suffix}-${marker}@example.test`,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        modules: [],
      },
    });
    await prisma.tenantUser.create({
      data: { tenantId: tenant.id, userId: user.id, isOwner: true },
    });
    return tenant;
  };
  const tenantA = await createTenant("a");
  const tenantB = await createTenant("b");
  try {
    const sessionA = await login(tenantA.slug);
    const sessionB = await login(tenantB.slug);
    assert.equal((await request(null, "/api/mail")).status, 401);

    const templatePayload = (name: string) => ({
      name,
      category: "TEST",
      description: "Concurrency fixture",
      subject: "Merhaba {{customerName}}",
      body: "TEST_E2E gövde {{invoiceNo}}",
      variables: [
        {
          key: "customerName",
          label: "Müşteri",
          required: true,
          example: "TEST",
        },
        {
          key: "invoiceNo",
          label: "Fatura",
          required: false,
          example: "INV-1",
        },
      ],
      approved: false,
    });
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(
          sessionA,
          "/api/mail/templates/custom",
          "POST",
          templatePayload(`${marker}_${index}`),
        ),
      ),
    );
    assert.ok(concurrent.every((result) => result.status === 201));
    const ids = concurrent.map((result) => result.body.data.id as string);
    assert.equal(new Set(ids).size, 8);
    const stored = JSON.parse(
      (
        await prisma.tenantSetting.findUniqueOrThrow({
          where: {
            tenantId_key: {
              tenantId: tenantA.id,
              key: "mail.templates.custom",
            },
          },
          select: { value: true },
        })
      ).value,
    ) as Array<{ id: string }>;
    assert.equal(
      stored.length,
      8,
      "concurrent template creates must not overwrite each other",
    );

    const rendered = await request(
      sessionA,
      "/api/mail/templates/render",
      "POST",
      {
        templateId: ids[0],
        variables: { customerName: "Türkçe İsim", invoiceNo: "TEST-1" },
      },
    );
    assert.equal(rendered.status, 200);
    assert.equal(rendered.body.data.missingVariables.length, 0);
    assert.match(rendered.body.data.subject, /Türkçe İsim/);
    assert.equal(
      (
        await request(sessionB, "/api/mail/templates/render", "POST", {
          templateId: ids[0],
          variables: {},
        })
      ).status,
      404,
    );

    const updated = await request(
      sessionA,
      `/api/mail/templates/custom/${ids[0]}`,
      "PUT",
      { ...templatePayload(`${marker}_UPDATED`), approved: true },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.version, 2);
    assert.equal(
      (
        await request(
          sessionA,
          `/api/mail/templates/custom/${ids[0]}/approval`,
          "POST",
          { approved: false },
        )
      ).status,
      200,
    );

    const historyBeforeInvalid = await prisma.mailMessage.count({
      where: { tenantId: tenantA.id },
    });
    assert.equal(
      (await request(sessionA, "/api/mail/send", "POST", null)).status,
      400,
    );
    assert.equal(
      (await request(sessionA, "/api/mail/bulk", "POST", null)).status,
      400,
    );
    for (const [path, payload] of [
      ["/api/mail/welcome", { to: "not-an-email", name: "TEST" }],
      ["/api/mail/notification", { to: "bad", title: "TEST", message: "TEST" }],
      [
        "/api/mail/invoice-notification",
        {
          to: "valid@example.test",
          name: "TEST",
          invoiceNo: "INV",
          amount: -1,
        },
      ],
      [
        "/api/mail/password-reset",
        {
          to: "valid@example.test",
          name: "TEST",
          resetUrl: "http://localhost:3000.evil.example/reset",
        },
      ],
    ] as const)
      assert.equal(
        (await request(sessionA, path, "POST", payload)).status,
        400,
      );
    assert.equal(
      await prisma.mailMessage.count({ where: { tenantId: tenantA.id } }),
      historyBeforeInvalid,
    );

    assert.equal(
      (
        await request(sessionA, "/api/mail/send", "POST", {
          to: "valid@example.test",
          subject: "TEST",
          html: "TEST",
          attachments: [{ filename: "bad.txt", content: "%%%not-base64%%%" }],
        })
      ).status,
      400,
    );

    const bulk = await request(sessionA, "/api/mail/bulk", "POST", {
      recipients: ["recipient@example.test", "RECIPIENT@example.test"],
      subject: `${marker} {{customerName}}`,
      html: "<p>TEST_E2E {{customerName}}</p>",
      personalizations: [
        {
          recipient: "recipient@example.test",
          variables: { customerName: "Ayşe" },
        },
      ],
      attachments: [
        {
          filename: "test.txt",
          content: Buffer.from("TEST_E2E").toString("base64"),
          contentType: "text/plain",
        },
      ],
    });
    assert.equal(bulk.status, 200);
    assert.equal(
      bulk.body.sent,
      1,
      "case-insensitive duplicate recipient must produce one delivery",
    );
    const mail = await prisma.mailMessage.findFirstOrThrow({
      where: { tenantId: tenantA.id, subject: { contains: marker } },
    });
    assert.equal(mail.status, "SENT");
    assert.equal(mail.attachmentCount, 1);
    assert.deepEqual(mail.to, ["recipient@example.test"]);
    assert.match(mail.subject, /Ayşe/);

    const list = await request(
      sessionA,
      `/api/mail?search=${encodeURIComponent(marker)}&direction=OUTBOUND&status=SENT&page=1&limit=10`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.meta.total, 1);
    assert.equal((await request(sessionB, `/api/mail/${mail.id}`)).status, 404);
    assert.equal((await request(sessionA, `/api/mail/${mail.id}`)).status, 200);
    const summary = await request(sessionA, "/api/mail/summary");
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.sentCount, 1);
    assert.equal(summary.body.data.attachmentCount, 1);

    for (const id of ids)
      assert.equal(
        (await request(sessionA, `/api/mail/templates/custom/${id}`, "DELETE"))
          .status,
        200,
      );
    assert.equal(
      JSON.parse(
        (
          await prisma.tenantSetting.findUniqueOrThrow({
            where: {
              tenantId_key: {
                tenantId: tenantA.id,
                key: "mail.templates.custom",
              },
            },
            select: { value: true },
          })
        ).value,
      ).length,
      0,
    );
    console.log(
      "Mail assurance PASS: auth, validation, safe mock delivery, history/detail/summary, filters, attachments, tenant isolation, template CRUD/render and concurrent persistence.",
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
    assert.equal(
      await prisma.tenant.count({
        where: { companyName: { startsWith: marker } },
      }),
      0,
    );
    assert.equal(
      await prisma.mailMessage.count({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      }),
      0,
    );
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
