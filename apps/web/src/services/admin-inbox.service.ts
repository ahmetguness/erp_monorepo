import type {
  AdminInboxAction,
  AdminInboxCategory,
  AdminInboxPreferences,
  AdminInboxResponse,
} from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

interface DataResponse<T> {
  data: T;
}

export type InboxScope = "ALL" | "MINE" | "UNASSIGNED";

export async function getAdminInbox(
  scope: InboxScope,
  includeResolved: boolean,
): Promise<AdminInboxResponse> {
  const response = await adminApiClient.get<DataResponse<AdminInboxResponse>>(
    "/api/admin/inbox",
    { params: { scope, includeResolved } },
  );
  return response.data.data;
}

export async function updateAdminInboxItem(input: {
  category: AdminInboxCategory;
  sourceId: string;
  action: AdminInboxAction;
  ownerId?: string;
}): Promise<void> {
  await adminApiClient.post("/api/admin/inbox/actions", input);
}

export async function updateAdminInboxPreferences(
  preferences: AdminInboxPreferences,
): Promise<void> {
  await adminApiClient.put("/api/admin/inbox/preferences", preferences);
}
