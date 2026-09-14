import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { safeParse } from "@/lib/safe-parse";
import { SingleResponseSchema } from "@/types/api.types";

const checkSchema = z.object({
  key: z.enum([
    "opening_stock",
    "purchase_receipt",
    "sales_delivery",
    "reservation",
    "reservation_release",
    "production_consumption",
    "production_output",
    "return",
    "adjustment",
    "transfer",
    "lot_serial",
    "cost_valuation",
  ]),
  label: z.string(),
  status: z.enum(["PASS", "FAIL", "NOT_TESTED"]),
  evidenceCount: z.number(),
  violationCount: z.number(),
  detail: z.string(),
});
const reportSchema = z.object({
  decision: z.enum(["GO", "NO_GO"]),
  checks: z.array(checkSchema),
  summary: z.object({
    passed: z.number(),
    failed: z.number(),
    notTested: z.number(),
    total: z.number(),
  }),
  generatedAt: z.string(),
});
export type InventoryTruthGateReport = z.infer<typeof reportSchema>;

export async function getInventoryTruthGate(): Promise<InventoryTruthGateReport> {
  const response = await apiClient.get("/api/stock/truth-gate");
  return safeParse(
    SingleResponseSchema(reportSchema),
    response.data,
    "getInventoryTruthGate",
  ).data;
}
