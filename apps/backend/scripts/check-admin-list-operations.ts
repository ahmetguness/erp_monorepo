import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  deleteListView,
  executeBulkNote,
  exportTenantList,
  listSavedViews,
  previewBulkNote,
  saveListView,
} from "../src/modules/platform/admin-list-operations/index.js";
import {
  tenantExportQuerySchema,
  tenantListConfigSchema,
} from "../src/modules/platform/admin-list-operations/index.js";

async function main(): Promise<void> {
  const [admin, tenant] = await Promise.all([
    prisma.adminUser.findFirst({
      where: { isActive: true },
      select: { id: true },
    }),
    prisma.tenant.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    }),
  ]);
  assert.ok(
    admin && tenant,
    "Liste operasyon testi için admin ve müşteri hesabı gerekli.",
  );
  const name = `Entegrasyon ${Date.now()}`;
  const missingId = `missing-${Date.now()}`;
  const noteMarker = `liste-operasyon-${Date.now()}`;
  let viewId: string | null = null;
  try {
    assert.equal(
      tenantListConfigSchema.safeParse({
        status: "INVALID",
        sortBy: "createdAt",
        sortDirection: "desc",
        columns: ["companyName"],
      }).success,
      false,
    );
    assert.equal(
      tenantExportQuerySchema.safeParse({
        from: "2026-09-12",
        to: "2026-09-11",
      }).success,
      false,
    );
    const view = await saveListView(admin.id, name, {
      status: "ACTIVE",
      sortBy: "companyName",
      sortDirection: "asc",
      columns: ["companyName", "status"],
    });
    viewId = view.id;
    assert.ok(
      (await listSavedViews(admin.id)).some((item) => item.id === view.id),
    );
    const preview = await previewBulkNote([tenant.id, missingId, tenant.id]);
    assert.equal(preview.foundCount, 1);
    assert.deepEqual(preview.missingIds, [missingId]);
    const result = await executeBulkNote(
      admin.id,
      preview.tenantIds,
      "Entegrasyon testi gerekçesi",
      noteMarker,
    );
    assert.deepEqual(result.succeeded, [{ tenantId: tenant.id }]);
    assert.equal(result.failed.length, 1);
    assert.ok(
      await prisma.tenantSupportNote.findFirst({
        where: {
          tenantId: tenant.id,
          authorId: admin.id,
          body: { contains: noteMarker },
        },
      }),
    );
    const csv = await exportTenantList(admin.id, {
      status: undefined,
      plan: undefined,
      search: undefined,
      from: undefined,
      to: undefined,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    assert.ok(csv.startsWith("id,companyName,status,plan"));
    assert.ok(csv.includes(tenant.id));
  } finally {
    await prisma.tenantSupportNote.deleteMany({
      where: {
        tenantId: tenant.id,
        authorId: admin.id,
        body: { contains: noteMarker },
      },
    });
    if (viewId) await deleteListView(admin.id, viewId);
  }
  console.log(
    "Admin list operations integration: OK (saved views, preview, partial result, CSV)",
  );
}
main().finally(() => prisma.$disconnect());
