import { z } from "zod";

export const adminGlobalSearchSchema = z.object({
  q: z.string().trim().min(2).max(100),
});
