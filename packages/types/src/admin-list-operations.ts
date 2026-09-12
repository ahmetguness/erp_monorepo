export type AdminTenantSortField =
  | "createdAt"
  | "companyName"
  | "status"
  | "plan";
export type SortDirection = "asc" | "desc";
export type AdminTenantColumn =
  | "companyName"
  | "status"
  | "plan"
  | "email"
  | "city"
  | "users"
  | "createdAt";
export interface AdminTenantListConfig {
  search?: string;
  status?: string;
  plan?: string;
  from?: string;
  to?: string;
  sortBy: AdminTenantSortField;
  sortDirection: SortDirection;
  columns: AdminTenantColumn[];
}
export interface AdminSavedListView {
  id: string;
  name: string;
  resource: "TENANTS" | "AUDIT";
  config: AdminTenantListConfig;
  createdAt: string;
}
export interface AdminBulkNotePreview {
  tenantIds: string[];
  foundCount: number;
  missingIds: string[];
  impactSummary: string;
}
export interface AdminBulkOperationResult {
  succeeded: Array<{ tenantId: string }>;
  failed: Array<{ tenantId: string; message: string }>;
}
