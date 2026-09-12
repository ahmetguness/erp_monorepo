import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  adminUiPreferencesSchema,
  getAdminUiPreferences,
  saveAdminUiPreferences,
} from "../src/modules/platform/admin-ui-preferences/index.js";

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  assert.ok(admin, "Arayüz tercihi testi için aktif admin gerekli.");
  const previous = await prisma.adminUiPreference.findUnique({
    where: { adminId: admin.id },
  });
  const input = {
    locale: "tr-TR",
    highContrast: true,
    reduceMotion: true,
    density: "COMPACT",
  } as const;
  assert.equal(adminUiPreferencesSchema.safeParse(input).success, true);
  assert.equal(
    adminUiPreferencesSchema.safeParse({ ...input, locale: "en-US" }).success,
    false,
  );
  try {
    const saved = await saveAdminUiPreferences(admin.id, input);
    assert.deepEqual(saved, input);
    assert.deepEqual(await getAdminUiPreferences(admin.id), input);
  } finally {
    if (previous) {
      await prisma.adminUiPreference.update({
        where: { adminId: admin.id },
        data: {
          locale: previous.locale,
          highContrast: previous.highContrast,
          reduceMotion: previous.reduceMotion,
          density: previous.density,
        },
      });
    } else {
      await prisma.adminUiPreference.deleteMany({
        where: { adminId: admin.id },
      });
    }
  }
  console.log(
    "Admin UI preferences integration: OK (validation, persistence, restoration)",
  );
}

main().finally(() => prisma.$disconnect());
