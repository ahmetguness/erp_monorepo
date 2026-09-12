import type { AdminBulkNotePreview, AdminBulkOperationResult, AdminSavedListView, AdminTenantListConfig } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";
interface DataResponse<T> { data: T }
export async function listTenantViews(): Promise<AdminSavedListView[]> { return (await adminApiClient.get<DataResponse<AdminSavedListView[]>>("/api/admin/tenant-list-views")).data.data; }
export async function saveTenantView(name: string, config: AdminTenantListConfig): Promise<AdminSavedListView> { return (await adminApiClient.post<DataResponse<AdminSavedListView>>("/api/admin/tenant-list-views", { name, resource: "TENANTS", config })).data.data; }
export async function deleteTenantView(id: string): Promise<void> { await adminApiClient.delete(`/api/admin/tenant-list-views/${encodeURIComponent(id)}`); }
export async function previewBulkTenantNote(tenantIds: string[]): Promise<AdminBulkNotePreview> { return (await adminApiClient.post<DataResponse<AdminBulkNotePreview>>("/api/admin/tenants/bulk-note/preview", { tenantIds })).data.data; }
export async function executeBulkTenantNote(input: { tenantIds: string[]; reason: string; note: string; acknowledged: true }): Promise<AdminBulkOperationResult> { return (await adminApiClient.post<DataResponse<AdminBulkOperationResult>>("/api/admin/tenants/bulk-note", input)).data.data; }
export async function exportTenantCsv(config: AdminTenantListConfig): Promise<void> {
  const response = await adminApiClient.get<Blob>("/api/admin/tenants/export", { params: { ...config, columns: undefined }, responseType: "blob" });
  const url = URL.createObjectURL(response.data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "musteri-hesaplari.csv"; anchor.click(); URL.revokeObjectURL(url);
}
