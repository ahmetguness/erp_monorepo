export interface TenantSupportNote {
  id: string;
  body: string;
  ticketId: string | null;
  createdAt: string;
  author: { id: string; name: string; email: string };
}
export interface Tenant360Snapshot {
  tenantId: string;
  companyName: string;
  generatedAt: string;
  health: { status: "ATTENTION" | "OK"; reasons: string[] };
  usage: {
    metrics: Array<{
      key: "users" | "products" | "warehouses" | "apiKeys" | "storage";
      label: string;
      used: number;
      limit: number | null;
      unit: "count" | "bytes";
      percent: number | null;
      status: "ok" | "warning" | "full" | "unlimited";
    }>;
    dailyActivity: Array<{ date: string; actions: number; users: number }>;
    activitySource: string;
  };
  subscription: {
    plan: string;
    status: string;
    trialEndsAt: string | null;
    start: string | null;
    end: string | null;
    userPrice: string | null;
    customPricing: boolean;
    billingNote: string;
  };
  integrations: Array<{
    id: string;
    name: string;
    channel: string;
    isActive: boolean;
    lastSyncAt: string | null;
    syncErrors: number;
  }> | null;
  operations: {
    queue: Array<{ source: string; status: string; count: number }>;
    recentFailures: Array<{
      id: string;
      source: string;
      name: string;
      status: string;
      attempts: number;
      updatedAt: string;
    }>;
  } | null;
  security: {
    members: Array<{
      id: string;
      name: string;
      email: string;
      isActive: boolean;
      isOwner: boolean;
      role: string | null;
      lastTenantActivityAt: string | null;
    }>;
  } | null;
  changes: Array<{
    id: string;
    module: string;
    action: string;
    entityId: string;
    reason: string | null;
    ticketId: string | null;
    createdAt: string;
    admin: { id: string; name: string; email: string } | null;
  }> | null;
  support: TenantSupportNote[];
}
