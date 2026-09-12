import type { AdminUiPreferences } from "@repo/types";
import { prisma } from "../../../lib/prisma.js";

const defaults: AdminUiPreferences = {
  locale: "tr-TR",
  highContrast: false,
  reduceMotion: false,
  density: "COMFORTABLE",
};

export async function getAdminUiPreferences(
  adminId: string,
): Promise<AdminUiPreferences> {
  const row = await prisma.adminUiPreference.findUnique({ where: { adminId } });
  return row
    ? {
        locale: "tr-TR",
        highContrast: row.highContrast,
        reduceMotion: row.reduceMotion,
        density: row.density === "COMPACT" ? "COMPACT" : "COMFORTABLE",
      }
    : defaults;
}

export async function saveAdminUiPreferences(
  adminId: string,
  input: AdminUiPreferences,
): Promise<AdminUiPreferences> {
  const row = await prisma.adminUiPreference.upsert({
    where: { adminId },
    create: { adminId, ...input },
    update: input,
  });
  return {
    locale: "tr-TR",
    highContrast: row.highContrast,
    reduceMotion: row.reduceMotion,
    density: row.density === "COMPACT" ? "COMPACT" : "COMFORTABLE",
  };
}
