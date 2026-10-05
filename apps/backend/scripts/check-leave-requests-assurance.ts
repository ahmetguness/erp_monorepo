import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_LEAVE_${Date.now()}`;
type Session = { cookie: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password: "demo1234", tenantSlug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
async function request(session: Session | null, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@axondemo.com" } });
  const makeTenant = async (suffix: string) => {
    const row = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-${suffix}`, companyName: marker, email: `${suffix}-${marker}@test.local`, plan: "ENTERPRISE", status: "ACTIVE", modules: ["HR"] } });
    await prisma.tenantUser.create({ data: { tenantId: row.id, userId: admin.id, isOwner: true } });
    return row;
  };
  const a = await makeTenant("a"), b = await makeTenant("b");
  try {
    const sa = await login(admin.email, a.slug), sb = await login(admin.email, b.slug);
    const employeeA = await prisma.employee.create({ data: { tenantId: a.id, firstName: "TEST_E2E", lastName: "Leave A", hireDate: new Date("2025-01-01") } });
    const employeeB = await prisma.employee.create({ data: { tenantId: b.id, firstName: "TEST_E2E", lastName: "Leave B", hireDate: new Date("2025-01-01") } });
    assert.equal((await request(null, "/api/hr/leave-requests")).status, 401);
    for (const query of ["page=0", "limit=101", "status=INVALID"]) assert.equal((await request(sa, `/api/hr/leave-requests?${query}`)).status, 400);
    const valid = { employeeId: employeeA.id, type: "ANNUAL", startDate: "2026-11-01", endDate: "2026-11-03", days: 3, notes: " TEST_E2E izin " };
    for (const payload of [{}, { ...valid, type: "INVALID" }, { ...valid, startDate: "bad" }, { ...valid, startDate: "2026-02-31" }, { ...valid, endDate: "2026-10-31" }, { ...valid, days: 0 }, { ...valid, days: -1 }, { ...valid, days: Number.MAX_VALUE }, { ...valid, unknown: true }]) assert.equal((await request(sa, "/api/hr/leave-requests", "POST", payload)).status, 400);
    assert.equal((await request(sa, "/api/hr/leave-requests", "POST", { ...valid, employeeId: employeeB.id })).status, 400);

    const same = await Promise.all([request(sa, "/api/hr/leave-requests", "POST", valid), request(sa, "/api/hr/leave-requests", "POST", valid)]);
    assert.deepEqual(same.map((row) => row.status).sort(), [201, 400]);
    const firstId = same.find((row) => row.status === 201)!.body.data.id as string;
    assert.equal(await prisma.leaveRequest.count({ where: { tenantId: a.id, employeeId: employeeA.id, startDate: new Date("2026-11-01") } }), 1);
    const stored = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: firstId } });
    assert.equal(stored.notes, "TEST_E2E izin"); assert.equal(Number(stored.days), 3);

    const different = await Promise.all([
      request(sa, "/api/hr/leave-requests", "POST", { ...valid, startDate: "2026-12-01", endDate: "2026-12-01", days: 1 }),
      request(sa, "/api/hr/leave-requests", "POST", { ...valid, startDate: "2026-12-03", endDate: "2026-12-04", days: 2 }),
    ]);
    assert.deepEqual(different.map((row) => row.status), [201, 201]);

    const transitionRace = await Promise.all([
      request(sa, `/api/hr/leave-requests/${firstId}/approve`, "POST", {}),
      request(sa, `/api/hr/leave-requests/${firstId}/reject`, "POST", {}),
    ]);
    assert.deepEqual(transitionRace.map((row) => row.status).sort(), [200, 400]);
    const transitioned = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: firstId } });
    assert.ok(["APPROVED", "REJECTED"].includes(transitioned.status));
    if (transitioned.status === "APPROVED") { assert.equal(transitioned.approvedBy, admin.id); assert.ok(transitioned.approvedAt); }
    assert.equal((await request(sa, `/api/hr/leave-requests/${firstId}/approve`, "POST", { approvedBy: employeeB.id })).status, 400);

    const cancellableId = different[0].body.data.id as string;
    assert.equal((await request(sa, `/api/hr/leave-requests/${cancellableId}/approve`, "POST", {})).status, 200);
    assert.equal((await request(sa, `/api/hr/leave-requests/${cancellableId}/cancel`, "POST", {})).status, 200);
    assert.equal((await request(sa, "/api/hr/leave-requests", "POST", { ...valid, startDate: "2026-12-01", endDate: "2026-12-01", days: 1 })).status, 201);

    const list = await request(sa, `/api/hr/leave-requests?status=PENDING&employeeId=${employeeA.id}&page=1&limit=2`);
    assert.equal(list.status, 200); assert.ok(list.body.data.every((row: any) => row.status === "PENDING" && row.employeeId === employeeA.id)); assert.equal(list.body.meta.pageSize, 2);
    assert.equal((await request(sb, `/api/hr/leave-requests/${firstId}`)).status, 404);
    assert.equal((await request(sb, `/api/hr/leave-requests/${firstId}/cancel`, "POST", {})).status, 404);
    const detail = await request(sa, `/api/hr/employees/${employeeA.id}`);
    assert.ok(detail.body.data.leaveRequests.some((row: any) => row.id === firstId));
    console.log("Leave requests assurance PASS: validation, concurrency, transitions, overlap, tenant isolation, employee detail and DB consistency.");
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: marker } }), 0);
    await prisma.$disconnect();
  }
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
