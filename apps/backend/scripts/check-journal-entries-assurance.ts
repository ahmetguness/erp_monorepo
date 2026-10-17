import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_JOURNAL_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

interface ApiResult {
  status: number;
  body: unknown;
}

interface JournalLineView extends Record<string, unknown> {
  debit: number | string;
  credit: number | string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(isRecord(value), `${label} nesne olmalıdır.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} metin olmalıdır.`);
  return value as string;
}

function requireDataRecord(result: ApiResult): Record<string, unknown> {
  return requireRecord(requireRecord(result.body, "response").data, "response.data");
}

function requireDataArray(result: ApiResult): Record<string, unknown>[] {
  const data = requireRecord(result.body, "response").data;
  assert.ok(Array.isArray(data), "response.data dizi olmalıdır.");
  return data.map((item, index) => requireRecord(item, `response.data[${index}]`));
}

function requireMetaRecord(result: ApiResult): Record<string, unknown> {
  return requireRecord(requireRecord(result.body, "response").meta, "response.meta");
}

function requireJournalLines(value: unknown): JournalLineView[] {
  assert.ok(Array.isArray(value), "journal lines dizi olmalıdır.");
  return value.map((line, index) => {
    const record = requireRecord(line, `journal line ${index}`);
    assert.ok(typeof record.debit === "number" || typeof record.debit === "string");
    assert.ok(typeof record.credit === "number" || typeof record.credit === "string");
    return { ...record, debit: record.debit, credit: record.credit };
  });
}

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  const body: unknown = await response.json();
  const tenant = requireRecord(requireDataRecord({ status: response.status, body }).tenant, "login tenant");
  const tenantId = requireString(tenant.id, "login tenant.id");
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    tenantId,
  };
}

async function api(
  session: Session | null,
  path: string,
  method = "GET",
  body?: unknown,
  rawBody?: string,
): Promise<ApiResult> {
  const response = await fetch(`${base}/api/accounting${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body !== undefined || rawBody !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null) as unknown,
  };
}

async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      companyName: marker,
      email: `${slug}@test.local`,
      plan: "ENTERPRISE",
      status: "ACTIVE",
      modules: ["ACCOUNTING"],
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId, isOwner: true },
  });
  const debit = await prisma.ledgerAccount.create({
    data: {
      tenantId: tenant.id,
      code: "100",
      name: `${marker} Borç`,
      accountType: "ASSET",
    },
  });
  const credit = await prisma.ledgerAccount.create({
    data: {
      tenantId: tenant.id,
      code: "300",
      name: `${marker} Alacak`,
      accountType: "EQUITY",
    },
  });
  await prisma.fiscalPeriod.create({
    data: {
      tenantId: tenant.id,
      name: `${marker} 2026`,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  await prisma.fiscalPeriod.create({
    data: {
      tenantId: tenant.id,
      name: `${marker} 2025`,
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-31"),
      status: "CLOSED",
      closedAt: new Date(),
    },
  });
  return { tenant, debit, credit };
}

const payload = (
  debitId: string,
  creditId: string,
  amount = 100,
  date = "2026-06-15",
) => ({
  date,
  description: `${marker} Türkçe açıklama`,
  lines: [
    { accountId: debitId, debit: amount, credit: 0, description: "Borç" },
    { accountId: creditId, debit: 0, credit: amount, description: "Alacak" },
  ],
});

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const a = await fixture(`${marker.toLowerCase()}-a`, admin.id);
  const b = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const owner = await login(admin.email, a.tenant.slug);
    const foreign = await login(admin.email, b.tenant.slug);
    const denied = await login("depo@axondemo.com", "axon-demo");
    assert.equal((await api(null, "/journal-entries")).status, 401);
    assert.equal((await api(denied, "/journal-entries")).status, 403);
    assert.equal(
      (
        await api(
          denied,
          "/journal-entries",
          "POST",
          payload(a.debit.id, a.credit.id),
        )
      ).status,
      403,
    );

    const invalidBodies = [
      {},
      { date: "2026-06-15", lines: [] },
      {
        date: "2026-06-15",
        lines: [{ accountId: a.debit.id, debit: 10, credit: 0 }],
      },
      { date: "2026-02-30", lines: payload(a.debit.id, a.credit.id).lines },
      { ...payload(a.debit.id, a.credit.id), description: "X".repeat(501) },
      {
        date: "2026-06-15",
        lines: [
          { accountId: a.debit.id, debit: 0, credit: 0 },
          { accountId: a.credit.id, debit: 0, credit: 0 },
        ],
      },
      {
        date: "2026-06-15",
        lines: [
          { accountId: a.debit.id, debit: 10, credit: 10 },
          { accountId: a.credit.id, debit: 10, credit: 10 },
        ],
      },
      {
        date: "2026-06-15",
        lines: [
          { accountId: a.debit.id, debit: -10, credit: 0 },
          { accountId: a.credit.id, debit: 0, credit: -10 },
        ],
      },
      {
        date: "2026-06-15",
        lines: [
          { accountId: a.debit.id, debit: 10.001, credit: 0 },
          { accountId: a.credit.id, debit: 0, credit: 10.001 },
        ],
      },
      {
        date: "2026-06-15",
        lines: [
          { accountId: a.debit.id, debit: 10, credit: 0 },
          { accountId: a.credit.id, debit: 0, credit: 9 },
        ],
      },
      payload(b.debit.id, a.credit.id),
      payload(a.debit.id, a.credit.id, 10, "2025-06-15"),
    ];
    const beforeInvalid = await prisma.journalEntry.count({
      where: { tenantId: a.tenant.id },
    });
    for (const invalid of invalidBodies)
      assert.equal(
        (await api(owner, "/journal-entries", "POST", invalid)).status,
        400,
        JSON.stringify(invalid),
      );
    assert.equal(
      (await api(owner, "/journal-entries", "POST", undefined, "{")).status,
      400,
    );
    assert.equal(
      await prisma.journalEntry.count({ where: { tenantId: a.tenant.id } }),
      beforeInvalid,
    );

    const inactive = await prisma.ledgerAccount.create({
      data: {
        tenantId: a.tenant.id,
        code: "101",
        name: "Inactive",
        accountType: "ASSET",
        isActive: false,
      },
    });
    assert.equal(
      (
        await api(
          owner,
          "/journal-entries",
          "POST",
          payload(inactive.id, a.credit.id),
        )
      ).status,
      400,
    );
    await assert.rejects(() =>
      prisma.journalEntry.create({
        data: {
          tenantId: a.tenant.id,
          type: "MANUAL",
          number: `${marker}-DB`,
          date: new Date(),
          lines: {
            create: [
              {
                accountId: b.debit.id,
                debit: 1,
                credit: 0,
              },
            ],
          },
        },
      }),
    );

    const concurrentCreate = await Promise.all(
      [1, 2].map((index) =>
        api(owner, "/journal-entries", "POST", {
          ...payload(a.debit.id, a.credit.id, index * 10),
          description: `${marker} concurrent ${index}`,
        }),
      ),
    );
    assert.deepEqual(
      concurrentCreate.map((result) => result.status),
      [201, 201],
    );
    const numbers = concurrentCreate.map((result) => requireDataRecord(result).number);
    assert.equal(new Set(numbers).size, 2);

    const createdResponse = await api(
      owner,
      "/journal-entries",
      "POST",
      payload(a.debit.id, a.credit.id, 125.5),
    );
    assert.equal(createdResponse.status, 201);
    const entry = requireDataRecord(createdResponse);
    const entryId = requireString(entry.id, "journal entry.id");
    const entryLines = requireJournalLines(entry.lines);
    assert.equal(entryLines.length, 2);
    assert.equal(
      entryLines.reduce(
        (sum, line) => sum + Number(line.debit),
        0,
      ),
      125.5,
    );
    assert.equal(
      entryLines.reduce(
        (sum, line) => sum + Number(line.credit),
        0,
      ),
      125.5,
    );
    const detail = await api(owner, `/journal-entries/${entryId}`);
    assert.equal(detail.status, 200);
    const detailPeriod = requireRecord(requireDataRecord(detail).fiscalPeriod, "fiscalPeriod");
    assert.equal(detailPeriod.name, `${marker} 2026`);
    assert.equal(
      (await api(foreign, `/journal-entries/${entryId}`)).status,
      404,
    );
    assert.equal(
      (
        await api(
          foreign,
          `/journal-entries/${entryId}`,
          "PATCH",
          payload(b.debit.id, b.credit.id),
        )
      ).status,
      404,
    );
    assert.equal(
      (await api(foreign, `/journal-entries/${entryId}/post`, "POST")).status,
      404,
    );
    assert.equal(
      (
        await api(foreign, `/journal-entries/${entryId}/reverse`, "POST", {
          reason: "hack",
        })
      ).status,
      404,
    );

    const beforeLines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: entryId },
      orderBy: { id: "asc" },
    });
    assert.equal(
      (
        await api(
          owner,
          `/journal-entries/${entryId}`,
          "PATCH",
          payload(b.debit.id, a.credit.id),
        )
      ).status,
      400,
    );
    assert.deepEqual(
      (
        await prisma.journalEntryLine.findMany({
          where: { journalEntryId: entryId },
          orderBy: { id: "asc" },
        })
      ).map((line) => line.id),
      beforeLines.map((line) => line.id),
    );
    const updated = await api(
      owner,
      `/journal-entries/${entryId}`,
      "PATCH",
      payload(a.debit.id, a.credit.id, 240),
    );
    assert.equal(updated.status, 200);
    const updatedLines = requireJournalLines(requireDataRecord(updated).lines);
    assert.equal(
      updatedLines.reduce((sum, line) => sum + Number(line.debit), 0),
      240,
    );
    assert.equal(
      await prisma.journalEntryLine.count({
        where: { journalEntryId: entryId },
      }),
      2,
    );

    for (const path of [
      "?page=0",
      "?page=x",
      "?limit=101",
      "?isPosted=yes",
      "?dateFrom=bad",
      "?dateFrom=2026-12-31&dateTo=2026-01-01",
    ])
      assert.equal(
        (await api(owner, `/journal-entries${path}`)).status,
        400,
        path,
      );
    const list = await api(
      owner,
      "/journal-entries?page=1&limit=2&isPosted=false&dateFrom=2026-01-01&dateTo=2026-12-31",
    );
    assert.equal(list.status, 200);
    assert.equal(requireDataArray(list).length, 2);
    assert.equal(requireMetaRecord(list).pageSize, 2);
    assert.equal(requireMetaRecord(list).total, 3);

    assert.equal(
      (
        await api(owner, `/journal-entries/${entryId}/reverse`, "POST", {
          reason: "early",
        })
      ).status,
      400,
    );
    const posts = await Promise.all([
      api(owner, `/journal-entries/${entryId}/post`, "POST"),
      api(owner, `/journal-entries/${entryId}/post`, "POST"),
    ]);
    assert.deepEqual(posts.map((result) => result.status).sort(), [200, 409]);
    const posted = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: entryId },
    });
    assert.equal(posted.isPosted, true);
    assert.ok(posted.postedAt);
    assert.equal(posted.postedById, admin.id);
    assert.equal(
      (
        await api(
          owner,
          `/journal-entries/${entryId}`,
          "PATCH",
          payload(a.debit.id, a.credit.id),
        )
      ).status,
      400,
    );
    assert.equal(
      (await api(owner, `/journal-entries/${entryId}/post`, "POST")).status,
      400,
    );
    assert.equal(
      (await api(owner, `/journal-entries/${entryId}/reverse`, "POST", {}))
        .status,
      400,
    );

    const reversals = await Promise.all([
      api(owner, `/journal-entries/${entryId}/reverse`, "POST", {
        reason: "TEST düzeltme",
      }),
      api(owner, `/journal-entries/${entryId}/reverse`, "POST", {
        reason: "TEST duplicate",
      }),
    ]);
    assert.deepEqual(
      reversals.map((result) => result.status).sort(),
      [201, 409],
    );
    const reversal = await prisma.journalEntry.findFirstOrThrow({
      where: {
        tenantId: a.tenant.id,
        refType: "JOURNAL_REVERSAL",
        refId: entryId,
      },
      include: { lines: true },
    });
    assert.equal(
      await prisma.journalEntry.count({
        where: {
          tenantId: a.tenant.id,
          refType: "JOURNAL_REVERSAL",
          refId: entryId,
        },
      }),
      1,
    );
    assert.equal(reversal.isPosted, true);
    assert.equal(
      reversal.lines.reduce((sum, line) => sum + line.debit.toNumber(), 0),
      240,
    );
    assert.equal(
      reversal.lines.reduce((sum, line) => sum + line.credit.toNumber(), 0),
      240,
    );
    assert.equal(
      reversal.lines
        .find((line) => line.accountId === a.debit.id)
        ?.credit.toNumber(),
      240,
    );

    const trial = await api(
      owner,
      "/trial-balance?dateFrom=2026-01-01&dateTo=2026-12-31",
    );
    assert.equal(trial.status, 200);
    assert.equal(requireMetaRecord(trial).isBalanced, true);
    const relevantRows = requireDataArray(trial).filter((row) =>
      typeof row.accountId === "string" && [a.debit.id, a.credit.id].includes(row.accountId),
    );
    assert.equal(
      relevantRows.reduce(
        (sum, row) => sum + Number(row.balance),
        0,
      ),
      0,
    );

    const lockedDraftResponse = await api(
      owner,
      "/journal-entries",
      "POST",
      payload(a.debit.id, a.credit.id, 50, "2026-08-01"),
    );
    assert.equal(lockedDraftResponse.status, 201);
    const lockedDraftId = requireString(requireDataRecord(lockedDraftResponse).id, "locked draft id");
    await prisma.fiscalPeriod.updateMany({
      where: { tenantId: a.tenant.id, startDate: new Date("2026-01-01") },
      data: { status: "LOCKED" },
    });
    assert.equal(
      (
        await api(
          owner,
          `/journal-entries/${lockedDraftId}/post`,
          "POST",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await prisma.journalEntry.findUniqueOrThrow({
          where: { id: lockedDraftId },
        })
      ).isPosted,
      false,
    );

    console.log(
      "PASS journal entries assurance: validation, atomicity, concurrency, reversal uniqueness, periods, trial balance, permissions and tenant isolation",
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [a.tenant.id, b.tenant.id] } },
    });
    assert.equal(
      await prisma.tenant.count({ where: { companyName: marker } }),
      0,
    );
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
