import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_ADV_HR_${Date.now()}`;
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
  raw?: string,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body !== undefined || raw !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}
async function tenant(
  slug: string,
  userId: string,
  plan: "STARTER" | "ENTERPRISE",
) {
  const row = await prisma.tenant.create({
    data: {
      slug,
      companyName: marker,
      email: `${slug}@test.local`,
      plan,
      status: "ACTIVE",
      modules: ["HR"],
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: row.id, userId, isOwner: true },
  });
  return row;
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@axondemo.com" },
  });
  const a = await tenant(`${marker.toLowerCase()}-a`, admin.id, "ENTERPRISE");
  const b = await tenant(`${marker.toLowerCase()}-b`, admin.id, "ENTERPRISE");
  const starter = await tenant(
    `${marker.toLowerCase()}-starter`,
    admin.id,
    "STARTER",
  );
  try {
    const employee1 = await prisma.employee.create({
      data: {
        tenantId: a.id,
        firstName: "İpek",
        lastName: "Çalışkan",
        department: "Mühendislik",
        position: "Geliştirici",
        hireDate: new Date("2025-01-01"),
        salary: 50000,
      },
    });
    const employee2 = await prisma.employee.create({
      data: {
        tenantId: a.id,
        firstName: "Eksik",
        lastName: "Profil",
        hireDate: new Date("2026-01-01"),
      },
    });
    await prisma.employee.create({
      data: {
        tenantId: a.id,
        firstName: "Pasif",
        lastName: "Personel",
        hireDate: new Date("2025-01-01"),
        isActive: false,
      },
    });
    await prisma.employee.create({
      data: {
        tenantId: a.id,
        firstName: "Silinmiş",
        lastName: "Personel",
        hireDate: new Date("2025-01-01"),
        deletedAt: new Date(),
      },
    });
    const foreignEmployee = await prisma.employee.create({
      data: {
        tenantId: b.id,
        firstName: "Başka",
        lastName: "Tenant",
        department: "Yabancı",
        position: "Yönetici",
        hireDate: new Date("2024-01-01"),
      },
    });
    await prisma.employee.createMany({
      data: Array.from({ length: 301 }, (_, index) => ({
        tenantId: a.id,
        firstName: `Toplu${String(index).padStart(3, "0")}`,
        lastName: "Personel",
        department: "Toplu Departman",
        position: "Uzman",
        hireDate: new Date("2025-06-01"),
      })),
    });
    const bulkEmployees = await prisma.employee.findMany({
      where: { tenantId: a.id, department: "Toplu Departman" },
      select: { id: true },
      orderBy: { firstName: "asc" },
      take: 81,
    });
    await prisma.task.createMany({
      data: [
        {
          tenantId: a.id,
          title: "Performans",
          module: "hr",
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          source: `hr:performance:${employee1.id}`,
          status: "TODO",
          priority: "HIGH",
          dueAt: new Date("2026-10-20"),
        },
        {
          tenantId: a.id,
          title: "Eğitim",
          module: "hr",
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          source: `hr:training:${employee1.id}`,
          status: "IN_PROGRESS",
          priority: "MEDIUM",
        },
        {
          tenantId: a.id,
          title: "Masraf",
          module: "hr",
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          source: `hr:expense:${employee1.id}`,
          status: "TODO",
          priority: "HIGH",
          dueAt: new Date("2026-10-10"),
        },
        {
          tenantId: a.id,
          title: "Tamamlanan eski aksiyon",
          module: "hr",
          entityType: "EMPLOYEE",
          entityId: employee2.id,
          source: `hr:performance:done:${employee2.id}`,
          status: "DONE",
          priority: "LOW",
        },
        {
          tenantId: b.id,
          title: "Yabancı görev",
          module: "hr",
          entityType: "EMPLOYEE",
          entityId: foreignEmployee.id,
          source: `hr:performance:${foreignEmployee.id}`,
          status: "TODO",
          priority: "HIGH",
        },
      ],
    });
    await prisma.task.createMany({
      data: bulkEmployees.map((employee, index) => ({
        tenantId: a.id,
        title: `Toplu masraf ${index}`,
        module: "hr",
        entityType: "EMPLOYEE",
        entityId: employee.id,
        source: `hr:expense:bulk:${employee.id}`,
        status: "TODO",
        priority: "MEDIUM",
      })),
    });
    await prisma.attachment.createMany({
      data: [
        {
          tenantId: a.id,
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          fileName: "review.pdf",
          storagePath: `${marker}/review.pdf`,
          tags: ["performance-review"],
          createdAt: new Date("2026-04-01"),
        },
        {
          tenantId: a.id,
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          fileName: "training.pdf",
          storagePath: `${marker}/training.pdf`,
          tags: ["training-certificate"],
          createdAt: new Date("2026-05-01"),
        },
        {
          tenantId: a.id,
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          fileName: "asset.pdf",
          storagePath: `${marker}/asset.pdf`,
          tags: ["asset-assignment"],
          createdAt: new Date("2026-06-01"),
        },
        {
          tenantId: a.id,
          entityType: "EMPLOYEE",
          entityId: employee1.id,
          fileName: "advance.pdf",
          storagePath: `${marker}/advance.pdf`,
          tags: ["advance-form"],
          createdAt: new Date("2026-07-01"),
        },
        {
          tenantId: a.id,
          entityType: "EMPLOYEE",
          entityId: foreignEmployee.id,
          fileName: "injected.pdf",
          storagePath: `${marker}/injected.pdf`,
          tags: ["asset-assignment"],
        },
      ],
    });

    const sa = await login(admin.email, a.slug),
      sb = await login(admin.email, b.slug),
      ss = await login(admin.email, starter.slug),
      denied = await login("depo@axondemo.com", "axon-demo");
    assert.equal((await request(null, "/api/hr/advanced")).status, 401);
    assert.equal((await request(denied, "/api/hr/advanced")).status, 403);
    assert.equal((await request(ss, "/api/hr/advanced")).status, 200);
    assert.equal((await request(ss, "/api/hr/employees", "POST", { firstName: "Plan", lastName: "Kilit", hireDate: "2026-10-01" })).status, 403);
    const advanced = await request(sa, "/api/hr/advanced");
    assert.equal(advanced.status, 200);
    const data = advanced.body.data;
    assert.deepEqual(data.summary, {
      employeeCount: 303,
      departmentCount: 3,
      reviewMissingCount: 302,
      trainingMissingCount: 302,
      assetMissingCount: 302,
      expenseAdvancePendingCount: 82,
      organizationNodeCount: 309,
    });
    assert.equal(data.performanceReviews.length, 303);
    assert.equal(data.trainingMatrix.length, 303);
    assert.equal(data.assetAssignments.length, 303);
    const e1Review = data.performanceReviews.find(
      (row: any) => row.employee.id === employee1.id,
    );
    assert.deepEqual(
      {
        status: e1Review.status,
        actions: e1Review.openActionCount,
        last: e1Review.lastReviewAt.slice(0, 10),
        next: e1Review.nextReviewAt.slice(0, 10),
      },
      {
        status: "scheduled",
        actions: 1,
        last: "2026-04-01",
        next: "2026-09-28",
      },
    );
    const e1Training = data.trainingMatrix.find(
      (row: any) => row.employee.id === employee1.id,
    );
    assert.deepEqual(
      {
        status: e1Training.status,
        completed: e1Training.completedCount,
        planned: e1Training.plannedCount,
        missing: e1Training.missingTopics,
      },
      { status: "complete", completed: 1, planned: 1, missing: [] },
    );
    assert.equal(
      data.assetAssignments.find((row: any) => row.employee.id === employee1.id)
        .assetCount,
      1,
    );
    assert.equal(data.expenseAdvances.length, 83);
    assert.deepEqual(
      data.expenseAdvances.filter((row: any) => row.employee.id === employee1.id).map((row: any) => [
        row.type,
        row.status,
        row.openActionCount,
        row.documentCount,
      ]),
      [
        ["expense", "pending", 1, 0],
        ["advance", "documented", 0, 1],
      ],
    );
    assert.equal(
      data.organization.filter((row: any) => row.type === "employee").length,
      303,
    );
    assert.equal(JSON.stringify(data).includes(foreignEmployee.id), false);
    const foreignView = await request(sb, "/api/hr/advanced");
    assert.equal(foreignView.status, 200);
    assert.equal(foreignView.body.data.summary.employeeCount, 1);

    const invalidEmployees = [
      {},
      { firstName: " ", lastName: "Test", hireDate: "2026-01-01" },
      { firstName: "Test", lastName: " ", hireDate: "2026-01-01" },
      { firstName: "Test", lastName: "User", hireDate: "2026-02-30" },
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
        salary: 1.001,
      },
      {
        firstName: "Test",
        lastName: "User",
        hireDate: "2026-01-01",
        email: "bad",
      },
      { firstName: "x".repeat(101), lastName: "User", hireDate: "2026-01-01" },
      {
        firstName: "Test",
        lastName: "User",
        hireDate: "2026-01-01",
        extra: true,
      },
    ];
    for (const body of invalidEmployees)
      assert.equal(
        (await request(sa, "/api/hr/employees", "POST", body)).status,
        400,
      );
    assert.equal(
      (await request(sa, "/api/hr/employees", "POST", undefined, "{")).status,
      400,
    );
    const created = await request(sa, "/api/hr/employees", "POST", {
      firstName: " Test ",
      lastName: " Çalışan ",
      email: "test@example.com",
      hireDate: "2026-10-01",
      salary: 12345.67,
      department: "Kalite",
      position: "Uzman",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.firstName, "Test");
    assert.equal(created.body.data.lastName, "Çalışan");
    assert.equal(
      (await request(sa, "/api/hr/advanced")).body.data.summary.employeeCount,
      304,
    );
    assert.equal(
      (
        await request(
          sb,
          `/api/hr/employees/${created.body.data.id}`,
          "PATCH",
          { firstName: "Hack" },
        )
      ).status,
      404,
    );
    assert.equal(
      (await request(sb, `/api/hr/employees/${created.body.data.id}`, "DELETE"))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          sa,
          `/api/hr/employees/${created.body.data.id}`,
          "PATCH",
          {},
        )
      ).status,
      400,
    );
    const updated = await request(
      sa,
      `/api/hr/employees/${created.body.data.id}`,
      "PATCH",
      { department: " Kalite Güvence ", salary: 15000 },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.department, "Kalite Güvence");
    assert.equal(Number(updated.body.data.salary), 15000);
    assert.equal(
      (await request(sa, `/api/hr/employees/${created.body.data.id}`, "DELETE"))
        .status,
      200,
    );
    assert.equal(
      (await request(sa, "/api/hr/advanced")).body.data.summary.employeeCount,
      303,
    );

    await assert.rejects(
      prisma.attendance.create({
        data: {
          tenantId: a.id,
          employeeId: foreignEmployee.id,
          date: new Date("2026-10-05"),
        },
      }),
    );
    await assert.rejects(
      prisma.leaveRequest.create({
        data: {
          tenantId: a.id,
          employeeId: foreignEmployee.id,
          type: "ANNUAL",
          startDate: new Date("2026-10-10"),
          endDate: new Date("2026-10-10"),
          days: 1,
        },
      }),
    );
    await assert.rejects(
      prisma.payroll.create({
        data: {
          tenantId: a.id,
          employeeId: foreignEmployee.id,
          period: "2026-10",
          grossSalary: 1,
          netSalary: 1,
        },
      }),
    );
    console.log(
      JSON.stringify({
        status: "PASS",
        employeesBeyondLegacyLimit: 303,
        calculations: "PASS",
        employeeCrud: "PASS",
        tenantIsolation: "PASS",
        planAndPermissionGates: "PASS",
        databaseTenantFks: "PASS",
      }),
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: { in: [a.id, b.id, starter.id] } },
    });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
