import { z } from "zod";
export const adminUiPreferencesSchema = z
  .object({
    locale: z.literal("tr-TR"),
    highContrast: z.boolean(),
    reduceMotion: z.boolean(),
    density: z.enum(["COMFORTABLE", "COMPACT"]),
  })
  .strict();
