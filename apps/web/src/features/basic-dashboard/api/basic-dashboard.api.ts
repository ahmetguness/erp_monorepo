import type { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { safeParse } from "@/lib/safe-parse";
import { SingleResponseSchema } from "@/types/api.types";
import {
  executiveDashboardSchema,
  procurementDashboardSchema,
  productionDashboardSchema,
} from "./basic-dashboard.schemas";

async function getDashboard<T>(
  path: string,
  schema: z.ZodType<T>,
  operation: string,
): Promise<T> {
  const response = await apiClient.get(path);
  return safeParse(SingleResponseSchema(schema), response.data, operation).data;
}

export const getExecutiveDashboard = () =>
  getDashboard(
    "/api/dashboard/basic/executive",
    executiveDashboardSchema,
    "getExecutiveDashboard",
  );
export const getProductionDashboard = () =>
  getDashboard(
    "/api/dashboard/basic/production",
    productionDashboardSchema,
    "getProductionDashboard",
  );
export const getProcurementDashboard = () =>
  getDashboard(
    "/api/dashboard/basic/procurement",
    procurementDashboardSchema,
    "getProcurementDashboard",
  );
