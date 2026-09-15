import { useQuery } from "@tanstack/react-query";
import {
  getExecutiveDashboard,
  getProcurementDashboard,
  getProductionDashboard,
} from "../api/basic-dashboard.api";

export const useExecutiveDashboard = (enabled: boolean) =>
  useQuery({
    queryKey: ["basic-dashboard", "executive"],
    queryFn: getExecutiveDashboard,
    enabled,
    staleTime: 60_000,
  });
export const useProductionDashboard = (enabled: boolean) =>
  useQuery({
    queryKey: ["basic-dashboard", "production"],
    queryFn: getProductionDashboard,
    enabled,
    staleTime: 60_000,
  });
export const useProcurementDashboard = (enabled: boolean) =>
  useQuery({
    queryKey: ["basic-dashboard", "procurement"],
    queryFn: getProcurementDashboard,
    enabled,
    staleTime: 60_000,
  });
