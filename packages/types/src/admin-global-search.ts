export type AdminGlobalSearchKind =
  | "TENANT"
  | "USER"
  | "INVOICE"
  | "INTEGRATION"
  | "JOB"
  | "REQUEST"
  | "TICKET";

export interface AdminGlobalSearchResult {
  id: string;
  kind: AdminGlobalSearchKind;
  title: string;
  subtitle: string;
  tenantId: string | null;
  href: string;
  status: string | null;
}

export interface AdminGlobalSearchResponse {
  query: string;
  results: AdminGlobalSearchResult[];
  truncated: boolean;
}
