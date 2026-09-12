export const ADMIN_LOCALES = ["tr-TR"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export type AdminUiDensity = "COMFORTABLE" | "COMPACT";
export interface AdminUiPreferences {
  locale: AdminLocale;
  highContrast: boolean;
  reduceMotion: boolean;
  density: AdminUiDensity;
}
