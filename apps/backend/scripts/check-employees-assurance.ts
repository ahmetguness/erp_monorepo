import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_EMPLOYEES_${Date.now()}`;
type Session = { cookie: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", tenantSlug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
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
async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const createTenant = async (suffix: string) => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `${marker.toLowerCase()}-${suffix}`,
        companyName: marker,
        email: `${suffix}-${marker}@test.local`,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        modules: ["HR", "PAYROLL"],
      },
    });
    await prisma.tenantUser.create({
      data: { tenantId: tenant.id, userId: admin.id, isOwner: true },
    });
    return tenant;
  };
  const a = await createTenant("a");
  const b = await createTenant("b");
  try {
    const sa = await login(admin.email, a.slug);
    const sb = await login(admin.email, b.slug);
    assert.equal((await request(null, "/api/hr/employees")).status, 401);
    for (const query of [
      "page=0",
      "page=x",
      "limit=0",
      "limit=101",
      "isActive=yes",
    ])
      assert.equal(
        (await request(sa, `/api/hr/employees?${query}`)).status,
        400,
      );
    for (const payload of [
      {},
      { firstName: " ", lastName: "Test", hireDate: "2026-01-01" },
      { firstName: "Test", lastName: "User", hireDate: "bad" },
      {
        firstName: "Test",
        lastName: "User",
        hireDate: "2026-01-01",
        salary: -1,
      },
      {
        firstName: "Test",
        lastName: "User",
        hireDate: "2026-01-01",
        unknown: true,
      },
    ])
      assert.equal(
        (await request(sa, "/api/hr/employees", "POST", payload)).status,
        400,
      );

    const created = await request(sa, "/api/hr/employees", "POST", {
      firstName: "  Ipek ",
      lastName: " Caliskan  ",
      email: "ipek@example.com",
      phone: "+90 555",
      position: "Uzman",
      department: "Ar-Ge",
      hireDate: "2026-01-15",
      salary: 25000.25,
    });
    assert.equal(created.status, 201);
    const id = created.body.data.id as string;
    const dbEmployee = await prisma.employee.findUniqueOrThrow({
      where: { id },
    });
    assert.equal(dbEmployee.tenantId, a.id);
    assert.equal(dbEmployee.firstName, "Ipek");
    assert.equal(Number(dbEmployee.salary), 25000.25);
    const foreign = await request(sb, "/api/hr/employees", "POST", {
      firstName: "Foreign",
      lastName: "Employee",
      hireDate: "2026-01-01",
    });
    assert.equal(foreign.status, 201);
    const foreignId = foreign.body.data.id as string;

    const filtered = await request(
      sa,
      "/api/hr/employees?search=ipek&department=Ar-Ge&isActive=true&page=1&limit=1",
    );
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.meta.total, 1);
    assert.equal(filtered.body.data[0].id, id);
    assert.equal(
      (await request(sa, `/api/hr/employees/${foreignId}`)).status,
      404,
    );
    assert.equal(
      (
        await request(sa, `/api/hr/employees/${foreignId}`, "PATCH", {
          firstName: "Hacked",
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(sa, `/api/hr/employees/${foreignId}`, "DELETE")).status,
      404,
    );

    const updated = await request(sa, `/api/hr/employees/${id}`, "PATCH", {
      position: "Kidemli Uzman",
      salary: 30000,
      isActive: true,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.position, "Kidemli Uzman");
    assert.equal(
      (await request(sa, `/api/hr/employees/${id}`, "PATCH", {})).status,
      400,
    );

    for (const [path, method, payload] of [
      [
        "/api/hr/attendance/check-in",
        "POST",
        {
          employeeId: foreignId,
          date: "2026-09-01",
          checkIn: "2026-09-01T06:00:00.000Z",
        },
      ],
      [
        "/api/hr/leave-requests",
        "POST",
        {
          employeeId: foreignId,
          type: "ANNUAL",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
          days: 1,
        },
      ],
      [
        "/api/payroll",
        "POST",
        { employeeId: foreignId, period: "2026-09", grossSalary: 1000 },
      ],
    ] as const)
      assert.equal((await request(sa, path, method, payload)).status, 400);
    assert.equal(
      await prisma.attendance.count({
        where: { tenantId: b.id, employeeId: foreignId },
      }),
      0,
    );

    assert.equal(
      (
        await request(sa, "/api/hr/attendance/check-in", "POST", {
          employeeId: id,
          date: "2026-09-02",
          checkIn: "2026-09-02T06:00:00.000Z",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(sa, "/api/hr/leave-requests", "POST", {
          employeeId: id,
          type: "ANNUAL",
          startDate: "2026-09-03",
          endDate: "2026-09-04",
          days: 2,
        })
      ).status,
      201,
    );
    const payroll = await request(sa, "/api/payroll", "POST", {
      employeeId: id,
      period: "2026-09",
      grossSalary: 30000,
      items: [{ label: "Kesinti", amount: 1000, isDeduction: true }],
    });
    assert.equal(payroll.status, 201, JSON.stringify(payroll.body));
    const detail = await request(sa, `/api/hr/employees/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.attendances.length, 1);
    assert.equal(detail.body.data.leaveRequests.length, 1);
    assert.equal(Number(detail.body.data.payrolls[0].netSalary), 29000);
    assert.equal(
      (await request(sa, "/api/hr/advanced")).body.data.performanceReviews.some(
        (row: any) => row.employee.id === id,
      ),
      true,
    );

    assert.equal(
      (await request(sa, `/api/hr/employees/${id}`, "DELETE")).status,
      200,
    );
    assert.equal((await request(sa, `/api/hr/employees/${id}`)).status, 404);
    const softDeleted = await prisma.employee.findUniqueOrThrow({
      where: { id },
    });
    assert.equal(softDeleted.isActive, false);
    assert.ok(softDeleted.deletedAt);
    assert.equal(
      await prisma.attendance.count({ where: { employeeId: id } }),
      1,
    );
    assert.equal(
      await prisma.leaveRequest.count({ where: { employeeId: id } }),
      1,
    );
    assert.equal(await prisma.payroll.count({ where: { employeeId: id } }), 1);
    console.log(
      "Employees assurance PASS: auth, validation, CRUD, filtering, tenant ownership, HR relations, soft delete and DB consistency.",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    assert.equal(
      await prisma.tenant.count({ where: { companyName: marker } }),
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
