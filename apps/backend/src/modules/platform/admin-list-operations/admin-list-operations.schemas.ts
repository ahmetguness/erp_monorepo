import { z } from "zod";
const tenantStatusSchema = z.enum([
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "ARCHIVED",
  "DELETION_SCHEDULED",
  "DELETED",
]);
const tenantPlanSchema = z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]);
const validDateRange = (value: { from?: string; to?: string }): boolean =>
  !value.from || !value.to || value.from <= value.to;
const dateRangeMessage = {
  message: "Başlangıç tarihi bitiş tarihinden sonra olamaz.",
  path: ["to"],
};

export const tenantListConfigSchema = z
  .object({
    search: z.string().max(100).optional(),
    status: tenantStatusSchema.optional(),
    plan: tenantPlanSchema.optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    sortBy: z.enum(["createdAt", "companyName", "status", "plan"]),
    sortDirection: z.enum(["asc", "desc"]),
    columns: z
      .array(
        z.enum([
          "companyName",
          "status",
          "plan",
          "email",
          "city",
          "users",
          "createdAt",
        ]),
      )
      .min(1),
  })
  .strict()
  .refine(validDateRange, dateRangeMessage);
export const saveListViewSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    resource: z.literal("TENANTS"),
    config: tenantListConfigSchema,
  })
  .strict();
export const bulkPreviewSchema = z
  .object({ tenantIds: z.array(z.string().min(1)).min(1).max(100) })
  .strict();
export const bulkExecuteSchema = bulkPreviewSchema
  .extend({
    reason: z.string().trim().min(10).max(500),
    note: z.string().trim().min(3).max(1000),
    acknowledged: z.literal(true),
  })
  .strict();
export const tenantListQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    sortBy: z
      .enum(["createdAt", "companyName", "status", "plan"])
      .default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(validDateRange, dateRangeMessage);
export const tenantExportQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    sortBy: z
      .enum(["createdAt", "companyName", "status", "plan"])
      .default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().max(100).optional(),
    status: tenantStatusSchema.optional(),
    plan: tenantPlanSchema.optional(),
  })
  .refine(validDateRange, dateRangeMessage);
