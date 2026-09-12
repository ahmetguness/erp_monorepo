import { z } from "zod";
export const decisionDashboardQuerySchema = z.object({
  rangeDays: z
    .enum(["7", "30", "90"])
    .transform((value) => Number(value) as 7 | 30 | 90)
    .default(30),
});
