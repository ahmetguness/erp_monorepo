import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  getAdminInbox,
  inboxFiltersSchema,
  updateInboxItem,
  updateInboxPreferences,
} from "../src/modules/platform/admin-inbox/index.js";

async function main(): Promise<void> {
  assert.equal(
    inboxFiltersSchema.parse({ includeResolved: "false" }).includeResolved,
    false,
  );
  assert.equal(
    inboxFiltersSchema.parse({ includeResolved: "true" }).includeResolved,
    true,
  );
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  assert.ok(admin, "Gelen kutusu testi için aktif admin gerekli.");

  const key = `admin-inbox-test-${Date.now()}`;
  const finding = await prisma.platformSecurityFinding.create({
    data: {
      key,
      title: "Gelen kutusu entegrasyon testi",
      category: "ACCESS_CONTROL",
      severity: "CRITICAL",
      verificationStatus: "VERIFIED",
      remediation: "Test kaydını inceleyin.",
      evidence: { source: "integration-test" },
    },
  });
  const oldPreferences = await prisma.adminInboxPreference.findUnique({
    where: { adminId: admin.id },
  });

  try {
    const permissions = [
      "inbox.read",
      "inbox.manage",
      "security.read",
    ] as const;
    const initial = await getAdminInbox(admin.id, permissions, "ALL", false);
    const item = initial.items.find(
      (candidate) => candidate.sourceId === finding.id,
    );
    assert.ok(
      item,
      "Yetkili admin güvenlik bulgusunu gelen kutusunda görmeli.",
    );
    assert.equal(item.priority, "CRITICAL");

    await updateInboxItem(admin.id, {
      category: "SECURITY",
      sourceId: finding.id,
      action: "READ",
    });
    await updateInboxItem(admin.id, {
      category: "SECURITY",
      sourceId: finding.id,
      action: "ASSIGN",
      ownerId: admin.id,
    });
    const mine = await getAdminInbox(admin.id, permissions, "MINE", false);
    const assigned = mine.items.find(
      (candidate) => candidate.sourceId === finding.id,
    );
    assert.ok(assigned?.readAt, "Okunma durumu kullanıcı için saklanmalı.");
    assert.equal(
      assigned.ownerId,
      admin.id,
      "Ortak görev sahipliği saklanmalı.",
    );

    await updateInboxItem(admin.id, {
      category: "SECURITY",
      sourceId: finding.id,
      action: "RESOLVE",
    });
    const active = await getAdminInbox(admin.id, permissions, "ALL", false);
    assert.equal(
      active.items.some((candidate) => candidate.sourceId === finding.id),
      false,
    );
    const resolved = await getAdminInbox(admin.id, permissions, "ALL", true);
    assert.ok(
      resolved.items.find((candidate) => candidate.sourceId === finding.id)
        ?.resolvedAt,
    );

    await updateInboxPreferences(admin.id, {
      approvals: true,
      security: false,
      incidents: true,
      expirations: true,
    });
    const hidden = await getAdminInbox(admin.id, permissions, "ALL", true);
    assert.equal(
      hidden.items.some((candidate) => candidate.sourceId === finding.id),
      false,
    );
  } finally {
    await prisma.adminInboxItemState.deleteMany({
      where: { sourceType: "SECURITY", sourceId: finding.id },
    });
    await prisma.adminInboxTaskState.deleteMany({
      where: { sourceType: "SECURITY", sourceId: finding.id },
    });
    await prisma.platformSecurityFinding.delete({ where: { id: finding.id } });
    if (oldPreferences) {
      await prisma.adminInboxPreference.update({
        where: { adminId: admin.id },
        data: {
          approvals: oldPreferences.approvals,
          security: oldPreferences.security,
          incidents: oldPreferences.incidents,
          expirations: oldPreferences.expirations,
        },
      });
    } else {
      await prisma.adminInboxPreference.deleteMany({
        where: { adminId: admin.id },
      });
    }
  }
  console.log(
    "Admin inbox integration: OK (visibility, read state, ownership, resolution, preferences)",
  );
}

main().finally(() => prisma.$disconnect());
