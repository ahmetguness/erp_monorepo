import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_ACCOUNT_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password: "demo1234", tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "", tenantId: body.data.tenant.id };
}

async function api(session: Session | null, path: string, method = "GET", body?: unknown, rawBody?: string) {
  const response = await fetch(`${base}/api/accounting${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...((body !== undefined || rawBody !== undefined) ? { "content-type": "application/json" } : {}) }, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({ data: { slug, companyName: marker, email: `${slug}@test.local`, plan: "ENTERPRISE", status: "ACTIVE", modules: ["ACCOUNTING"] } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId, isOwner: true } });
  return tenant;
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@axondemo.com" } });
  const tenantA = await fixture(`${marker.toLowerCase()}-a`, admin.id);
  const tenantB = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const owner = await login(admin.email, tenantA.slug);
    const foreign = await login(admin.email, tenantB.slug);
    const denied = await login("depo@axondemo.com", "axon-demo");
    assert.equal((await api(null, "/accounts")).status, 401);
    assert.equal((await api(denied, "/accounts")).status, 403);

    for (const payload of [{}, { code: " ", name: "Name", type: "ASSET" }, { code: "100", name: " ", type: "ASSET" }, { code: "100", name: "Name", type: "BAD" }, { code: "X".repeat(51), name: "Name", type: "ASSET" }]) {
      assert.equal((await api(owner, "/accounts", "POST", payload)).status, 400, JSON.stringify(payload));
    }
    assert.equal((await api(owner, "/accounts", "POST", undefined, "{")).status, 400);

    const parentResponse = await api(owner, "/accounts", "POST", { code: " 100 ", name: " TEST Üst Hesap ", type: "ASSET" });
    assert.equal(parentResponse.status, 201);
    const parent = parentResponse.body.data;
    assert.equal(parent.code, "100"); assert.equal(parent.name, "TEST Üst Hesap");
    const childResponse = await api(owner, "/accounts", "POST", { code: "100.01", name: "TEST Çocuk", type: "ASSET", parentId: parent.id });
    assert.equal(childResponse.status, 201);
    const child = childResponse.body.data;

    assert.equal((await api(owner, "/accounts", "POST", { code: "100.02", name: "Wrong type", type: "EXPENSE", parentId: parent.id })).status, 400);
    const foreignParent = await prisma.ledgerAccount.create({ data: { tenantId: tenantB.id, code: "200", name: "Foreign", accountType: "ASSET" } });
    assert.equal((await api(owner, "/accounts", "POST", { code: "100.03", name: "Foreign child", type: "ASSET", parentId: foreignParent.id })).status, 400);
    await assert.rejects(() => prisma.ledgerAccount.create({ data: { tenantId: tenantA.id, code: "100.04", name: "DB blocked", accountType: "ASSET", parentId: foreignParent.id } }));

    const concurrent = await Promise.all(Array.from({ length: 2 }, () => api(owner, "/accounts", "POST", { code: "102", name: "Concurrent", type: "ASSET" })));
    assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
    assert.equal(await prisma.ledgerAccount.count({ where: { tenantId: tenantA.id, code: "102" } }), 1);

    const list = await api(owner, "/accounts?type=ASSET&isActive=true&search=100.01");
    assert.equal(list.status, 200); assert.equal(list.body.data.length, 1); assert.equal(list.body.data[0].parent.id, parent.id);
    const fullList = await api(owner, "/accounts");
    assert.equal(fullList.body.data.find((item: any) => item.id === parent.id).children.length, 1);
    assert.equal((await api(owner, "/accounts?type=BAD")).status, 400);
    assert.equal((await api(owner, "/accounts?isActive=yes")).status, 400);
    assert.equal((await api(foreign, `/accounts/${parent.id}`)).status, 404);
    assert.equal((await api(foreign, `/accounts/${parent.id}`, "PATCH", { name: "HACK" })).status, 404);

    assert.equal((await api(owner, `/accounts/${child.id}`, "PATCH", {})).status, 400);
    assert.equal((await api(owner, `/accounts/${child.id}`, "PATCH", { isActive: "false" })).status, 400);
    assert.equal((await api(owner, `/accounts/${child.id}`, "PATCH", { code: "999" })).status, 400);
    const update = await api(owner, `/accounts/${child.id}`, "PATCH", { name: " TEST Güncel ", isActive: false });
    assert.equal(update.status, 200); assert.equal(update.body.data.name, "TEST Güncel"); assert.equal(update.body.data.isActive, false);
    const persisted = await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: child.id } });
    assert.equal(persisted.name, "TEST Güncel"); assert.equal(persisted.code, "100.01");
    assert.equal((await api(owner, "/accounts?isActive=false")).body.data.length, 1);

    const creditResponse = await api(owner, "/accounts", "POST", { code: "300", name: "TEST Karşı Hesap", type: "EQUITY" });
    assert.equal(creditResponse.status, 201);
    const period = await prisma.fiscalPeriod.create({ data: { tenantId: tenantA.id, name: marker, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const journal = await api(owner, "/journal-entries", "POST", { date: "2026-06-15", description: marker, lines: [{ accountId: parent.id, debit: 125.5, credit: 0 }, { accountId: creditResponse.body.data.id, debit: 0, credit: 125.5 }] });
    assert.equal(journal.status, 201);
    assert.equal((await api(owner, `/journal-entries/${journal.body.data.id}/post`, "POST")).status, 200);
    const trial = await api(owner, "/trial-balance?dateFrom=2026-01-01&dateTo=2026-12-31");
    assert.equal(trial.status, 200); assert.equal(Number(trial.body.meta.totalDebit), 125.5); assert.equal(Number(trial.body.meta.totalCredit), 125.5); assert.equal(trial.body.meta.isBalanced, true);
    const dbLines = await prisma.journalEntryLine.findMany({ where: { tenantId: tenantA.id, journalEntryId: journal.body.data.id } });
    assert.equal(dbLines.reduce((sum, line) => sum + line.debit.toNumber(), 0), 125.5);
    assert.equal(dbLines.reduce((sum, line) => sum + line.credit.toNumber(), 0), 125.5);
    assert.equal(period.id, journal.body.data.fiscalPeriodId);
    assert.equal((await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: foreignParent.id } })).name, "Foreign");

    console.log("PASS accounting accounts assurance: auth, validation, hierarchy, DB tenant FK, concurrency, filters, update, journal and trial balance");
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: marker } }), 0);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
