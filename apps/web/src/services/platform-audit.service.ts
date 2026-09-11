import type {
  PlatformAuditEntry,
  PlatformAuditFilters,
  PlatformAuditPage,
} from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

export async function getPlatformAudit(
  filters: PlatformAuditFilters,
): Promise<PlatformAuditPage> {
  const response = await adminApiClient.get<PlatformAuditPage>("/api/admin/audit-logs", {
    params: filters,
  });
  return response.data;
}
export async function getPlatformAuditEntry(
  id: string,
): Promise<PlatformAuditEntry> {
  const response = await adminApiClient.get<{ data: PlatformAuditEntry }>(
    `/api/admin/audit-logs/${id}`,
  );
  return response.data.data;
}
export async function setPlatformAuditRetention(
  retentionDays: number,
): Promise<number> {
  const response = await adminApiClient.put<{ data: { retentionDays: number } }>(
    "/api/admin/audit-logs/retention",
    { retentionDays },
  );
  return response.data.data.retentionDays;
}
export async function downloadPlatformAudit(
  filters: PlatformAuditFilters,
  format: "csv" | "json",
): Promise<void> {
  const response = await adminApiClient.get<Blob>("/api/admin/audit-logs/export", {
    params: { ...filters, page: undefined, limit: undefined, format },
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `platform-audit.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
